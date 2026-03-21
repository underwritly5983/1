/**
 * Sends two emails via Nodemailer (SMTP):
 * 1) Internal notification to info@underwritly.com with all fields
 * 2) Confirmation to the submitter
 *
 * Env (Vercel project settings):
 *   SMTP_HOST — required (e.g. smtp.gmail.com, smtp.sendgrid.net)
 *   SMTP_PORT — optional, default 587 (use 465 with SMTP_SECURE=true if your provider requires it)
 *   SMTP_SECURE — optional, "true" for direct TLS (typical on port 465); omit/false for STARTTLS on 587
 *   SMTP_USER — required
 *   SMTP_PASS — required (app password or SMTP token)
 *   MAIL_FROM — required, e.g. "Underwritly <noreply@underwritly.com>"
 *   NOTIFY_EMAIL — optional, defaults to info@underwritly.com
 */

var nodemailer = require("nodemailer");

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

function createTransport() {
  var host = process.env.SMTP_HOST;
  var user = process.env.SMTP_USER;
  var pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  var transporter = createTransport();
  var from = process.env.MAIL_FROM;
  var notifyTo = process.env.NOTIFY_EMAIL || "info@underwritly.com";

  if (!transporter || !from) {
    return res.status(503).json({
      error:
        "Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM in the project environment.",
    });
  }

  var body;
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  if (body === undefined || body === null) {
    try {
      body = await readJsonBody(req);
    } catch (e) {
      if (e && e.message === "Payload too large") {
        return res.status(413).json({ error: "Request too large." });
      }
      return res.status(400).json({ error: "Invalid JSON body." });
    }
  }

  var validated = validatePayload(body);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
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

  var confirmSubject = "We received your early access request — Underwritly";
  var confirmText =
    "Hi " +
    d.name.split(/\s+/)[0] +
    ",\n\n" +
    "Thank you for your interest in Underwritly. We have received your early access request and " +
    "our team will review it shortly.\n\n" +
    "We are excited about the opportunity to help your organization streamline underwriting " +
    "with structured intelligence for IFTA, driver verification, fleet data, and regulatory reporting. " +
    "When onboarding opens for your profile, we will reach out at this email address with next steps.\n\n" +
    "If you have questions in the meantime, you can reply to this message or contact us at info@underwritly.com.\n\n" +
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
  } catch (err) {
    console.error("[early-access]", err);
    return res.status(502).json({
      error: "We could not send the emails. Please try again in a moment or email info@underwritly.com.",
    });
  }

  return res.status(200).json({ ok: true });
};
