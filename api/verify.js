/**
 * GET — combined token checks (Hobby plan: one function instead of two).
 *   ?profile_access=<token>  — early-access profile gate
 *   ?complete_token=<token>   — finish registration gate
 */

var querystring = require("querystring");
var tokenLib = require("./lib/profile-access-token");
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

function getQuery(req) {
  var q = req.query;
  if (q && typeof q === "object" && Object.keys(q).length > 0) return q;
  try {
    var u = req.url || "";
    var qi = u.indexOf("?");
    if (qi < 0) return {};
    return querystring.parse(u.slice(qi + 1));
  } catch (e) {
    return {};
  }
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

    var q = getQuery(req);
    var pa = q.profile_access;
    if (Array.isArray(pa)) pa = pa[0];
    var ct = q.complete_token;
    if (Array.isArray(ct)) ct = ct[0];

    var hasProfile = typeof pa === "string" && pa.length > 0;
    var hasComplete = typeof ct === "string" && ct.length > 0;

    if (hasProfile && hasComplete) {
      return sendJson(res, 400, {
        ok: false,
        error: "Send only profile_access or complete_token, not both.",
      });
    }

    if (hasProfile) {
      var v1 = tokenLib.verifyProfileAccessToken(pa);
      if (!v1.ok) {
        return sendJson(res, 403, { ok: false, error: v1.error });
      }
      return sendJson(res, 200, { ok: true, email: v1.email });
    }

    if (hasComplete) {
      var v2 = completionLib.verifyCompletionToken(ct);
      if (!v2.ok) {
        return sendJson(res, 403, { ok: false, error: v2.error });
      }
      return sendJson(res, 200, { ok: true, email: v2.email });
    }

    return sendJson(res, 400, {
      ok: false,
      error: "Missing profile_access or complete_token query parameter.",
    });
  } catch (fatal) {
    console.error("[verify] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
