/**
 * POST login { email, password } — sets session cookie.
 * POST forgot_password { action: "forgot_password", email } — sends reset email.
 * POST reset_password { action: "reset_password", resetToken, password } — updates password.
 */

var passwordLib = require("../password");
var sessionLib = require("../session-token");
var userStore = require("../user-store");
var profileAccess = require("../profile-access-token");
var resetTokenLib = require("../password-reset-token");
var mailer = require("../mailer");

function sendJson(res, status, obj, extraHeaders) {
  if (extraHeaders && typeof extraHeaders === "object") {
    Object.keys(extraHeaders).forEach(function (k) {
      res.setHeader(k, extraHeaders[k]);
    });
  }
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
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
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method === "GET") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, { ok: true, endpoint: "login" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
      return sendJson(res, 405, { error: "Method not allowed" });
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
        return sendJson(res, 400, { error: "Invalid JSON body." });
      }
    }

    var action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "login";
    var email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    var pw = typeof body.password === "string" ? body.password : "";

    if (action === "forgot_password") {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: "Enter a valid email address." });
      }
      try {
        var maybeUser = await userStore.getUser(email);
        if (maybeUser && maybeUser.passwordHash) {
          var tok = resetTokenLib.signPasswordResetToken(email);
          var base = profileAccess.getPublicSiteBaseForEmailFromRequest(req);
          var link =
            tok && base
              ? base + "/reset-password.html?reset_token=" + encodeURIComponent(tok)
              : "";
          var transporter = mailer.createTransport();
          var from = mailer.getMailFrom();
          if (tok && link && transporter && from) {
            var first = (maybeUser.name || email).split(/\s+/)[0];
            await transporter.sendMail({
              from: from,
              to: email,
              replyTo: "info@underwritly.com",
              subject: "Reset your Underwritly password",
              text:
                "Hi " +
                first +
                ",\n\nUse this secure link to reset your password:\n\n" +
                link +
                "\n\nIf you did not request this, you can ignore this email.\n\n— The Underwritly team",
              html:
                "<p>Hi " +
                first +
                ",</p><p>Use this secure link to reset your password:</p><p><a href=\"" +
                link +
                "\" style=\"display:inline-block;padding:12px 20px;background:#1e40af;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;\">Reset password</a></p><p style=\"font-size:13px;color:#64748b;word-break:break-all;\">" +
                link +
                "</p><p>If you did not request this, you can ignore this email.</p><p>— The Underwritly team</p>",
            });
            try {
              transporter.close();
            } catch (ignore) {}
          }
        }
      } catch (e) {
        if (!(e && e.code === "STORE_CONFIG")) {
          console.error("[login] forgot_password", e);
        }
      }
      return sendJson(res, 200, {
        ok: true,
        message:
          "If an account exists for that email, we sent a password reset link. Check your inbox and spam folder.",
      });
    }

    if (action === "reset_password") {
      var tokReset =
        typeof body.resetToken === "string"
          ? body.resetToken.trim()
          : typeof body.token === "string"
            ? body.token.trim()
            : "";
      var verify = resetTokenLib.verifyPasswordResetToken(tokReset);
      if (!verify.ok) return sendJson(res, 403, { error: verify.error });
      var pwCheck = passwordLib.validatePasswordStrength(pw);
      if (!pwCheck.ok) return sendJson(res, 400, { error: pwCheck.error });
      var existingReset;
      try {
        existingReset = await userStore.getUser(verify.email);
      } catch (e) {
        if (e && e.code === "STORE_CONFIG") {
          return sendJson(res, 503, { error: "Account storage is not configured." });
        }
        throw e;
      }
      if (!existingReset || !existingReset.passwordHash) {
        return sendJson(res, 404, { error: "Account not found." });
      }
      var next = {};
      Object.keys(existingReset).forEach(function (k) {
        next[k] = existingReset[k];
      });
      next.passwordHash = passwordLib.hashPassword(pw);
      await userStore.putUser(verify.email, next);
      return sendJson(res, 200, { ok: true, redirect: "/login.html" });
    }

    if (!email || !pw) {
      return sendJson(res, 400, { error: "Email and password are required." });
    }

    var record;
    try {
      record = await userStore.getUser(email);
    } catch (e) {
      if (e && e.code === "STORE_CONFIG") {
        return sendJson(res, 503, { error: "Account storage is not configured." });
      }
      throw e;
    }
    if (!record || !record.passwordHash || !passwordLib.verifyPassword(pw, record.passwordHash)) {
      return sendJson(res, 401, { error: "Invalid email or password." });
    }

    var sess = sessionLib.signSessionToken(email);
    if (!sess) {
      return sendJson(res, 503, {
        error: "SESSION_SECRET or PROFILE_ACCESS_SECRET must be set for sign-in.",
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    return sendJson(
      res,
      200,
      { ok: true, redirect: "/dashboard.html" },
      { "Set-Cookie": sessionLib.buildSetSessionCookieHeader(sess) }
    );
  } catch (fatal) {
    console.error("[login] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
