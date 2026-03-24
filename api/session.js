/**
 * GET — current user (from HttpOnly cookie), no secrets.
 */

var sessionLib = require("./lib/session-token");
var userStore = require("./lib/user-store");

function sendJson(res, status, obj) {
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function publicUser(record) {
  if (!record || typeof record !== "object") return null;
  return {
    email: record.email || "",
    name: record.name || "",
    company: record.company || "",
    role: record.role || "",
    phone: record.phone || "",
    logoDataUrl: record.logoDataUrl || null,
    completedAt: record.completedAt || "",
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cookie");
      return res.status(204).end();
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    var raw = sessionLib.getSessionTokenFromRequest(req);
    var v = sessionLib.verifySessionToken(raw);
    if (!v.ok) {
      return sendJson(res, 401, { ok: false, error: v.error });
    }

    var record;
    try {
      record = await userStore.getUser(v.email);
    } catch (e) {
      if (e && e.code === "STORE_CONFIG") {
        return sendJson(res, 503, { ok: false, error: "Account storage is not configured." });
      }
      throw e;
    }
    if (!record || !record.passwordHash) {
      return sendJson(res, 401, { ok: false, error: "Account not found or setup incomplete." });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    return sendJson(res, 200, { ok: true, user: publicUser(record) });
  } catch (fatal) {
    console.error("[session] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
