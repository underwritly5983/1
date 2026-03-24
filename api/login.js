/**
 * POST { email, password } — sets session cookie.
 */

var passwordLib = require("./lib/password");
var sessionLib = require("./lib/session-token");
var userStore = require("./lib/user-store");

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

    var email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    var pw = typeof body.password === "string" ? body.password : "";
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
