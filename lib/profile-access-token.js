/**
 * Signed token: grants access to the profile registration flow for one email address.
 * Set PROFILE_ACCESS_SECRET (long random string) in Vercel / .env.
 * Optional: PROFILE_ACCESS_TTL_SECONDS (default 30 days).
 */

var crypto = require("crypto");

var DEFAULT_TTL = 60 * 60 * 24 * 30;

function getSecret() {
  var s = (process.env.PROFILE_ACCESS_SECRET || "").trim();
  return s || null;
}

function getTtlSeconds() {
  var n = parseInt(process.env.PROFILE_ACCESS_TTL_SECONDS || String(DEFAULT_TTL), 10);
  if (!isFinite(n) || n < 60) return DEFAULT_TTL;
  if (n > 60 * 60 * 24 * 365) return 60 * 60 * 24 * 365;
  return n;
}

function signProfileAccessToken(email) {
  var secret = getSecret();
  if (!secret) return null;
  var normalized = String(email).trim().toLowerCase();
  if (!normalized) return null;
  var exp = Math.floor(Date.now() / 1000) + getTtlSeconds();
  var payloadB64 = Buffer.from(JSON.stringify({ e: normalized, exp: exp }), "utf8").toString(
    "base64url"
  );
  var sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return payloadB64 + "." + sig;
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

function verifyProfileAccessToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Invalid or missing access link." };
  }
  var trimmed = token.trim();
  var dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    return { ok: false, error: "Invalid or missing access link." };
  }
  var secret = getSecret();
  if (!secret) {
    return { ok: false, error: "Registration is not configured." };
  }
  var payloadB64 = trimmed.slice(0, dot);
  var sig = trimmed.slice(dot + 1);
  var expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (!timingSafeEqualStr(expectedSig, sig)) {
    return { ok: false, error: "Invalid or expired registration link." };
  }
  var json;
  try {
    json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return { ok: false, error: "Invalid or expired registration link." };
  }
  if (!json || typeof json.e !== "string" || typeof json.exp !== "number") {
    return { ok: false, error: "Invalid or expired registration link." };
  }
  var now = Math.floor(Date.now() / 1000);
  if (now > json.exp) {
    return { ok: false, error: "This registration link has expired. Request early access again for a new link." };
  }
  return { ok: true, email: json.e };
}

/**
 * Base URL for links when there is no HTTP request (e.g. some batch paths).
 * Prefer SITE_URL / PUBLIC_SITE_URL / EMAIL_SITE_URL; last resort VERCEL_URL (can be preview-protected).
 */
function getPublicSiteBaseForEmail() {
  var explicit = (
    process.env.SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.EMAIL_SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;

  var vercel = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (!vercel) return "";
  if (!/^https?:\/\//i.test(vercel)) {
    vercel = "https://" + vercel;
  }
  return vercel;
}

function buildProfileRegistrationEmailLink(token) {
  if (!token) return "";
  var base = getPublicSiteBaseForEmail();
  if (!base) return "";
  return base + "/register.html?profile_access=" + encodeURIComponent(token);
}

/**
 * Base URL for links generated during an HTTP request (emails, redirects).
 *
 * Order matters for Vercel: if we used VERCEL_URL before the browser Host, insureds would get
 * links like https://*.vercel.app which often have Deployment Protection (Vercel login). Always
 * prefer SITE_URL / PUBLIC_SITE_URL / EMAIL_SITE_URL, then the request's public host (e.g.
 * www.underwritly.com), and only then VERCEL_URL.
 */
function getPublicSiteBaseForEmailFromRequest(req) {
  var explicit = (
    process.env.SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.EMAIL_SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;

  if (req && req.headers) {
    var host = req.headers["x-forwarded-host"] || req.headers.host;
    host = String(host || "").split(",")[0].trim().replace(/\/$/, "");
    if (host && !/localhost|127\.0\.0\.1/i.test(host)) {
      var proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim().toLowerCase();
      if (proto !== "http" && proto !== "https") proto = "https";
      return proto + "://" + host;
    }
  }

  return getPublicSiteBaseForEmail();
}

function buildProfileRegistrationEmailLinkFromRequest(token, req) {
  if (!token) return "";
  var base = getPublicSiteBaseForEmailFromRequest(req);
  if (!base) return "";
  return base + "/register.html?profile_access=" + encodeURIComponent(token);
}

module.exports = {
  signProfileAccessToken: signProfileAccessToken,
  verifyProfileAccessToken: verifyProfileAccessToken,
  buildProfileRegistrationEmailLink: buildProfileRegistrationEmailLink,
  buildProfileRegistrationEmailLinkFromRequest: buildProfileRegistrationEmailLinkFromRequest,
  getPublicSiteBaseForEmail: getPublicSiteBaseForEmail,
  getPublicSiteBaseForEmailFromRequest: getPublicSiteBaseForEmailFromRequest,
  hasSigningSecret: function () {
    return !!getSecret();
  },
};
