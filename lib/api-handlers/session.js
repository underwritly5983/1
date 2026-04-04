/**
 * GET — current user (from HttpOnly cookie), no secrets.
 * GET ?launch=ifta — same, plus a short-lived signed URL to open the external IFTA app (cross-origin).
 * GET ?include=insureds — include insured client list (PostgreSQL).
 * GET ?pull=insured_uploads&ifta_token=…&insuredId=… — IFTA app pulls stored file payloads (no session cookie).
 * POST — insured flows (action: create | verify_mfa | upload | delete_insured | resend_insured_email) merged here for Vercel Hobby function limits.
 */

var sessionLib = require("../session-token");
var userStore = require("../user-store");
var companyKeyLib = require("../company-key");
var iftaLaunch = require("../ifta-launch-token");
var insuredDb = require("../insured-db");
var handleInsuredPost = require("../insured-api");
var profileAccess = require("../profile-access-token");
var handleIftaInsuredUploadsPull = require("../ifta-insured-uploads-pull");
var relayIftaIngest = require("../ifta-ingest-webhook");
var iftaUrls = require("../ifta-urls");
var orgBroker = require("../org-broker");

function sendJson(res, status, obj) {
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function parseQuery(req) {
  var path = typeof req.url === "string" ? req.url : "";
  var q = path.indexOf("?");
  if (q < 0) return {};
  var params = {};
  try {
    var sp = new URLSearchParams(path.slice(q + 1));
    sp.forEach(function (v, k) {
      params[k] = v;
    });
  } catch (e) {
    /* ignore */
  }
  return params;
}

function publicUser(record) {
  if (!record || typeof record !== "object") return null;
  var pe = typeof record.primaryEmail === "string" ? normEmail(record.primaryEmail) : "";
  return {
    email: record.email || "",
    name: record.name || "",
    company: record.company || "",
    role: record.role || "",
    appRole: typeof record.appRole === "string" ? record.appRole : "",
    iftaAccess: record.iftaAccess === true,
    phone: record.phone || "",
    logoDataUrl: record.logoDataUrl || null,
    completedAt: record.completedAt || "",
    companyKey: companyKeyLib.resolveCompanyKey(record),
    accountType: record.accountType === "sub" ? "sub" : "primary",
    primaryEmail: pe,
    permissions: userStore.sanitizePermissions(record.permissions),
    canManageTeam: orgBroker.canManageTeam(record),
    isSubAccount: orgBroker.isSubAccount(record),
    canDeleteInsured: orgBroker.canDeleteInsured(record),
  };
}

function canLaunchIfta(record) {
  if (!record || !record.passwordHash) return false;
  // Any signed-in broker can open the IFTA deployment (IFTA_DEPLOYMENT_URL on the server).
  return true;
}

function appendLaunchToken(baseUrl, token) {
  var u = baseUrl.trim();
  var sep = u.indexOf("?") >= 0 ? "&" : "?";
  return u + sep + "ifta_token=" + encodeURIComponent(token);
}

/** Public origin of this landing app (for IFTA pull + URL params). Request host, then env, then VERCEL_URL. */
function resolveLandingPublicOrigin(req) {
  var fromReq = profileAccess.getPublicSiteBaseForEmailFromRequest(req);
  if (fromReq) return fromReq.replace(/\/$/, "");
  var env = (
    process.env.LANDING_PUBLIC_URL ||
    process.env.SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.EMAIL_SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (env) return env;
  var vu = (process.env.VERCEL_URL || "").trim();
  if (vu) {
    if (!/^https?:\/\//i.test(vu)) return "https://" + vu.replace(/\/$/, "");
    return vu.replace(/\/$/, "");
  }
  return "";
}

function insuredStatusLabel(status, uploadCount) {
  if (status === "pending_mfa") return "Awaiting verification";
  if (status === "awaiting_upload") return "Ready to upload";
  if (status === "completed") {
    var n = typeof uploadCount === "number" ? uploadCount : 0;
    if (n > 0) {
      return "Reports received (" + n + " file" + (n === 1 ? "" : "s") + ")";
    }
    return "Reports received";
  }
  return status || "—";
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cookie");
      return res.status(204).end();
    }

    if (req.method === "POST") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return handleInsuredPost(req, res);
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    var qPublic = parseQuery(req);
    if (
      String(qPublic.pull || "").toLowerCase() === "insured_uploads" &&
      (qPublic.ifta_token || qPublic.iftaToken)
    ) {
      return handleIftaInsuredUploadsPull(req, res, qPublic);
    }

    var raw = sessionLib.getSessionTokenFromRequest(req);
    var v = sessionLib.verifySessionToken(raw);
    if (!v.ok) {
      return sendJson(res, 401, { ok: false, error: v.error });
    }

    var record;
    try {
      record = await userStore.getUser(v.email);
    } catch (e) {
      if (e && e.code === "STORE_CONFIG") {
        return sendJson(res, 503, { ok: false, error: "Account storage is not configured." });
      }
      throw e;
    }
    if (!record || !record.passwordHash) {
      return sendJson(res, 401, { ok: false, error: "Account not found or setup incomplete." });
    }

    var q = parseQuery(req);
    var wantLaunch = String(q.launch || "").toLowerCase() === "ifta";

    var iftaDeploymentUrl = iftaUrls.iftaDeploymentBase();
    res.setHeader("Access-Control-Allow-Origin", "*");
    var u = publicUser(record);
    u.iftaDeploymentUrl = iftaDeploymentUrl;

    var payload = { ok: true, user: u };

    if (wantLaunch) {
      if (!canLaunchIfta(record)) {
        return sendJson(res, 403, {
          ok: false,
          error: "IFTA access is not enabled for this account.",
        });
      }
      if (!iftaDeploymentUrl || !String(iftaDeploymentUrl).trim()) {
        return sendJson(res, 503, {
          ok: false,
          error:
            "IFTA URL is not configured. Set IFTA_DEPLOYMENT_URL on this Vercel project to your IFTA Summary production URL (e.g. https://your-ifta-app.vercel.app/reports).",
        });
      }
      var now = Math.floor(Date.now() / 1000);
      var exp = now + iftaLaunch.launchTtlSeconds();
      var ck = companyKeyLib.resolveCompanyKey(record);
      var at = record.accountType === "sub" ? "sub" : "primary";
      var pe = typeof record.primaryEmail === "string" ? normEmail(record.primaryEmail) : "";
      var orgBe = orgBroker.orgBrokerEmail(record);
      var launchPayload = {
        typ: "ifta_launch",
        v: 1,
        email: normEmail(record.email),
        companyKey: ck,
        accountType: at,
        primaryEmail: pe,
        permissions: userStore.sanitizePermissions(record.permissions),
        iat: now,
        exp: exp,
      };
      var insuredIdParam = q.insuredId || q.insured_id;
      if (insuredIdParam != null && insuredIdParam !== "" && insuredDb.hasPostgres()) {
        var idNum = parseInt(String(insuredIdParam), 10);
        if (!isNaN(idNum) && idNum > 0) {
          try {
            var insRow = await insuredDb.getByBrokerAndId(orgBe, idNum);
            if (insRow) {
              launchPayload.insuredId = idNum;
              launchPayload.insuredName = insRow.name || "";
              launchPayload.insuredEmail = normEmail(insRow.email);
            }
          } catch (insErr) {
            console.warn("[session] insured lookup", insErr && insErr.message);
          }
        }
      }
      var tok = iftaLaunch.signIftaLaunchToken(launchPayload);
      if (!tok) {
        return sendJson(res, 503, {
          ok: false,
          error:
            "IFTA launch is not configured (set IFTA_SHARED_SECRET or SESSION_SECRET on the server).",
        });
      }
      var launchUrl = appendLaunchToken(iftaDeploymentUrl, tok);
      if (launchPayload.insuredId != null && typeof launchPayload.insuredId === "number") {
        launchUrl +=
          "&insuredId=" + encodeURIComponent(String(launchPayload.insuredId));
      }
      var landingOrigin = resolveLandingPublicOrigin(req);
      if (landingOrigin) {
        launchUrl += "&landingApiOrigin=" + encodeURIComponent(landingOrigin);
      } else {
        console.warn(
          "[session] landingApiOrigin missing — set SITE_URL or LANDING_PUBLIC_URL so the IFTA app can call the pull API."
        );
      }
      payload.iftaLaunchUrl = launchUrl;
      if (launchPayload.insuredId != null && typeof launchPayload.insuredId === "number") {
        try {
          await relayIftaIngest.relayInsuredUploadsToIftaWebhook(orgBe, launchPayload.insuredId);
        } catch (relErr) {
          console.error("[session] IFTA ingest relay failed", relErr && relErr.message);
        }
      }
    }

    if (String(q.include || "").toLowerCase() === "insureds") {
      if (insuredDb.hasPostgres()) {
        try {
          var orgBrokerEmail = orgBroker.orgBrokerEmail(record);
          var list = await insuredDb.listByBroker(orgBrokerEmail);
          payload.insureds = list.map(function (r) {
            return {
              id: r.id,
              name: r.name,
              email: r.email,
              phone: r.phone,
              status: r.status,
              statusLabel: insuredStatusLabel(r.status, r.uploadCount),
              createdAt: r.createdAt,
              verifiedAt: r.verifiedAt,
              completedAt: r.completedAt,
              uploadCount: typeof r.uploadCount === "number" ? r.uploadCount : 0,
              createdByEmail: r.createdByEmail || "",
            };
          });
        } catch (ie) {
          console.warn("[session] insureds", ie && ie.message);
          payload.insureds = [];
        }
      } else {
        payload.insureds = [];
      }
    }

    return sendJson(res, 200, payload);
  } catch (fatal) {
    console.error("[session] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
