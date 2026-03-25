/**
 * Signed tokens for insured verify links and post-MFA upload sessions.
 * Uses INSURED_TOKEN_SECRET, or PROFILE_ACCESS_SECRET, or SESSION_SECRET.
 */

var crypto = require("crypto");

var VERIFY_TTL_SEC = 60 * 60 * 48;
var UPLOAD_TTL_SEC = 60 * 120;

function getSecret() {
  var s = (process.env.INSURED_TOKEN_SECRET || "").trim();
  if (s) return s;
  s = (process.env.PROFILE_ACCESS_SECRET || "").trim();
  if (s) return s;
  return (process.env.SESSION_SECRET || "").trim() || null;
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

function signPayload(payload) {
  var secret = getSecret();
  if (!secret) return null;
  var payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  var sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return payloadB64 + "." + sig;
}

function verifyPayload(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Invalid token." };
  }
  var trimmed = token.trim();
  var dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    return { ok: false, error: "Invalid token." };
  }
  var secret = getSecret();
  if (!secret) {
    return { ok: false, error: "Not configured." };
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
  if (!json || typeof json.exp !== "number") {
    return { ok: false, error: "Invalid token." };
  }
  var now = Math.floor(Date.now() / 1000);
  if (now > json.exp) {
    return { ok: false, error: "Token expired." };
  }
  return { ok: true, payload: json };
}

function signInsuredVerifyLink(insuredId, email) {
  var secret = getSecret();
  if (!secret) return null;
  var idNum = parseInt(insuredId, 10);
  if (isNaN(idNum) || idNum < 1) return null;
  var now = Math.floor(Date.now() / 1000);
  var exp = now + VERIFY_TTL_SEC;
  var payload = {
    typ: "insured_verify",
    id: idNum,
    email: String(email || "")
      .trim()
      .toLowerCase(),
    iat: now,
    exp: exp,
  };
  return signPayload(payload);
}

function verifyInsuredVerifyLink(token) {
  var v = verifyPayload(token);
  if (!v.ok) return v;
  var p = v.payload;
  if (!p || p.typ !== "insured_verify" || typeof p.id !== "number" || typeof p.email !== "string") {
    return { ok: false, error: "Invalid token." };
  }
  return { ok: true, insuredId: p.id, email: p.email };
}

function signInsuredUploadToken(insuredId) {
  var secret = getSecret();
  if (!secret) return null;
  var idNum = parseInt(insuredId, 10);
  if (isNaN(idNum) || idNum < 1) return null;
  var now = Math.floor(Date.now() / 1000);
  var exp = now + UPLOAD_TTL_SEC;
  var payload = {
    typ: "insured_upload",
    id: idNum,
    iat: now,
    exp: exp,
  };
  return signPayload(payload);
}

function verifyInsuredUploadToken(token) {
  var v = verifyPayload(token);
  if (!v.ok) return v;
  var p = v.payload;
  if (!p || p.typ !== "insured_upload" || typeof p.id !== "number") {
    return { ok: false, error: "Invalid token." };
  }
  return { ok: true, insuredId: p.id };
}

module.exports = {
  getSecret: getSecret,
  signInsuredVerifyLink: signInsuredVerifyLink,
  verifyInsuredVerifyLink: verifyInsuredVerifyLink,
  signInsuredUploadToken: signInsuredUploadToken,
  verifyInsuredUploadToken: verifyInsuredUploadToken,
};
