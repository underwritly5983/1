/**
 * GET ?complete_token=<token> — { ok: true, email } or 403.
 */

var completionLib = require("./lib/completion-token");

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
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method === "GET") {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    var q = req.query || {};
    var raw = q.complete_token;
    if (Array.isArray(raw)) raw = raw[0];
    var t = typeof raw === "string" ? raw : "";

    var verified = completionLib.verifyCompletionToken(t);
    if (!verified.ok) {
      return sendJson(res, 403, { ok: false, error: verified.error });
    }

    return sendJson(res, 200, { ok: true, email: verified.email });
  } catch (fatal) {
    console.error("[verify-completion-token] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
