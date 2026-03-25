var crypto = require("crypto");

var DEFAULT_TTL = 60 * 60 * 2;

function getSecret() {
  var s = (process.env.PASSWORD_RESET_SECRET || "").trim();
  if (s) return s;
  s = (process.env.SESSION_SECRET || "").trim();
  if (s) return s;
  s = (process.env.PROFILE_ACCESS_SECRET || "").trim();
  return s || null;
}

function getTtlSeconds() {
  var n = parseInt(process.env.PASSWORD_RESET_TTL_SECONDS || String(DEFAULT_TTL), 10);
  if (!isFinite(n) || n < 300) return DEFAULT_TTL;
  if (n > 60 * 60 * 24) return 60 * 60 * 24;
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

function signPasswordResetToken(email) {
  var secret = getSecret();
  if (!secret) return null;
  var normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  var exp = Math.floor(Date.now() / 1000) + getTtlSeconds();
  var nonce = crypto.randomBytes(8).toString("base64url");
  var payloadB64 = Buffer.from(
    JSON.stringify({ typ: "pw_reset", e: normalized, exp: exp, n: nonce }),
    "utf8"
  ).toString("base64url");
  var sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return payloadB64 + "." + sig;
}

function verifyPasswordResetToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Invalid or missing reset link." };
  }
  var trimmed = token.trim();
  var dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    return { ok: false, error: "Invalid or missing reset link." };
  }
  var secret = getSecret();
  if (!secret) {
    return { ok: false, error: "Password reset is not configured." };
  }
  var payloadB64 = trimmed.slice(0, dot);
  var sig = trimmed.slice(dot + 1);
  var expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!timingSafeEqualStr(expectedSig, sig)) {
    return { ok: false, error: "Invalid or expired reset link." };
  }
  var json;
  try {
    json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return { ok: false, error: "Invalid or expired reset link." };
  }
  if (!json || json.typ !== "pw_reset" || typeof json.e !== "string" || typeof json.exp !== "number") {
    return { ok: false, error: "Invalid or expired reset link." };
  }
  var now = Math.floor(Date.now() / 1000);
  if (now > json.exp) {
    return { ok: false, error: "This reset link has expired. Request a new one." };
  }
  return { ok: true, email: json.e };
}

module.exports = {
  signPasswordResetToken: signPasswordResetToken,
  verifyPasswordResetToken: verifyPasswordResetToken,
  hasResetSecret: function () {
    return !!getSecret();
  },
};
