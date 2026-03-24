var crypto = require("crypto");

var PREFIX = "scrypt$";

function hashPassword(plain) {
  var salt = crypto.randomBytes(16);
  var hash = crypto.scryptSync(String(plain), salt, 64);
  return PREFIX + salt.toString("base64url") + "$" + hash.toString("base64url");
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== "string" || stored.indexOf(PREFIX) !== 0) return false;
  var rest = stored.slice(PREFIX.length);
  var dollar = rest.indexOf("$");
  if (dollar < 1) return false;
  var saltB64 = rest.slice(0, dollar);
  var hashB64 = rest.slice(dollar + 1);
  var salt;
  var expected;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(hashB64, "base64url");
  } catch (e) {
    return false;
  }
  if (!salt.length || expected.length !== 64) return false;
  var actual = crypto.scryptSync(String(plain), salt, 64);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function validatePasswordStrength(plain) {
  var s = String(plain || "");
  if (s.length < 10) return { ok: false, error: "Password must be at least 10 characters." };
  if (s.length > 200) return { ok: false, error: "Password is too long." };
  if (!/[a-zA-Z]/.test(s)) return { ok: false, error: "Password must include a letter." };
  if (!/[0-9]/.test(s)) return { ok: false, error: "Password must include a number." };
  return { ok: true };
}

module.exports = {
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  validatePasswordStrength: validatePasswordStrength,
};
