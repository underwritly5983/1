/**
 * Local dev: static files + Vercel-style API routes (early-access, verify-profile-access, profile-registration).
 * Plain `serve` / Live Server cannot run these — use `npm start` from this folder.
 *
 * Copy `.env.example` to `.env` and set SMTP_*, MAIL_FROM, PROFILE_ACCESS_SECRET (same value as on Vercel).
 * Optional: SITE_URL=http://localhost:PORT for clickable absolute links in confirmation emails.
 * Optional: USER_STORE=file to force local JSON storage when KV_* env vars are set but not for this project.
 */

var path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

var express = require("express");
var earlyAccessHandler = require("./api/early-access");
var profileRegistrationHandler = require("./api/profile-registration");
var verifyProfileAccessHandler = require("./api/verify-profile-access");
var verifyCompletionTokenHandler = require("./api/verify-completion-token");
var completeRegistrationHandler = require("./api/complete-registration");
var sessionHandler = require("./api/session");
var loginHandler = require("./api/login");
var logoutHandler = require("./api/logout");
var adminLoginHandler = require("./api/admin-login");
var adminLogoutHandler = require("./api/admin-logout");
var adminSessionHandler = require("./api/admin-session");
var adminSubmissionsHandler = require("./api/admin-submissions");
var healthHandler = require("./api/health");

var app = express();
var PORT = parseInt(process.env.PORT || "3456", 10);

var pass = (process.env.SMTP_PASS || "").trim();
if (!pass || /your-google-app-password|changeme/i.test(pass)) {
  console.warn(
    "[dev-server] SMTP_PASS missing or still a placeholder — edit .env with your Gmail App Password to send mail."
  );
}

var profileSecret = (process.env.PROFILE_ACCESS_SECRET || "").trim();
if (!profileSecret) {
  console.warn(
    "[dev-server] PROFILE_ACCESS_SECRET is not set — early-access confirmation emails will not include a profile registration link. Copy the same secret you use on Vercel into .env."
  );
}

var adminEmail = (process.env.ADMIN_EMAIL || "").trim();
var adminPass = process.env.ADMIN_PASSWORD;
if (!adminEmail || adminPass == null || String(adminPass).length === 0) {
  console.warn(
    "[dev-server] ADMIN_EMAIL / ADMIN_PASSWORD not set — back office login disabled until you add them to .env (see .env.example)."
  );
}

app.use(express.json({ limit: "3mb" }));

app.use(function (req, res, next) {
  console.log("[dev-server]", req.method, req.originalUrl || req.url);
  next();
});

function mountEarlyAccess(req, res) {
  return earlyAccessHandler(req, res);
}

app.all(["/api/early-access", "/api/early-access/"], mountEarlyAccess);

function mountProfileRegistration(req, res) {
  return profileRegistrationHandler(req, res);
}

app.all(
  ["/api/profile-registration", "/api/profile-registration/"],
  mountProfileRegistration
);

function mountVerifyProfileAccess(req, res) {
  return verifyProfileAccessHandler(req, res);
}

app.all(
  ["/api/verify-profile-access", "/api/verify-profile-access/"],
  mountVerifyProfileAccess
);

app.all(
  ["/api/verify-completion-token", "/api/verify-completion-token/"],
  function (req, res) {
    return verifyCompletionTokenHandler(req, res);
  }
);

app.all(
  ["/api/complete-registration", "/api/complete-registration/"],
  function (req, res) {
    return completeRegistrationHandler(req, res);
  }
);

app.all(["/api/session", "/api/session/"], function (req, res) {
  return sessionHandler(req, res);
});

app.all(["/api/login", "/api/login/"], function (req, res) {
  return loginHandler(req, res);
});

app.all(["/api/logout", "/api/logout/"], function (req, res) {
  return logoutHandler(req, res);
});

app.all(["/api/admin-login", "/api/admin-login/"], function (req, res) {
  return adminLoginHandler(req, res);
});

app.all(["/api/admin-logout", "/api/admin-logout/"], function (req, res) {
  return adminLogoutHandler(req, res);
});

app.all(["/api/admin-session", "/api/admin-session/"], function (req, res) {
  return adminSessionHandler(req, res);
});

app.all(["/api/admin-submissions", "/api/admin-submissions/"], function (req, res) {
  return adminSubmissionsHandler(req, res);
});

app.all(["/api/health", "/api/health/"], function (req, res) {
  return healthHandler(req, res);
});

app.use(
  express.static(path.join(__dirname), {
    index: ["index.html"],
    dotfiles: "ignore",
    fallthrough: true,
  })
);

app.use(function (req, res) {
  if (req.path.indexOf("/api") === 0) {
    res.status(404).json({
      error: "API not found",
      hint: "Use the Node dev server (npm start or dev.cmd), not plain serve or Live Server.",
    });
    return;
  }
  res.status(404).send("Not found");
});

var server = app.listen(PORT, function () {
  console.log("");
  console.log("============================================================");
  console.log("  Underwritly local server  http://localhost:" + PORT);
  console.log(
    "  APIs: early-access, verify-profile-access, profile-registration, verify-completion-token, complete-registration, session, login, logout, admin-*, health"
  );
  console.log("  Readiness: GET /api/health");
  console.log("  Back office: http://localhost:" + PORT + "/admin.html");
  console.log("  Set ADMIN_EMAIL + ADMIN_PASSWORD in .env (same vars on Vercel for production admin).");
  console.log("  If you see 404 on /api/*, you are NOT running this server —");
  console.log("  use: npm start   (not: npm run start:static / plain serve)");
  console.log("============================================================");
  console.log("");
  console.log("Set SMTP_* and MAIL_FROM in .env to test email sending.");
});

server.on("error", function (err) {
  if (err && err.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Close the other server or run: set PORT=3457 && dev.cmd");
    process.exit(1);
  }
  throw err;
});
