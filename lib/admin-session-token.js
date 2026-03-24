/**
 * HttpOnly cookie for local admin back office only (uw_admin_session).
 * Secret: ADMIN_SESSION_SECRET, or PROFILE_ACCESS_SECRET, or SESSION_SECRET.
 */

var crypto = require("crypto");

var SESSION_MAX_AGE_SEC = 60 * 60 * 8;
var COOKIE_NAME = "uw_admin_session";

function getSecret() {
  var s = (process.env.ADMIN_SESSION_SECRET || "").trim();
  if (s) return s;
  s = (process.env.SESSION_SECRET || "").trim();
  if (s) return s;
  return (process.env.PROFILE_ACCESS_SECRET || "").trim() || null;
}

function timingSafeEqualStr(a, b) {
  try {
    var ba = Buffer.from(String(a), "utf8");
    var bb = Buffer.from(String(b), "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (err) {
    return false;
  }
}

function signAdminToken(adminEmail) {
  var secret = getSecret();
  if (!secret) return null;
  var normalized = String(adminEmail).trim().toLowerCase();
  if (!normalized) return null;
  var now = Math.floor(Date.now() / 1000);
  var exp = now + SESSION_MAX_AGE_SEC;
  var payloadB64 = Buffer.from(
    JSON.stringify({ role: "admin", email: normalized, exp: exp, iat: now, typ: "admin_session" }),
    "utf8"
  ).toString("base64url");
  var sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return payloadB64 + "." + sig;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Not signed in." };
  }
  var trimmed = token.trim();
  var dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    return { ok: false, error: "Not signed in." };
  }
  var secret = getSecret();
  if (!secret) {
    return { ok: false, error: "Admin session is not configured." };
  }
  var payloadB64 = trimmed.slice(0, dot);
  var sig = trimmed.slice(dot + 1);
  var expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!timingSafeEqualStr(expectedSig, sig)) {
    return { ok: false, error: "Session invalid." };
  }
  var json;
  try {
    json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return { ok: false, error: "Session invalid." };
  }
  if (
    !json ||
    json.typ !== "admin_session" ||
    json.role !== "admin" ||
    typeof json.email !== "string" ||
    typeof json.exp !== "number"
  ) {
    return { ok: false, error: "Session invalid." };
  }
  var now = Math.floor(Date.now() / 1000);
  if (now > json.exp) {
    return { ok: false, error: "Session expired." };
  }
  var expectedEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (expectedEmail && json.email !== expectedEmail) {
    return { ok: false, error: "Session invalid." };
  }
  return { ok: true, email: json.email };
}

function parseCookies(header) {
  var out = {};
  if (!header || typeof header !== "string") return out;
  header.split(";").forEach(function (part) {
    var idx = part.indexOf("=");
    if (idx < 1) return;
    var k = part.slice(0, idx).trim();
    var v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getAdminTokenFromRequest(req) {
  var h = req.headers && req.headers.cookie;
  var cookies = parseCookies(h);
  return cookies[COOKIE_NAME] || "";
}

function buildSetAdminCookieHeader(tokenValue) {
  var useSecure =
    process.env.FORCE_INSECURE_COOKIE !== "1" &&
    (process.env.VERCEL === "1" || process.env.NODE_ENV === "production");
  var parts = [
    COOKIE_NAME + "=" + encodeURIComponent(tokenValue),
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=" + SESSION_MAX_AGE_SEC,
  ];
  if (useSecure) parts.push("Secure");
  return parts.join("; ");
}

function buildClearAdminCookieHeader() {
  var useSecure =
    process.env.FORCE_INSECURE_COOKIE !== "1" &&
    (process.env.VERCEL === "1" || process.env.NODE_ENV === "production");
  var parts = [COOKIE_NAME + "=", "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (useSecure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  COOKIE_NAME: COOKIE_NAME,
  signAdminToken: signAdminToken,
  verifyAdminToken: verifyAdminToken,
  getAdminTokenFromRequest: getAdminTokenFromRequest,
  buildSetAdminCookieHeader: buildSetAdminCookieHeader,
  buildClearAdminCookieHeader: buildClearAdminCookieHeader,
};
