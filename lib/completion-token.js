/**
 * One-time-style link after profile registration: finish account (password + optional logo).
 * Signed with COMPLETION_SECRET, or PROFILE_ACCESS_SECRET if unset.
 */

var crypto = require("crypto");
var profileAccess = require("./profile-access-token");

var DEFAULT_TTL = 60 * 60 * 24 * 7;

function getSecret() {
  var c = (process.env.COMPLETION_SECRET || "").trim();
  if (c) return c;
  return (process.env.PROFILE_ACCESS_SECRET || "").trim() || null;
}

function getTtlSeconds() {
  var n = parseInt(process.env.COMPLETION_TOKEN_TTL_SECONDS || String(DEFAULT_TTL), 10);
  if (!isFinite(n) || n < 300) return DEFAULT_TTL;
  if (n > 60 * 60 * 24 * 30) return 60 * 60 * 24 * 30;
  return n;
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

function signCompletionToken(email) {
  var secret = getSecret();
  if (!secret) return null;
  var normalized = String(email).trim().toLowerCase();
  if (!normalized) return null;
  var exp = Math.floor(Date.now() / 1000) + getTtlSeconds();
  var payloadB64 = Buffer.from(
    JSON.stringify({ e: normalized, exp: exp, typ: "complete" }),
    "utf8"
  ).toString("base64url");
  var sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return payloadB64 + "." + sig;
}

function verifyCompletionToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Invalid or missing link." };
  }
  var trimmed = token.trim();
  var dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    return { ok: false, error: "Invalid or missing link." };
  }
  var secret = getSecret();
  if (!secret) {
    return { ok: false, error: "Registration is not configured." };
  }
  var payloadB64 = trimmed.slice(0, dot);
  var sig = trimmed.slice(dot + 1);
  var expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!timingSafeEqualStr(expectedSig, sig)) {
    return { ok: false, error: "Invalid or expired link." };
  }
  var json;
  try {
    json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return { ok: false, error: "Invalid or expired link." };
  }
  if (!json || json.typ !== "complete" || typeof json.e !== "string" || typeof json.exp !== "number") {
    return { ok: false, error: "Invalid or expired link." };
  }
  var now = Math.floor(Date.now() / 1000);
  if (now > json.exp) {
    return { ok: false, error: "This link has expired. Contact info@underwritly.com for help." };
  }
  return { ok: true, email: json.e };
}

function buildCompleteRegistrationEmailLink(token, req) {
  if (!token) return "";
  var base = req
    ? profileAccess.getPublicSiteBaseForEmailFromRequest(req)
    : profileAccess.getPublicSiteBaseForEmail();
  if (!base) return "";
  return base + "/complete-registration.html?complete_token=" + encodeURIComponent(token);
}

module.exports = {
  signCompletionToken: signCompletionToken,
  verifyCompletionToken: verifyCompletionToken,
  buildCompleteRegistrationEmailLink: buildCompleteRegistrationEmailLink,
  hasCompletionSecret: function () {
    return !!getSecret();
  },
};
