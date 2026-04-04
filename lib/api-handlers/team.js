/**
 * Organization team: sub-brokers (invite, list, remove, password reset email).
 * GET — session required; primary accounts only. Returns subs, pending invites, IFTA/org stats.
 * POST — action: invite_sub | remove_sub | resend_invite | send_password_reset
 */

var sessionLib = require("../session-token");
var userStore = require("../user-store");
var orgBroker = require("../org-broker");
var insuredDb = require("../insured-db");
var subBrokerInvites = require("../sub-broker-invites");
var insuredMfa = require("../insured-mfa");
var mailer = require("../mailer");
var profileAccess = require("../profile-access-token");
var resetTokenLib = require("../password-reset-token");

var INVITE_EXPIRE_MIN = 60 * 24; /* 24 hours */

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

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

async function requirePrimary(req) {
  var raw = sessionLib.getSessionTokenFromRequest(req);
  var v = sessionLib.verifySessionToken(raw);
  if (!v.ok) return { ok: false, status: 401, error: v.error };
  var record = await userStore.getUser(v.email);
  if (!record || !record.passwordHash) {
    return { ok: false, status: 401, error: "Account not found." };
  }
  if (!orgBroker.canManageTeam(record)) {
    return {
      ok: false,
      status: 403,
      error: "Only the organization owner can manage team members.",
    };
  }
  return { ok: true, email: normEmail(v.email), record: record };
}

async function sendInviteEmail(req, primaryEmail, subEmail, code, primaryName, company) {
  var transport = mailer.createTransport();
  var from = mailer.getMailFrom();
  if (!transport || !from) {
    console.warn("[team] SMTP not configured — invite email not sent.");
    return false;
  }
  var base = profileAccess.getPublicSiteBaseForEmailFromRequest(req);
  var completeLink =
    base && subEmail
      ? base + "/complete-sub-broker.html?email=" + encodeURIComponent(subEmail)
      : "";
  var subject = "Your Underwritly team invitation — verify to join";
  var text =
    (primaryName ? "Hi,\n\n" + primaryName + " invited you to join their organization on Underwritly.\n\n" : "Hi,\n\nYou were invited to join an organization on Underwritly.\n\n") +
    "Your verification code is: " +
    code +
    "\n\n" +
    "This code expires in 24 hours.\n\n" +
    (company ? "Organization: " + company + "\n\n" : "") +
    (completeLink
      ? "Open this link to create your login and profile:\n" + completeLink + "\n\n"
      : "") +
    "If you did not expect this invitation, you can ignore this email.\n";

  var html =
    "<p>Hi,</p>" +
    (primaryName
      ? "<p><strong>" + escHtml(primaryName) + "</strong> invited you to join their organization on Underwritly.</p>"
      : "<p>You were invited to join an organization on Underwritly.</p>") +
    (company ? "<p>Organization: <strong>" + escHtml(company) + "</strong></p>" : "") +
    '<p>Your verification code is:</p><p style="font-size:1.5rem;font-weight:700;letter-spacing:0.2em;">' +
    escHtml(code) +
    "</p>" +
    "<p>This code expires in 24 hours.</p>" +
    (completeLink
      ? '<p><a href="' +
        escAttr(completeLink) +
        '">Finish setup — create your password and profile</a></p>'
      : "");

  await transport.sendMail({
    from: from,
    to: subEmail,
    subject: subject,
    text: text,
    html: html,
  });
  try {
    transport.close();
  } catch (ignore) {}
  return true;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cookie");
      return res.status(204).end();
    }

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "GET") {
      var auth = await requirePrimary(req);
      if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });
      var subs = await userStore.listSubUsersByPrimary(auth.email);
      var invites = [];
      var stats = { insuredCount: 0, totalReportFiles: 0, byCreator: [] };
      if (subBrokerInvites.hasPostgres()) {
        try {
          invites = await subBrokerInvites.listInvitesForPrimary(auth.email);
        } catch (ie) {
          console.warn("[team] invites", ie && ie.message);
        }
      }
      if (insuredDb.hasPostgres()) {
        try {
          stats = await insuredDb.getOrgDashboardStats(auth.email);
        } catch (se) {
          console.warn("[team] stats", se && se.message);
        }
      }
      return sendJson(res, 200, {
        ok: true,
        subUsers: subs,
        pendingInvites: invites,
        stats: stats,
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, HEAD, POST, OPTIONS");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

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

    var authP = await requirePrimary(req);
    if (!authP.ok) return sendJson(res, authP.status, { ok: false, error: authP.error });

    var action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    var subEm = normEmail(body.subEmail != null ? body.subEmail : body.email || "");

    if (action === "invite_sub") {
      if (!subEm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subEm)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid email for the team member." });
      }
      if (subEm === authP.email) {
        return sendJson(res, 400, { ok: false, error: "You cannot invite your own email." });
      }
      if (!subBrokerInvites.hasPostgres()) {
        return sendJson(res, 503, {
          ok: false,
          error: "Team invitations require PostgreSQL (DATABASE_URL) on this deployment.",
        });
      }
      if (!insuredMfa.isConfigured()) {
        return sendJson(res, 503, { ok: false, error: "MFA is not configured for invite codes." });
      }
      var existing = await userStore.getUser(subEm);
      if (existing && existing.passwordHash) {
        if (existing.accountType === "sub" && normEmail(existing.primaryEmail) === authP.email) {
          return sendJson(res, 400, { ok: false, error: "This user is already on your team." });
        }
        return sendJson(res, 400, {
          ok: false,
          error: "An account already exists for this email. Use a different address.",
        });
      }
      var code = insuredMfa.generateSixDigitCode();
      var hash = insuredMfa.hashMfaCode(code);
      if (!hash) return sendJson(res, 503, { ok: false, error: "Could not generate invite." });
      var expires = new Date(Date.now() + INVITE_EXPIRE_MIN * 60 * 1000).toISOString();
      var up = await subBrokerInvites.upsertInvite(authP.email, subEm, hash, expires);
      if (!up.ok) return sendJson(res, 503, { ok: false, error: up.error || "Could not save invite." });
      var primaryName = (authP.record.name || "").trim() || authP.email;
      var company = (authP.record.company || "").trim();
      var sent = await sendInviteEmail(req, authP.email, subEm, code, primaryName, company);
      if (!sent) {
        return sendJson(res, 502, {
          ok: false,
          error: "Invite was saved but email could not be sent. Check SMTP settings.",
        });
      }
      return sendJson(res, 200, { ok: true, message: "Invitation sent." });
    }

    if (action === "resend_invite") {
      if (!subEm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subEm)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid email." });
      }
      if (!subBrokerInvites.hasPostgres()) {
        return sendJson(res, 503, { ok: false, error: "Invites require DATABASE_URL." });
      }
      var inv = await subBrokerInvites.getInvite(authP.email, subEm);
      if (!inv) {
        return sendJson(res, 404, { ok: false, error: "No pending invitation for that email." });
      }
      var code2 = insuredMfa.generateSixDigitCode();
      var hash2 = insuredMfa.hashMfaCode(code2);
      var expires2 = new Date(Date.now() + INVITE_EXPIRE_MIN * 60 * 1000).toISOString();
      await subBrokerInvites.upsertInvite(authP.email, subEm, hash2, expires2);
      var primaryName2 = (authP.record.name || "").trim() || authP.email;
      var company2 = (authP.record.company || "").trim();
      var sent2 = await sendInviteEmail(req, authP.email, subEm, code2, primaryName2, company2);
      if (!sent2) {
        return sendJson(res, 502, { ok: false, error: "Could not send email." });
      }
      return sendJson(res, 200, { ok: true, message: "Invitation resent." });
    }

    if (action === "remove_sub") {
      if (!subEm) return sendJson(res, 400, { ok: false, error: "Email required." });
      var target = await userStore.getUser(subEm);
      if (!target || !target.passwordHash) {
        return sendJson(res, 404, { ok: false, error: "User not found." });
      }
      if (target.accountType !== "sub" || normEmail(target.primaryEmail) !== authP.email) {
        return sendJson(res, 403, { ok: false, error: "That user is not a sub-account on your team." });
      }
      var del = await userStore.deleteUser(subEm);
      if (!del.ok) return sendJson(res, 400, { ok: false, error: del.error || "Could not remove user." });
      if (subBrokerInvites.hasPostgres()) {
        await subBrokerInvites.deleteInvite(authP.email, subEm);
      }
      return sendJson(res, 200, { ok: true, message: "Team member removed." });
    }

    if (action === "send_password_reset") {
      if (!subEm) return sendJson(res, 400, { ok: false, error: "Email required." });
      var tgt = await userStore.getUser(subEm);
      if (!tgt || !tgt.passwordHash) {
        return sendJson(res, 404, { ok: false, error: "User not found." });
      }
      if (tgt.accountType !== "sub" || normEmail(tgt.primaryEmail) !== authP.email) {
        return sendJson(res, 403, { ok: false, error: "That user is not on your team." });
      }
      var tok = resetTokenLib.signPasswordResetToken(subEm);
      var base = profileAccess.getPublicSiteBaseForEmailFromRequest(req);
      var link =
        tok && base ? base + "/reset-password.html?reset_token=" + encodeURIComponent(tok) : "";
      var transport = mailer.createTransport();
      var from = mailer.getMailFrom();
      if (!tok || !link || !transport || !from) {
        return sendJson(res, 503, { ok: false, error: "Password reset is not fully configured (SMTP or secrets)." });
      }
      var first = (tgt.name || subEm).split(/\s+/)[0];
      await transport.sendMail({
        from: from,
        to: subEm,
        replyTo: "info@underwritly.com",
        subject: "Reset your Underwritly password",
        text:
          "Hi " +
          first +
          ",\n\nYour organization administrator sent this link to reset your password:\n\n" +
          link +
          "\n\nIf you did not expect this, contact your broker.\n",
        html:
          "<p>Hi " +
          escHtml(first) +
          ',</p><p>Your organization administrator requested a password reset.</p><p><a href="' +
          escAttr(link) +
          '">Reset password</a></p>',
      });
      try {
        transport.close();
      } catch (ignore) {}
      return sendJson(res, 200, { ok: true, message: "Password reset email sent." });
    }

    return sendJson(res, 400, { ok: false, error: "Unknown action." });
  } catch (fatal) {
    console.error("[team] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
