/**
 * Profile registration: internal notification + confirmation email to the registrant.
 * Env: same as early-access (SMTP_USER, SMTP_PASS, MAIL_FROM, NOTIFY_EMAIL).
 */

var nodemailer = require("nodemailer");

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

    var internalText =
      "New profile registration\n\n" +
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

    var confirmSubject = "Profile registration received — Underwritly";
    var confirmText =
      "Hi " +
      d.name.split(/\s+/)[0] +
      ",\n\n" +
      "Thank you for registering your profile with Underwritly. We have saved your details and " +
      "sent this message as confirmation.\n\n" +
      "Our team may follow up at " +
      d.email +
      " when your account or onboarding steps are ready.\n\n" +
      "Questions? Reply to this email or write to info@underwritly.com.\n\n" +
      "— The Underwritly team";

    var confirmHtml =
      "<p>Hi " +
      escapeHtml(d.name.split(/\s+/)[0]) +
      ",</p>" +
      "<p>Thank you for registering your profile with <strong>Underwritly</strong>. We have saved your details and " +
      "sent this message as confirmation.</p>" +
      "<p>Our team may follow up at " +
      escapeHtml(d.email) +
      " when your account or onboarding steps are ready.</p>" +
      "<p>Questions? Reply to this email or contact " +
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
    } catch (err) {
      console.error("[profile-registration] sendMail", err && err.message, err && err.code, err);
      return sendJson(res, 502, {
        error:
          "We could not send the emails. Check Vercel logs for SMTP errors. Or email info@underwritly.com.",
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
