/**
 * POST { email, password } — sets uw_admin_session cookie (configure ADMIN_* in env).
 */

var crypto = require("crypto");
var adminSession = require("./lib/admin-session-token");

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

function passwordMatches(expected, input) {
  try {
    var a = crypto.createHash("sha256").update(String(expected), "utf8").digest();
    var b = crypto.createHash("sha256").update(String(input), "utf8").digest();
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
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
      return sendJson(res, 200, { ok: true, endpoint: "admin-login" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    var adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    var adminPass = process.env.ADMIN_PASSWORD;
    if (!adminEmail || adminPass == null || String(adminPass).length === 0) {
      return sendJson(res, 503, {
        error:
          "Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in Vercel environment variables (or .env for npm start).",
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
        return sendJson(res, 400, { error: "Invalid JSON body." });
      }
    }

    var email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    var pw = typeof body.password === "string" ? body.password : "";

    if (email !== adminEmail || !passwordMatches(adminPass, pw)) {
      return sendJson(res, 401, { error: "Invalid email or password." });
    }

    var tok = adminSession.signAdminToken(adminEmail);
    if (!tok) {
      return sendJson(res, 503, {
        error:
          "Set ADMIN_SESSION_SECRET, SESSION_SECRET, or PROFILE_ACCESS_SECRET so admin sessions can be signed.",
      });
    }

    return sendJson(
      res,
      200,
      { ok: true, redirect: "/admin.html" },
      { "Set-Cookie": adminSession.buildSetAdminCookieHeader(tok) }
    );
  } catch (fatal) {
    console.error("[admin-login] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
