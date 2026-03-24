/**
 * POST — clear admin session cookie.
 */

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

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method === "GET") {
      return sendJson(res, 200, { ok: true, endpoint: "admin-logout" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return sendJson(
      res,
      200,
      { ok: true },
      { "Set-Cookie": adminSession.buildClearAdminCookieHeader() }
    );
  } catch (fatal) {
    console.error("[admin-logout] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
