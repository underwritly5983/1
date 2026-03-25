/**
 * Short-lived HMAC token for opening the external IFTA app with identity + tenant context.
 * IFTA app must verify with the same secret (IFTA_SHARED_SECRET or SESSION_SECRET).
 */

var crypto = require("crypto");

var DEFAULT_TTL_SEC = 300;

function getSecret() {
  var s = (process.env.IFTA_SHARED_SECRET || "").trim();
  if (s) return s;
  s = (process.env.SESSION_SECRET || "").trim();
  if (s) return s;
  return (process.env.PROFILE_ACCESS_SECRET || "").trim() || null;
}

function launchTtlSeconds() {
  var raw = (process.env.IFTA_LAUNCH_TTL_SECONDS || "").trim();
  var n = parseInt(raw, 10);
  if (!isNaN(n) && n >= 60 && n <= 3600) return n;
  return DEFAULT_TTL_SEC;
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

/**
 * @param {object} payload — must include typ: "ifta_launch", exp (unix seconds)
 */
function signIftaLaunchToken(payload) {
  var secret = getSecret();
  if (!secret) return null;
  var payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  var sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return payloadB64 + "." + sig;
}

function verifyIftaLaunchToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing token." };
  }
  var trimmed = token.trim();
  var dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    return { ok: false, error: "Invalid token." };
  }
  var secret = getSecret();
  if (!secret) {
    return { ok: false, error: "Token verification is not configured." };
  }
  var payloadB64 = trimmed.slice(0, dot);
  var sig = trimmed.slice(dot + 1);
  var expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!timingSafeEqualStr(expectedSig, sig)) {
    return { ok: false, error: "Invalid token." };
  }
  var json;
  try {
    json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return { ok: false, error: "Invalid token." };
  }
  if (!json || json.typ !== "ifta_launch" || typeof json.exp !== "number") {
    return { ok: false, error: "Invalid token." };
  }
  var now = Math.floor(Date.now() / 1000);
  if (now > json.exp) {
    return { ok: false, error: "Token expired." };
  }
  return { ok: true, payload: json };
}

module.exports = {
  getSecret: getSecret,
  launchTtlSeconds: launchTtlSeconds,
  signIftaLaunchToken: signIftaLaunchToken,
  verifyIftaLaunchToken: verifyIftaLaunchToken,
};
