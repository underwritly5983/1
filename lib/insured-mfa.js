/**
 * 6-digit MFA codes for insured identity verification.
 */

var crypto = require("crypto");

function getMfaSecret() {
  var s = (process.env.INSURED_MFA_SECRET || "").trim();
  if (s) return s;
  return (process.env.PROFILE_ACCESS_SECRET || "").trim() || (process.env.SESSION_SECRET || "").trim() || null;
}

function generateSixDigitCode() {
  var n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

function hashMfaCode(code) {
  var secret = getMfaSecret();
  if (!secret) return null;
  var payload = "insured_mfa_v1:" + String(code || "").trim();
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyMfaCode(code, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;
  var candidate = hashMfaCode(code);
  if (!candidate) return false;
  try {
    var a = Buffer.from(candidate, "hex");
    var b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = {
  isConfigured: function () {
    return !!getMfaSecret();
  },
  generateSixDigitCode: generateSixDigitCode,
  hashMfaCode: hashMfaCode,
  verifyMfaCode: verifyMfaCode,
};
