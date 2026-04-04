/**
 * POST — sub-broker completes invite: verification code + password + profile fields.
 * Creates account with accountType "sub" and primaryEmail set; sets session cookie.
 */

var passwordLib = require("../password");
var sessionLib = require("../session-token");
var userStore = require("../user-store");
var subBrokerInvites = require("../sub-broker-invites");
var insuredMfa = require("../insured-mfa");
var companyKeyLib = require("../company-key");

function sendJson(res, status, obj, extraHeaders) {
  if (extraHeaders && typeof extraHeaders === "object") {
    Object.keys(extraHeaders).forEach(function (k) {
      res.setHeader(k, extraHeaders[k]);
    });
  }
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    var data = "";
    req.on("data", function (chunk) {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", function () {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "GET") {
      return sendJson(res, 200, { ok: true, endpoint: "complete-sub-broker" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    if (!subBrokerInvites.hasPostgres()) {
      return sendJson(res, 503, {
        error: "Team setup requires DATABASE_URL on the server.",
      });
    }

    var body;
    try {
      body = req.body;
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON body." });
    }
    if (body === undefined || body === null) {
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return sendJson(res, 400, { error: "Invalid JSON body." });
      }
    }

    var subEm = normEmail(body.email != null ? body.email : "");
    var codeIn = typeof body.code === "string" ? body.code.trim().replace(/\s/g, "") : "";
    var pw = typeof body.password === "string" ? body.password : "";
    var name = typeof body.name === "string" ? body.name.trim() : "";
    var phone = typeof body.phone === "string" ? body.phone.trim() : "";
    var role = typeof body.role === "string" ? body.role.trim() : "";

    if (!subEm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subEm)) {
      return sendJson(res, 400, { error: "Valid email is required." });
    }
    if (!/^\d{6}$/.test(codeIn)) {
      return sendJson(res, 400, { error: "Enter the 6-digit code from your email." });
    }
    var pwCheck = passwordLib.validatePasswordStrength(pw);
    if (!pwCheck.ok) {
      return sendJson(res, 400, { error: pwCheck.error });
    }
    if (!name || name.length > 200) {
      return sendJson(res, 400, { error: "Name is required." });
    }
    if (!phone || phone.replace(/\D/g, "").length < 10 || phone.length > 50) {
      return sendJson(res, 400, { error: "Valid phone is required." });
    }
    if (!role || role.length > 120) {
      return sendJson(res, 400, { error: "Job title or role is required." });
    }

    var inv = await subBrokerInvites.getInviteBySubEmailOnly(subEm);
    if (!inv) {
      return sendJson(res, 400, {
        error: "No invitation found for this email. Ask your administrator to send a new invite.",
      });
    }

    var primaryEmail = normEmail(inv.primary_email || inv.primaryEmail);
    var exp = inv.expires_at ? new Date(inv.expires_at).getTime() : 0;
    if (Date.now() > exp) {
      return sendJson(res, 400, { error: "This code has expired. Ask for a new invitation." });
    }

    var okCode = insuredMfa.verifyMfaCode(codeIn, inv.code_hash);
    if (!okCode) {
      return sendJson(res, 400, { error: "Invalid verification code." });
    }

    var primary = await userStore.getUser(primaryEmail);
    if (!primary || !primary.passwordHash || primary.accountType === "sub") {
      return sendJson(res, 400, { error: "Organization owner account is not available." });
    }

    var existingSub = await userStore.getUser(subEm);
    if (existingSub && existingSub.passwordHash) {
      return sendJson(res, 409, { error: "This email already has an account. Sign in instead." });
    }

    var record = {
      email: subEm,
      name: name,
      company: primary.company || "",
      role: role,
      phone: phone,
      profileSubmittedAt: primary.profileSubmittedAt || "",
      passwordHash: passwordLib.hashPassword(pw),
      logoDataUrl: null,
      completedAt: new Date().toISOString(),
      appRole: typeof primary.appRole === "string" ? primary.appRole : "",
      iftaAccess: primary.iftaAccess === true,
      companyKey: companyKeyLib.resolveCompanyKey(primary),
      accountType: "sub",
      primaryEmail: primaryEmail,
      permissions: userStore.sanitizePermissions(primary.permissions),
    };

    await userStore.putUser(subEm, record);
    await subBrokerInvites.deleteInvite(primaryEmail, subEm);

    var sess = sessionLib.signSessionToken(subEm);
    if (!sess) {
      return sendJson(res, 503, {
        error: "SESSION_SECRET must be set so we can sign you in.",
      });
    }

    return sendJson(
      res,
      200,
      { ok: true, redirect: "/dashboard.html" },
      { "Set-Cookie": sessionLib.buildSetSessionCookieHeader(sess) }
    );
  } catch (fatal) {
    console.error("[complete-sub-broker] fatal", fatal);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
};
