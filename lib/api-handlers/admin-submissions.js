/**
 * GET — form submissions + registered users (admin cookie).
 * PATCH — set appRole for a registered user { email, appRole }.
 */

var adminSession = require("../admin-session-token");
var submissionsDb = require("../submissions-db");
var userStore = require("../user-store");
var earlyAccessReview = require("../early-access-review");
var insuredDb = require("../insured-db");

var FORM_LABELS = {
  early_access: "Early access",
  profile_registration: "Profile registration",
  account_completion: "Account completion",
};

function buildSubmissionLog(submissions) {
  var log = [];
  (submissions.earlyAccess || []).forEach(function (r) {
    log.push({
      formType: "early_access",
      formLabel: FORM_LABELS.early_access,
      id: r.id,
      receivedAt: r.receivedAt,
      email: r.email || "",
      name: r.name || "",
      entry: r,
    });
  });
  (submissions.profileRegistration || []).forEach(function (r) {
    log.push({
      formType: "profile_registration",
      formLabel: FORM_LABELS.profile_registration,
      id: r.id,
      receivedAt: r.receivedAt,
      email: r.email || "",
      name: r.name || "",
      entry: r,
    });
  });
  (submissions.accountCompletions || []).forEach(function (r) {
    log.push({
      formType: "account_completion",
      formLabel: FORM_LABELS.account_completion,
      id: r.id,
      receivedAt: r.receivedAt,
      email: r.email || "",
      name: r.name || "",
      entry: r,
    });
  });
  log.sort(function (a, b) {
    return new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0);
  });
  return log;
}

function submissionStats(log) {
  var s = {
    total: log.length,
    early_access: 0,
    profile_registration: 0,
    account_completion: 0,
  };
  for (var i = 0; i < log.length; i++) {
    var t = log[i].formType;
    if (s[t] !== undefined) s[t]++;
  }
  return s;
}

function sendJson(res, status, obj) {
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

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, PATCH");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cookie");
      return res.status(204).end();
    }

    var raw = adminSession.getAdminTokenFromRequest(req);
    var v = adminSession.verifyAdminToken(raw);
    if (!v.ok) {
      return sendJson(res, 401, { ok: false, error: v.error });
    }

    if (req.method === "PATCH") {
      var body;
      try {
        body = req.body;
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      }
      if (body === undefined || body === null) {
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
        }
      }
      if (body && body.action === "approveEarlyAccess") {
        var emApprove = typeof body.email === "string" ? body.email.trim() : "";
        var apr = await earlyAccessReview.approveEarlyAccess(emApprove, req);
        if (!apr.ok) {
          return sendJson(res, 400, { ok: false, error: apr.error });
        }
        return sendJson(res, 200, { ok: true });
      }
      if (body && body.action === "deleteUser") {
        var emDel = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!emDel || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emDel)) {
          return sendJson(res, 400, { ok: false, error: "Invalid email." });
        }
        try {
          await insuredDb.deleteAllForBrokerEmail(emDel);
        } catch (ie) {
          console.error("[admin-submissions] delete insureds", ie && ie.message);
        }
        try {
          await earlyAccessReview.deleteByEmail(emDel);
        } catch (ee) {
          console.error("[admin-submissions] delete early_access_review", ee && ee.message);
        }
        var del = await userStore.deleteUser(emDel);
        if (!del.ok) {
          return sendJson(res, 400, { ok: false, error: del.error });
        }
        return sendJson(res, 200, { ok: true });
      }
      var em = typeof body.email === "string" ? body.email.trim() : "";
      var patch = {
        appRole:
          typeof body.appRole === "string"
            ? body.appRole
            : typeof body.role === "string"
              ? body.role
              : "",
      };
      if (body && Object.prototype.hasOwnProperty.call(body, "iftaAccess")) {
        patch.iftaAccess = body.iftaAccess === true;
      }
      if (typeof body.accountType === "string") {
        patch.accountType = body.accountType;
      }
      if (typeof body.primaryEmail === "string") {
        patch.primaryEmail = body.primaryEmail;
      }
      if (body.permissions !== undefined) {
        patch.permissions = body.permissions;
      }
      var upd = await userStore.updateUserAdminSettings(em, patch);
      if (!upd.ok) {
        return sendJson(res, 400, { ok: false, error: upd.error });
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS, PATCH");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    var submissions = await submissionsDb.listAll();
    var submissionLog = buildSubmissionLog(submissions);
    var users = [];
    try {
      users = await userStore.listAllUsersPublic();
    } catch (e) {
      console.error("[admin-submissions] listAllUsersPublic", e && e.message);
    }
    var earlyAccessPending = [];
    try {
      earlyAccessPending = await earlyAccessReview.listPending();
    } catch (e) {
      console.error("[admin-submissions] listPending", e && e.message);
    }

    return sendJson(res, 200, {
      ok: true,
      data: {
        earlyAccess: submissions.earlyAccess,
        profileRegistration: submissions.profileRegistration,
        accountCompletions: submissions.accountCompletions,
        submissionLog: submissionLog,
        submissionStats: submissionStats(submissionLog),
        earlyAccessPending: earlyAccessPending,
        users: users,
      },
    });
  } catch (fatal) {
    console.error("[admin-submissions] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
