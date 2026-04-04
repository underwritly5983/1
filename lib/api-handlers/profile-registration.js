/**
 * Profile registration: internal notification + email to the registrant with a completion link.
 * Env: same as early-access (SMTP_USER, SMTP_PASS, MAIL_FROM, NOTIFY_EMAIL), plus SITE_URL for links.
 * Saves a profile draft to Postgres / local file when storage is available.
 * POST body must include profileAccessToken from the early-access confirmation email link.
 */

var tokenLib = require("../profile-access-token");
var completionLib = require("../completion-token");
var userStore = require("../user-store");
var submissionsDb = require("../submissions-db");
var mailer = require("../mailer");
var earlyAccessReview = require("../early-access-review");

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
  var company = typeof body.company === "string" ? body.company.trim() : "";
  var role = typeof body.role === "string" ? body.role.trim() : "";
  var phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!name || name.length > 200) return { ok: false, error: "Name is required." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return { ok: false, error: "Valid email is required." };
  }
  if (!company || company.length > 200) return { ok: false, error: "Company is required." };
  if (!role || role.length > 120) return { ok: false, error: "Job title or role is required." };
  if (!phone || phone.replace(/\D/g, "").length < 10 || phone.length > 50) {
    return { ok: false, error: "Valid phone is required." };
  }

  return {
    ok: true,
    data: {
      name: name,
      email: email,
      company: company,
      role: role,
      phone: phone,
      submittedAt: typeof body.submittedAt === "string" ? body.submittedAt : new Date().toISOString(),
    },
  };
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
      return sendJson(res, 200, { ok: true, endpoint: "profile-registration" });
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

    var transporter = mailer.createTransport();
    var from = mailer.getMailFrom();
    var notifyTo = mailer.getNotifyEmail();

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

    var accessTok =
      typeof body.profileAccessToken === "string" ? body.profileAccessToken.trim() : "";
    var verified = tokenLib.verifyProfileAccessToken(accessTok);
    if (!verified.ok) {
      return sendJson(res, 403, { error: verified.error });
    }
    if (verified.email !== validated.data.email.trim().toLowerCase()) {
      return sendJson(res, 403, {
        error: "Work email must match the address from your early access confirmation link.",
      });
    }

    var d = validated.data;

    try {
      await userStore.putProfileDraft(d.email.trim().toLowerCase(), {
        name: d.name,
        email: d.email,
        company: d.company,
        role: d.role,
        phone: d.phone,
        submittedAt: d.submittedAt,
      });
    } catch (draftErr) {
      console.error("[profile-registration] putProfileDraft", draftErr);
    }

    var completionTok = completionLib.signCompletionToken(d.email);
    var completeLink = completionLib.buildCompleteRegistrationEmailLink(completionTok || "", req);

    var siteBase = tokenLib.getPublicSiteBaseForEmailFromRequest(req);
    var adminBackOfficeLine = siteBase
      ? "Review & approve early access in Back office: " + siteBase + "/admin.html"
      : "Review & approve early access in Back office (set SITE_URL in env for a direct link).";

    var internalText =
      "New profile registration — action: approve early access in Back office\n\n" +
      adminBackOfficeLine +
      "\n\n" +
      "Full name: " +
      d.name +
      "\n" +
      "Email: " +
      d.email +
      "\n" +
      "Company: " +
      d.company +
      "\n" +
      "Role: " +
      d.role +
      "\n" +
      "Phone: " +
      d.phone +
      "\n" +
      "Submitted at (ISO): " +
      d.submittedAt;

    var internalHtml =
      (siteBase
        ? "<p style=\"background:#fef3c7;padding:12px 14px;border-radius:8px;font-size:14px;margin:0 0 16px;\"><strong>Action required:</strong> Open <a href=\"" +
          escapeHtml(siteBase + "/admin.html") +
          "\">Back office</a> to review and approve early access for this registrant.</p>"
        : "<p style=\"background:#fef3c7;padding:12px 14px;border-radius:8px;font-size:14px;margin:0 0 16px;\"><strong>Action required:</strong> Open Back office to review and approve early access (set SITE_URL in env for a direct link to /admin.html).</p>") +
      "<h2>New profile registration</h2>" +
      "<table style=\"border-collapse:collapse;font-family:sans-serif;font-size:14px;\">" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Full name</td><td>" +
      escapeHtml(d.name) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Email</td><td>" +
      escapeHtml(d.email) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Company</td><td>" +
      escapeHtml(d.company) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Role</td><td>" +
      escapeHtml(d.role) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Phone</td><td>" +
      escapeHtml(d.phone) +
      "</td></tr>" +
      "<tr><td style=\"padding:6px 12px 6px 0;font-weight:600;\">Submitted at</td><td>" +
      escapeHtml(d.submittedAt) +
      "</td></tr>" +
      "</table>";

    var confirmSubject = "Profile received — next: complete your account — Underwritly";
    var firstName = d.name.split(/\s+/)[0];
    var completeParagraphText = completeLink
      ? "To finish setting up your account, open this link (or paste it into your browser). You'll choose a password (required) and can upload your company logo (optional). After that you'll be signed in to your dashboard:\n\n" +
        completeLink +
        "\n\n"
      : "Finish setting up your account by choosing a password and optional company logo on our site. If this message does not include a button or link, your administrator may need to set SITE_URL for this project, or you can email info@underwritly.com and we'll help.\n\n";

    var confirmText =
      "Hi " +
      firstName +
      ",\n\n" +
      "Your broker profile has been registered successfully with Underwritly. We're glad you're here.\n\n" +
      completeParagraphText +
      "This link is private; don't forward it. If it expires, reply to this email or write to info@underwritly.com.\n\n" +
      "— The Underwritly team";

    var completeBlockHtml = completeLink
      ? "<p><strong>Next step:</strong> choose your password (required) and optionally upload your company logo. Then you'll land in your dashboard.</p>" +
        '<p style="margin:1.25rem 0;"><a href="' +
        escapeHtml(completeLink) +
        '" style="display:inline-block;padding:12px 22px;background:#1e40af;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Complete registration</a></p>' +
        "<p style=\"font-size:13px;color:#64748b;word-break:break-all;\">If the button doesn't work, copy and paste this URL:<br/>" +
        escapeHtml(completeLink) +
        "</p>"
      : "<p><strong>Next step:</strong> your team still needs to configure the public site URL so we can send you a secure completion link. Email " +
        '<a href="mailto:info@underwritly.com">info@underwritly.com</a> if you need help.</p>';

    var confirmHtml =
      "<p>Hi " +
      escapeHtml(firstName) +
      ",</p>" +
      "<p>Congratulations — your broker profile is set up with <strong>Underwritly</strong>. We're glad you're here.</p>" +
      completeBlockHtml +
      "<p>This link is private; don't forward it. If it expires, reply to this email or contact " +
      '<a href="mailto:info@underwritly.com">info@underwritly.com</a>.</p>' +
      "<p>— The Underwritly team</p>";

    try {
      await transporter.sendMail({
        from: from,
        to: notifyTo,
        replyTo: d.email,
        subject: "Profile registration: " + d.name + " — " + d.company,
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

      await submissionsDb.insertProfileRegistration(d);
      try {
        await earlyAccessReview.upsertPendingFromProfile(d);
      } catch (pendingErr) {
        console.error("[profile-registration] upsertPendingFromProfile", pendingErr && pendingErr.message);
      }
    } catch (err) {
      console.error("[profile-registration] sendMail", err && err.message, err && err.code, err);
      return sendJson(res, 502, {
        error:
          "We could not send the emails. Check your hosting logs for SMTP errors. Or email info@underwritly.com.",
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
    console.error("[profile-registration] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
