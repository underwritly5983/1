/**
 * Single serverless entry for all /api/* routes (Vercel Hobby: max 12 functions per deployment).
 * Route handlers: lib/api-handlers/*.js
 */

var handlers = {
  "early-access": require("../lib/api-handlers/early-access"),
  "profile-registration": require("../lib/api-handlers/profile-registration"),
  verify: require("../lib/api-handlers/verify"),
  "complete-registration": require("../lib/api-handlers/complete-registration"),
  session: require("../lib/api-handlers/session"),
  login: require("../lib/api-handlers/login"),
  logout: require("../lib/api-handlers/logout"),
  "admin-login": require("../lib/api-handlers/admin-login"),
  "admin-logout": require("../lib/api-handlers/admin-logout"),
  "admin-session": require("../lib/api-handlers/admin-session"),
  "admin-submissions": require("../lib/api-handlers/admin-submissions"),
  health: require("../lib/api-handlers/health"),
  team: require("../lib/api-handlers/team"),
  "complete-sub-broker": require("../lib/api-handlers/complete-sub-broker"),
};

function send404(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
}

function firstRouteSegment(req) {
  var raw = req.query && req.query.path;
  if (raw != null && raw !== "") {
    if (Array.isArray(raw)) return raw[0] || "";
    var s = String(raw);
    if (s.indexOf("/") >= 0) return s.split("/")[0];
    return s;
  }
  try {
    var u = typeof req.url === "string" ? req.url : "";
    var q = u.indexOf("?");
    var pathPart = q >= 0 ? u.slice(0, q) : u;
    var m = pathPart.match(/^\/api\/([^/?]+)/);
    if (m) return m[1];
  } catch (e) {
    /* ignore */
  }
  return "";
}

module.exports = async function handler(req, res) {
  var route = firstRouteSegment(req);
  if (!route) {
    return send404(res);
  }
  var h = handlers[route];
  if (!h || typeof h !== "function") {
    return send404(res);
  }
  return h(req, res);
};
