/**
 * Sends two emails via Nodemailer (SMTP):
 * 1) Internal notification to info@underwritly.com with all fields
 * 2) Confirmation to the submitter
 *
 * Env (Vercel project settings):
 *   SMTP_HOST — optional for Gmail; use smtp.gmail.com or leave unset to use Gmail preset
 *   SMTP_PORT / SMTP_SECURE — optional; ignored when using Gmail service preset
 *   SMTP_USER — required (full Gmail address)
 *   SMTP_PASS — required (Google App Password, spaces optional)
 *   MAIL_FROM — required; should match SMTP_USER for Gmail (e.g. "Name <you@gmail.com>")
 *   NOTIFY_EMAIL — optional, defaults to info@underwritly.com
 *   PROFILE_ACCESS_SECRET — required for the profile registration link in the confirmation email
 *   SITE_URL or PUBLIC_SITE_URL — required for the profile link in confirmation email (never uses VERCEL_URL in email)
 *   PROFILE_ACCESS_TTL_SECONDS — optional, default 30 days
 */

var nodemailer = require("nodemailer");
var profileAccess = require("../lib/profile-access-token");
var submissionsDb = require("../lib/submissions-db");

var SOURCE_LABELS = {
  search: "Search engine",
  social: "Social media",
  referral: "Colleague or referral",
  event: "Conference or industry event",
  other: "Other",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validatePayload(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  var name = typeof body.name === "string" ? body.name.trim() : "";
  var email = typeof body.email === "string" ? body.email.trim() : "";
  var phone = typeof body.phone === "string" ? body.phone.trim() : "";
  var source = typeof body.source === "string" ? body.source : "";
  var usage = typeof body.usage === "string" ? body.usage : "";

  if (!name || name.length > 200) return { ok: false, error: "Name is required." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return { ok: false, error: "Valid work email is required." };
  }
  if (!phone || phone.replace(/\D/g, "").length < 10 || phone.length > 50) {
    return { ok: false, error: "Valid phone is required." };
  }
  if (!SOURCE_LABELS[source]) return { ok: false, error: "Referral source is required." };
  if (!/^(1-5|5-10|10-25|25\+)$/.test(usage)) return { ok: false, error: "Usage range is required." };

  return {
    ok: true,
    data: {
      name: name,
      email: email,
      phone: phone,
      source: source,
      usage: usage,
      submittedAt: typeof body.submittedAt === "string" ? body.submittedAt : new Date().toISOString(),
    },
  };
}

/**
 * Gmail: use built-in "gmail" service (correct host/port/TLS).
 * Other hosts: explicit SMTP_* from env.
 */
function createTransport() {
  var user = (process.env.SMTP_USER || "").trim();
  var passRaw = process.env.SMTP_PASS || "";
  var pass = String(passRaw).replace(/\s+/g, "").trim();
  var host = (process.env.SMTP_HOST || "").trim().toLowerCase();

  if (!user || !pass) {
    return null;
  }

  var useGmailPreset =
    !host || host === "smtp.gmail.com" || process.env.SMTP_USE_GMAIL === "true";

  if (useGmailPreset) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: user,
        pass: pass,
      },
      pool: false,
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    });
  }

  var port = parseInt(process.env.SMTP_PORT || "587", 10);
  var secureEnv = process.env.SMTP_SECURE;
  var secure = secureEnv === "true" || secureEnv === "1" || port === 465;

  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: secure,
    auth: {
      user: user,
      pass: pass,
    },
    pool: false,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    var data = "";
    req.on("data", function (chunk) {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", function () {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method === "GET") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, { ok: true, endpoint: "early-access" });
    }

    if (req.method === "HEAD") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      return res.end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    var transporter = createTransport();
    var from = (process.env.MAIL_FROM || "").trim();
    var notifyTo = (process.env.NOTIFY_EMAIL || "info@underwritly.com").trim();

    if (!transporter || !from) {
      return sendJson(res, 503, {
        error:
          "Email is not configured. Set SMTP_USER, SMTP_PASS, and MAIL_FROM in the project environment.",
      });
    }

    var body;
    try {
      body = req.body;
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
    if (body === undefined || body === null) {
      try {
        body = await readJsonBody(req);
      } catch (e) {
        if (e && e.message === "Payload too large") {
          return sendJson(res, 413, { error: "Request too large." });
        }
        return sendJson(res, 400, { error: "Invalid JSON body." });
      }
    }

    var validated = validatePayload(body);
    if (!validated.ok) {
      return sendJson(res, 400, { error: validated.error });
    }

    var d = validated.data;
    var sourceLabel = SOURCE_LABELS[d.source] || d.source;

    var internalText =
      "New early access request\n\n" +
      "Full name: " +
      d.name +
      "\n" +
      "Work email: " +
      d.email +
      "\n" +
      "Phone: " +
      d.phone +
      "\n" +
      "Referral source: " +
      sourceLabel +
      "\n" +
      "Estimated uses per month: " +
      d.usage +
      "\n" +
      "Submitted at (ISO): " +
      d.submittedAt;

    var internalHtml =
      "<h2>New early access request</h2>" +
      "<table style=\"border-collapse:collapse;font-family:sans-serif;font-size:14px;\">" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Full name</td><td>" +
      escapeHtml(d.name) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Work email</td><td>" +
      escapeHtml(d.email) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Phone</td><td>" +
      escapeHtml(d.phone) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Referral source</td><td>" +
      escapeHtml(sourceLabel) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Estimated uses / month</td><td>" +
      escapeHtml(d.usage) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Submitted at</td><td>" +
      escapeHtml(d.submittedAt) +
      "</td></tr>" +
      "</table>";

    var profileToken = profileAccess.signProfileAccessToken(d.email);
    var profileLink = profileToken ? profileAccess.buildProfileRegistrationEmailLink(profileToken) : "";
    if (!profileAccess.hasSigningSecret()) {
      console.warn("[early-access] PROFILE_ACCESS_SECRET is not set; confirmation email will not include a profile registration link.");
    } else if (profileToken && !profileLink) {
      console.warn(
        "[early-access] SITE_URL or PUBLIC_SITE_URL is not set — confirmation email cannot include a profile link (deployment URLs are not used in customer email). Set SITE_URL to your public site, e.g. https://yourdomain.com"
      );
    }

    var registerBlurbText = "";
    var registerBlurbHtml = "";
    if (profileLink) {
      registerBlurbText =
        "\n\nNext step — register your broker profile (private link for this email only; do not forward):\n" +
        profileLink +
        "\n";
      registerBlurbHtml =
        "<p><strong>Next step:</strong> complete your broker profile using the button below. " +
        "It only works for this email address—please do not forward it.</p>" +
        "<p><a href=\"" +
        escapeHtml(profileLink) +
        "\" style=\"display:inline-block;padding:12px 20px;background:#059669;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;\">Register your profile</a></p>";
    } else if (profileToken && profileAccess.hasSigningSecret()) {
      registerBlurbText =
        "\n\nWe will follow up with a secure link to complete your broker profile.\n";
      registerBlurbHtml =
        "<p><strong>Next step:</strong> we will follow up with a secure link to complete your broker profile.</p>";
    }

    var confirmSubject = "We received your early access request — Underwritly";
    var confirmText =
      "Hi " +
      d.name.split(/\s+/)[0] +
      ",\n\n" +
      "Thank you for your interest in Underwritly. We have received your early access request and " +
      "our team will review it shortly.\n\n" +
      "We are excited about the opportunity to help your organization streamline underwriting " +
      "with structured intelligence for IFTA, driver verification, fleet data, and regulatory reporting. " +
      "When onboarding opens for your profile, we will reach out at this email address with next steps." +
      registerBlurbText +
      "\nIf you have questions in the meantime, you can reply to this message or contact us at info@underwritly.com.\n\n" +
      "— The Underwritly team";

    var confirmHtml =
      "<p>Hi " +
      escapeHtml(d.name.split(/\s+/)[0]) +
      ",</p>" +
      "<p>Thank you for your interest in <strong>Underwritly</strong>. We have received your early access request and " +
      "our team will review it shortly.</p>" +
      "<p>We are excited about the opportunity to help your organization streamline underwriting " +
      "with structured intelligence for IFTA, driver verification, fleet data, and regulatory reporting. " +
      "When onboarding opens for your profile, we will reach out at this email address with next steps.</p>" +
      registerBlurbHtml +
      "<p>If you have questions in the meantime, you can reply to this message or contact us at " +
      '<a href="mailto:info@underwritly.com">info@underwritly.com</a>.</p>' +
      "<p>— The Underwritly team</p>";

    try {
      await transporter.sendMail({
        from: from,
        to: notifyTo,
        replyTo: d.email,
        subject: "Early access request: " + d.name,
        text: internalText,
        html: internalHtml,
      });

      await transporter.sendMail({
        from: from,
        to: d.email,
        replyTo: "info@underwritly.com",
        subject: confirmSubject,
        text: confirmText,
        html: confirmHtml,
      });

      await submissionsDb.insertEarlyAccess(d);
    } catch (err) {
      console.error("[early-access] sendMail", err && err.message, err && err.code, err);
      return sendJson(res, 502, {
        error:
          "We could not send the emails. Check your hosting logs for SMTP errors. If you use Gmail, confirm App Password and that MAIL_FROM matches SMTP_USER. Or email info@underwritly.com.",
      });
    } finally {
      try {
        transporter.close();
      } catch (closeErr) {
        /* ignore */
      }
    }

    return sendJson(res, 200, { ok: true });
  } catch (fatal) {
    console.error("[early-access] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
