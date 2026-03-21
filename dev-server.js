/**
 * Local development server: static files + /api/early-access (same handler as Vercel).
 * Plain `serve` cannot run serverless functions — use `npm run dev` when testing the form.
 *
 * Create a `.env` file (gitignored) with SMTP_USER, SMTP_PASS, MAIL_FROM, etc., or export vars in your shell.
 */

var path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

var express = require("express");
var earlyAccessHandler = require("./api/early-access");

var app = express();
var PORT = parseInt(process.env.PORT || "3456", 10);

var pass = (process.env.SMTP_PASS || "").trim();
if (!pass || /your-google-app-password|changeme/i.test(pass)) {
  console.warn(
    "[dev-server] SMTP_PASS missing or still a placeholder — edit .env with your Gmail App Password to send mail."
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
  console.log("  Form API: POST /api/early-access (same as Vercel)");
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
