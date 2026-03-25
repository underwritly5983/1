/**
 * Shared Nodemailer SMTP (same env as early-access / profile-registration).
 */

var nodemailer = require("nodemailer");

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

function getMailFrom() {
  return (process.env.MAIL_FROM || "").trim();
}

function getNotifyEmail() {
  return (process.env.NOTIFY_EMAIL || "info@underwritly.com").trim();
}

module.exports = {
  createTransport: createTransport,
  getMailFrom: getMailFrom,
  getNotifyEmail: getNotifyEmail,
};
