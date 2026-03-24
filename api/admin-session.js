/**
 * GET — verify admin session cookie.
 */

var adminSession = require("../lib/admin-session-token");

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
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cookie");
      return res.status(204).end();
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    var raw = adminSession.getAdminTokenFromRequest(req);
    var v = adminSession.verifyAdminToken(raw);
    if (!v.ok) {
      return sendJson(res, 401, { ok: false, error: v.error });
    }

    return sendJson(res, 200, { ok: true, admin: true, email: v.email });
  } catch (fatal) {
    console.error("[admin-session] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
