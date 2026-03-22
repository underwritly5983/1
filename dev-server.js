/**
 * Local dev: static files + Vercel-style API routes (early-access, verify-profile-access, profile-registration).
 * Plain `serve` / Live Server cannot run these — use `npm start` from this folder.
 *
 * Copy `.env.example` to `.env` and set SMTP_*, MAIL_FROM, PROFILE_ACCESS_SECRET (same value as on Vercel).
 * Optional: SITE_URL=http://localhost:PORT for clickable absolute links in confirmation emails.
 */

var path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

var express = require("express");
var earlyAccessHandler = require("./api/early-access");
var profileRegistrationHandler = require("./api/profile-registration");
var verifyProfileAccessHandler = require("./api/verify-profile-access");

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

app.use(express.json({ limit: "1mb" }));

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
    "  APIs: POST /api/early-access, GET /api/verify-profile-access, POST /api/profile-registration"
  );
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
