/**
 * POST { completionToken, password, logoBase64?, logoMime? } — creates account, sets session cookie, redirects client to dashboard.
 */

var completionLib = require("../lib/completion-token");
var passwordLib = require("../lib/password");
var sessionLib = require("../lib/session-token");
var userStore = require("../lib/user-store");
var submissionsDb = require("../lib/submissions-db");
var companyKeyLib = require("../lib/company-key");

var LOGO_MAX_BYTES = 256 * 1024;
var ALLOWED_MIME = { "image/png": true, "image/jpeg": true, "image/webp": true };

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
      if (data.length > 3e6) {
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

function buildLogoDataUrl(mime, b64) {
  if (!b64 || !mime || !ALLOWED_MIME[mime]) return null;
  var buf;
  try {
    buf = Buffer.from(String(b64), "base64");
  } catch (e) {
    return null;
  }
  if (!buf.length || buf.length > LOGO_MAX_BYTES) return null;
  return "data:" + mime + ";base64," + buf.toString("base64");
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
      return sendJson(res, 200, { ok: true, endpoint: "complete-registration" });
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
        if (e && e.message === "Payload too large") {
          return sendJson(res, 413, { error: "Request too large." });
        }
        return sendJson(res, 400, { error: "Invalid JSON body." });
      }
    }

    var tok =
      typeof body.completionToken === "string" ? body.completionToken.trim() : "";
    var verified = completionLib.verifyCompletionToken(tok);
    if (!verified.ok) {
      return sendJson(res, 403, { error: verified.error });
    }

    var email = verified.email;
    var pw = typeof body.password === "string" ? body.password : "";
    var pwCheck = passwordLib.validatePasswordStrength(pw);
    if (!pwCheck.ok) {
      return sendJson(res, 400, { error: pwCheck.error });
    }

    var existing;
    try {
      existing = await userStore.getUser(email);
    } catch (e) {
      if (e && e.code === "STORE_CONFIG") {
        return sendJson(res, 503, {
          error:
            "Account storage is not configured. Set DATABASE_URL (PostgreSQL, e.g. Neon) in project settings.",
        });
      }
      throw e;
    }
    if (existing && existing.passwordHash) {
      return sendJson(res, 409, {
        error: "This account is already set up. Sign in from the login page.",
      });
    }

    var logoMime = typeof body.logoMime === "string" ? body.logoMime.trim() : "";
    var logoB64 = typeof body.logoBase64 === "string" ? body.logoBase64.trim() : "";
    var logoDataUrl = logoB64 ? buildLogoDataUrl(logoMime, logoB64) : null;
    if (logoB64 && !logoDataUrl) {
      return sendJson(res, 400, {
        error: "Logo must be PNG, JPEG, or WebP and at most 256 KB.",
      });
    }

    var draft = await userStore.getProfileDraft(email);
    var name = draft && typeof draft.name === "string" ? draft.name : "";
    var company = draft && typeof draft.company === "string" ? draft.company : "";
    var role = draft && typeof draft.role === "string" ? draft.role : "";
    var phone = draft && typeof draft.phone === "string" ? draft.phone : "";
    var profileSubmittedAt =
      draft && typeof draft.submittedAt === "string" ? draft.submittedAt : "";

    var record = {
      email: email,
      name: name,
      company: company,
      role: role,
      phone: phone,
      profileSubmittedAt: profileSubmittedAt,
      passwordHash: passwordLib.hashPassword(pw),
      logoDataUrl: logoDataUrl,
      completedAt: new Date().toISOString(),
      appRole: "",
      iftaAccess: false,
      companyKey: companyKeyLib.normalizeCompanyKey(company, email),
      accountType: "primary",
      primaryEmail: "",
      permissions: {},
    };

    await userStore.putUser(email, record);
    try {
      await userStore.deleteProfileDraft(email);
    } catch (delErr) {
      console.warn("[complete-registration] deleteProfileDraft", delErr);
    }

    await submissionsDb.insertAccountCompletion({
      email: email,
      name: name,
      company: company,
      completedAt: record.completedAt,
    });

    var sess = sessionLib.signSessionToken(email);
    if (!sess) {
      return sendJson(res, 503, {
        error:
          "SESSION_SECRET or PROFILE_ACCESS_SECRET must be set so we can sign you in.",
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
    console.error("[complete-registration] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
