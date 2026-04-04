/**
 * POST /api/session — insured actions (create, verify_mfa, upload, delete_insured, resend_insured_email).
 * Merged into session route to stay within Vercel Hobby serverless function limits.
 */

var sessionLib = require("./session-token");
var userStore = require("./user-store");
var companyKeyLib = require("./company-key");
var insuredDb = require("./insured-db");
var insuredMfa = require("./insured-mfa");
var insuredToken = require("./insured-token");
var profileAccess = require("./profile-access-token");
var mailer = require("./mailer");
var iftaIngestWebhook = require("./ifta-ingest-webhook");
var iftaLaunch = require("./ifta-launch-token");
var orgBroker = require("./org-broker");

var MFA_EXPIRE_MIN = 15;
var MAX_FILE_BYTES = Math.floor(1.5 * 1024 * 1024);
var MAX_FILES = 8;
var MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Public HTTPS origin for insured verify/upload pages (never use a Vercel preview URL here).
 * Optional INSURED_PUBLIC_SITE_URL overrides; else profile-access (SITE_URL, then request Host).
 */
function baseUrlForInsuredLinks(req) {
  var only = (process.env.INSURED_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (only) return only;
  return profileAccess.getPublicSiteBaseForEmailFromRequest(req);
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

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function readJsonBody(req, maxLen) {
  if (!maxLen) maxLen = 6e6;
  return new Promise(function (resolve, reject) {
    var data = "";
    req.on("data", function (chunk) {
      data += chunk;
      if (data.length > maxLen) {
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

function getBrokerSession(req) {
  var raw = sessionLib.getSessionTokenFromRequest(req);
  var v = sessionLib.verifySessionToken(raw);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, email: v.email };
}

async function getBrokerOrgContext(req) {
  var sess = getBrokerSession(req);
  if (!sess.ok) return { ok: false, error: sess.error };
  var broker = await userStore.getUser(sess.email);
  if (!broker || !broker.passwordHash) {
    return { ok: false, error: "Account not found." };
  }
  return {
    ok: true,
    sessionEmail: orgBroker.normEmail(sess.email),
    broker: broker,
    orgBrokerEmail: orgBroker.orgBrokerEmail(broker),
  };
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

async function sendMfaEmail(req, toEmail, insuredName, code, verifyLink) {
  var transport = mailer.createTransport();
  var from = mailer.getMailFrom();
  if (!transport || !from) {
    console.warn("[insured] SMTP not configured — MFA email not sent.");
    return;
  }
  var subject = "Your verification code — Underwritly / IFTA";
  var text =
    "Hello,\n\n" +
    (insuredName ? "You were added as an insured contact (" + insuredName + ").\n\n" : "") +
    "Your verification code is: " +
    code +
    "\n\n" +
    "This code expires in " +
    MFA_EXPIRE_MIN +
    " minutes.\n\n" +
    (verifyLink
      ? "You can also open this link to enter your code:\n" + verifyLink + "\n\n"
      : "") +
    "If you did not expect this message, you can ignore it.\n";

  var html =
    "<p>Hello,</p>" +
    (insuredName ? "<p>You were added as an insured contact (" + escHtml(insuredName) + ").</p>" : "") +
    "<p>Your verification code is:</p>" +
    '<p style="font-size:1.5rem;font-weight:700;letter-spacing:0.2em;">' +
    escHtml(code) +
    "</p>" +
    "<p>This code expires in " +
    MFA_EXPIRE_MIN +
    " minutes.</p>" +
    (verifyLink
      ? '<p><a href="' +
        escAttr(verifyLink) +
        '">Open verification page</a></p>'
      : "");

  await transport.sendMail({
    from: from,
    to: toEmail,
    subject: subject,
    text: text,
    html: html,
  });
}

async function sendUploadLinkEmail(req, toEmail, insuredName, uploadUrl) {
  var transport = mailer.createTransport();
  var from = mailer.getMailFrom();
  if (!transport || !from) {
    console.warn("[insured] SMTP not configured — upload link email not sent.");
    return;
  }
  var subject = "Upload your IFTA reports — Underwritly";
  var text =
    "Hello,\n\n" +
    (insuredName
      ? "You verified your identity for insured contact " + insuredName + ".\n\n"
      : "") +
    "Use this link to upload your IFTA report files (PDF or CSV):\n\n" +
    uploadUrl +
    "\n\n" +
    "If you did not expect this message, contact your broker.\n";

  var html =
    "<p>Hello,</p>" +
    (insuredName
      ? "<p>You verified your identity for <strong>" + escHtml(insuredName) + "</strong>.</p>"
      : "") +
    "<p>Use the button below to upload your IFTA report files (PDF or CSV).</p>" +
    '<p><a href="' +
    escAttr(uploadUrl) +
    '">Open upload page</a></p>';

  await transport.sendMail({
    from: from,
    to: toEmail,
    subject: subject,
    text: text,
    html: html,
  });
}

/**
 * Broker clicked "Resend email" after files were already received — friendly nudge with a fresh upload link.
 */
async function sendUploadLinkEmailOopsResend(req, toEmail, insuredName, uploadUrl) {
  var transport = mailer.createTransport();
  var from = mailer.getMailFrom();
  if (!transport || !from) {
    console.warn("[insured] SMTP not configured — oops-resend email not sent.");
    return;
  }
  var subject = "Oops — here’s your upload link again — Underwritly";
  var who = insuredName ? " for " + insuredName : "";
  var text =
    "Hello,\n\n" +
    "Oops — your broker asked us to send this again. No worries; it happens to the best of us.\n\n" +
    "Here’s the same kind of secure link you used before" +
    who +
    ", good as new:\n\n" +
    uploadUrl +
    "\n\n" +
    "Tap it to add or replace IFTA files whenever you’re ready. If you didn’t expect this, ping your broker.\n\n" +
    "— The slightly forgetful but well-meaning robots at Underwritly\n";

  var html =
    '<p style="margin:0 0 12px 0;">Hello,</p>' +
    '<p style="margin:0 0 12px 0;font-size:1.05rem;">' +
    "<strong>Oops</strong> — your broker asked us to send this again. " +
    "No worries; it happens to the best of us.</p>" +
    '<p style="margin:0 0 16px 0;">Here’s the same kind of secure link you used before' +
    (insuredName ? " for <strong>" + escHtml(insuredName) + "</strong>" : "") +
    ", good as new:</p>" +
    '<p style="margin:0 0 20px 0;"><a href="' +
    escAttr(uploadUrl) +
    '" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Open upload page</a></p>' +
    '<p style="margin:0;color:#64748b;font-size:0.95rem;">Tap it to add or replace IFTA files whenever you’re ready. ' +
    "If you didn’t expect this, ping your broker.</p>" +
    '<p style="margin:16px 0 0 0;color:#94a3b8;font-size:0.9rem;">— The slightly forgetful but well-meaning robots at Underwritly</p>';

  await transport.sendMail({
    from: from,
    to: toEmail,
    subject: subject,
    text: text,
    html: html,
  });
}

async function sendCompletionEmails(req, brokerEmail, insuredEmail, insuredName, uploadCount) {
  var transport = mailer.createTransport();
  var from = mailer.getMailFrom();
  if (!transport || !from) {
    console.warn("[insured] SMTP not configured — completion emails not sent.");
    return;
  }
  var base = baseUrlForInsuredLinks(req) || profileAccess.getPublicSiteBaseForEmail();
  var brokerDash = base ? base + "/dashboard.html" : "";
  var subj = "IFTA reports received — Underwritly";
  var body =
    "Your IFTA file upload(s) were received (" +
    uploadCount +
    " file(s)). " +
    "Your broker will be notified when the IFTA Summary is updated.\n\n" +
    (brokerDash ? "Broker portal: " + brokerDash + "\n" : "");

  await transport.sendMail({
    from: from,
    to: insuredEmail,
    subject: subj,
    text: "Hello " + (insuredName || "") + ",\n\n" + body,
  });

  await transport.sendMail({
    from: from,
    to: brokerEmail,
    subject: "Insured upload complete — " + (insuredName || insuredEmail),
    text:
      "An insured has uploaded IFTA report file(s).\n\n" +
      "Insured: " +
      (insuredName || "") +
      " <" +
      insuredEmail +
      ">\n" +
      "Files: " +
      uploadCount +
      "\n\n" +
      (brokerDash ? "Open your dashboard: " + brokerDash + "\n" : ""),
  });
}

module.exports = async function handleInsuredPost(req, res) {
  try {
    if (!insuredDb.hasPostgres()) {
      return sendJson(res, 503, { ok: false, error: "Insured storage requires DATABASE_URL." });
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
        if (e && e.message === "Payload too large") {
          return sendJson(res, 413, { ok: false, error: "Payload too large." });
        }
        return sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      }
    }

    var action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (action === "create_from_ifta_carrier") {
      var tokIfta = typeof body.ifta_token === "string" ? body.ifta_token.trim() : "";
      var vIfta = iftaLaunch.verifyIftaLaunchToken(tokIfta);
      if (!vIfta.ok) {
        return sendJson(res, 401, { ok: false, error: vIfta.error || "Invalid or expired IFTA session." });
      }
      var brokerFromTok = await userStore.getUser(normEmail(vIfta.payload.email));
      if (!brokerFromTok || !brokerFromTok.passwordHash) {
        return sendJson(res, 401, { ok: false, error: "Broker account not found." });
      }
      var ctxIfta = {
        ok: true,
        sessionEmail: orgBroker.normEmail(vIfta.payload.email),
        broker: brokerFromTok,
        orgBrokerEmail: orgBroker.orgBrokerEmail(brokerFromTok),
      };
      var nameI = typeof body.name === "string" ? body.name.trim() : "";
      var rawEm = body.email != null ? String(body.email).trim() : "";
      var emI = rawEm ? normEmail(rawEm) : null;
      var phoneI =
        typeof body.phone === "string" && body.phone.trim().length >= 7 ? body.phone.trim() : "";
      if (!nameI || nameI.length > 200) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid insured name (from the IFTA report)." });
      }
      if (rawEm && emI && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emI)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid email address for the insured." });
      }
      var ckI = companyKeyLib.resolveCompanyKey(brokerFromTok);
      var uploadedFcRaw =
        body.uploadedFileCount != null
          ? parseInt(String(body.uploadedFileCount), 10)
          : body.uploaded_file_count != null
            ? parseInt(String(body.uploaded_file_count), 10)
            : NaN;
      var uploadedFc = 0;
      if (!isNaN(uploadedFcRaw) && uploadedFcRaw > 0) {
        uploadedFc = Math.min(32, Math.max(0, uploadedFcRaw));
      }
      var createdI;
      try {
        createdI = await insuredDb.createInsured(
          ctxIfta.orgBrokerEmail,
          ckI,
          nameI,
          emI,
          phoneI,
          null,
          null,
          ctxIfta.sessionEmail,
          { lastReportSource: "broker_ifta", brokerUploadFileCount: uploadedFc }
        );
      } catch (e) {
        if (e && e.code === "23505") {
          return sendJson(res, 400, {
            ok: false,
            error: "You already have an insured with this email address.",
          });
        }
        throw e;
      }
      if (!createdI) {
        return sendJson(res, 500, { ok: false, error: "Could not create insured." });
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, {
        ok: true,
        insured: {
          id: createdI.id,
          name: createdI.name,
          email: createdI.email || "",
          status: createdI.status,
        },
      });
    }

    if (action === "create") {
      var ctxC = await getBrokerOrgContext(req);
      if (!ctxC.ok) {
        return sendJson(res, 401, { ok: false, error: ctxC.error });
      }
      var broker = ctxC.broker;
      var name = typeof body.name === "string" ? body.name.trim() : "";
      var rawEmC = body.email != null ? String(body.email).trim() : "";
      var em = rawEmC ? normEmail(rawEmC) : null;
      var phone = typeof body.phone === "string" ? body.phone.trim() : "";
      if (!name || name.length > 200) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid insured name." });
      }
      if (rawEmC && em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid email address." });
      }
      var ck = companyKeyLib.resolveCompanyKey(broker);

      if (!em) {
        var phBare = phone.length >= 7 && phone.length <= 32 ? phone : "";
        var createdBare;
        try {
          createdBare = await insuredDb.createInsured(
            ctxC.orgBrokerEmail,
            ck,
            name,
            null,
            phBare,
            null,
            null,
            ctxC.sessionEmail,
            {}
          );
        } catch (e) {
          throw e;
        }
        if (!createdBare) {
          return sendJson(res, 500, { ok: false, error: "Could not create insured." });
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        return sendJson(res, 200, {
          ok: true,
          insured: {
            id: createdBare.id,
            name: createdBare.name,
            email: createdBare.email || "",
            status: createdBare.status,
          },
        });
      }

      if (!phone || phone.length < 7 || phone.length > 32) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid phone number (for MFA)." });
      }

      if (!insuredMfa.isConfigured() || !insuredToken.getSecret()) {
        return sendJson(res, 503, {
          ok: false,
          error: "Server configuration incomplete (INSURED_TOKEN_SECRET / PROFILE_ACCESS_SECRET).",
        });
      }

      var code = insuredMfa.generateSixDigitCode();
      var expires = new Date(Date.now() + MFA_EXPIRE_MIN * 60 * 1000).toISOString();

      var hash = insuredMfa.hashMfaCode(code);
      if (!hash) {
        return sendJson(res, 503, { ok: false, error: "MFA is not configured." });
      }

      var created;
      try {
        created = await insuredDb.createInsured(
          ctxC.orgBrokerEmail,
          ck,
          name,
          em,
          phone,
          hash,
          expires,
          ctxC.sessionEmail
        );
      } catch (e) {
        if (e && e.code === "23505") {
          return sendJson(res, 400, {
            ok: false,
            error: "You already have an insured with this email address.",
          });
        }
        throw e;
      }

      if (!created) {
        return sendJson(res, 500, { ok: false, error: "Could not create insured." });
      }

      var verifyTok = insuredToken.signInsuredVerifyLink(created.id, em);
      var base = baseUrlForInsuredLinks(req);
      var verifyLink =
        verifyTok && base
          ? base + "/insured-verify.html?t=" + encodeURIComponent(verifyTok)
          : "";

      try {
        await sendMfaEmail(req, em, name, code, verifyLink);
      } catch (mailErr) {
        console.error("[insured] sendMfaEmail", mailErr);
        return sendJson(res, 502, {
          ok: false,
          error: "Insured was created but the verification email could not be sent. Check SMTP settings.",
        });
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, {
        ok: true,
        insured: {
          id: created.id,
          name: created.name,
          email: created.email,
          status: created.status,
        },
      });
    }

    if (action === "delete_insured") {
      var ctxDel = await getBrokerOrgContext(req);
      if (!ctxDel.ok) {
        return sendJson(res, 401, { ok: false, error: ctxDel.error });
      }
      if (!orgBroker.canDeleteInsured(ctxDel.broker)) {
        return sendJson(res, 403, {
          ok: false,
          error: "Only the organization owner can remove insured contacts. Ask your primary user to delete this entry.",
        });
      }
      var delId = parseInt(String(body.insuredId != null ? body.insuredId : body.insured_id || ""), 10);
      if (isNaN(delId) || delId < 1) {
        return sendJson(res, 400, { ok: false, error: "Invalid insured id." });
      }
      var delResult = await insuredDb.deleteByBrokerAndId(ctxDel.orgBrokerEmail, delId);
      if (!delResult.ok) {
        var st = delResult.error === "Insured not found." ? 404 : 400;
        return sendJson(res, st, { ok: false, error: delResult.error });
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, { ok: true });
    }

    if (action === "update_insured_email") {
      var ctxUe = await getBrokerOrgContext(req);
      if (!ctxUe.ok) {
        return sendJson(res, 401, { ok: false, error: ctxUe.error });
      }
      var ueId = parseInt(String(body.insuredId != null ? body.insuredId : body.insured_id || ""), 10);
      if (isNaN(ueId) || ueId < 1) {
        return sendJson(res, 400, { ok: false, error: "Invalid insured id." });
      }
      var rawUe = body.email != null ? String(body.email).trim() : "";
      var emUe = rawUe ? normEmail(rawUe) : null;
      if (rawUe && emUe && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emUe)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid email address." });
      }
      var updatedUe;
      try {
        updatedUe = await insuredDb.updateInsuredEmailByBroker(ctxUe.orgBrokerEmail, ueId, emUe);
      } catch (e) {
        if (e && e.code === "23505") {
          return sendJson(res, 400, {
            ok: false,
            error: "You already have an insured with this email address.",
          });
        }
        throw e;
      }
      if (!updatedUe) {
        return sendJson(res, 404, { ok: false, error: "Insured not found." });
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, {
        ok: true,
        insured: {
          id: updatedUe.id,
          name: updatedUe.name,
          email: updatedUe.email || "",
          status: updatedUe.status,
        },
      });
    }

    if (action === "resend_insured_email") {
      var ctxRe = await getBrokerOrgContext(req);
      if (!ctxRe.ok) {
        return sendJson(res, 401, { ok: false, error: ctxRe.error });
      }
      var reId = parseInt(String(body.insuredId != null ? body.insuredId : body.insured_id || ""), 10);
      if (isNaN(reId) || reId < 1) {
        return sendJson(res, 400, { ok: false, error: "Invalid insured id." });
      }
      var rowRe = await insuredDb.getByBrokerAndId(ctxRe.orgBrokerEmail, reId);
      if (!rowRe) {
        return sendJson(res, 404, { ok: false, error: "Insured not found." });
      }
      if (!insuredMfa.isConfigured() || !insuredToken.getSecret()) {
        return sendJson(res, 503, {
          ok: false,
          error: "Server configuration incomplete (INSURED_TOKEN_SECRET / PROFILE_ACCESS_SECRET).",
        });
      }

      if (rowRe.status === "broker_managed") {
        var emBm = rowRe.email && normEmail(rowRe.email);
        if (!emBm) {
          return sendJson(res, 400, {
            ok: false,
            error: "Add an email for this insured before sending a verification message.",
          });
        }
        var codeBm = insuredMfa.generateSixDigitCode();
        var expiresBm = new Date(Date.now() + MFA_EXPIRE_MIN * 60 * 1000).toISOString();
        var hashBm = insuredMfa.hashMfaCode(codeBm);
        if (!hashBm) {
          return sendJson(res, 503, { ok: false, error: "MFA is not configured." });
        }
        var okBm = await insuredDb.transitionBrokerManagedToPendingMfa(
          ctxRe.orgBrokerEmail,
          reId,
          hashBm,
          expiresBm
        );
        if (!okBm) {
          return sendJson(res, 400, {
            ok: false,
            error: "Could not start verification for this insured.",
          });
        }
        rowRe = await insuredDb.getByBrokerAndId(ctxRe.orgBrokerEmail, reId);
        var verifyTokBm = insuredToken.signInsuredVerifyLink(reId, normEmail(rowRe.email));
        var baseBm = baseUrlForInsuredLinks(req);
        var verifyLinkBm =
          verifyTokBm && baseBm
            ? baseBm + "/insured-verify.html?t=" + encodeURIComponent(verifyTokBm)
            : "";
        try {
          await sendMfaEmail(req, normEmail(rowRe.email), rowRe.name, codeBm, verifyLinkBm);
        } catch (mailErrBm) {
          console.error("[insured] resend sendMfaEmail broker_managed", mailErrBm);
          return sendJson(res, 502, {
            ok: false,
            error: "Could not send email. Check SMTP settings.",
          });
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        return sendJson(res, 200, { ok: true, message: "Verification email sent." });
      }

      if (rowRe.status === "pending_mfa") {
        var codeRe = insuredMfa.generateSixDigitCode();
        var expiresRe = new Date(Date.now() + MFA_EXPIRE_MIN * 60 * 1000).toISOString();
        var hashRe = insuredMfa.hashMfaCode(codeRe);
        if (!hashRe) {
          return sendJson(res, 503, { ok: false, error: "MFA is not configured." });
        }
        var okMfaUp = await insuredDb.updateMfaForPendingInsured(ctxRe.orgBrokerEmail, reId, hashRe, expiresRe);
        if (!okMfaUp) {
          return sendJson(res, 400, { ok: false, error: "Could not refresh verification for this insured." });
        }
        var verifyTokRe = insuredToken.signInsuredVerifyLink(reId, normEmail(rowRe.email));
        var baseRe = baseUrlForInsuredLinks(req);
        var verifyLinkRe =
          verifyTokRe && baseRe
            ? baseRe + "/insured-verify.html?t=" + encodeURIComponent(verifyTokRe)
            : "";
        try {
          await sendMfaEmail(req, normEmail(rowRe.email), rowRe.name, codeRe, verifyLinkRe);
        } catch (mailErrRe) {
          console.error("[insured] resend sendMfaEmail", mailErrRe);
          return sendJson(res, 502, {
            ok: false,
            error: "Could not send email. Check SMTP settings.",
          });
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        return sendJson(res, 200, { ok: true, message: "Verification email sent." });
      }

      if (rowRe.status === "awaiting_upload") {
        var uploadTokRe = insuredToken.signInsuredUploadToken(rowRe.id);
        if (!uploadTokRe) {
          return sendJson(res, 503, { ok: false, error: "Could not issue upload session." });
        }
        var baseUre = baseUrlForInsuredLinks(req);
        if (!baseUre) {
          return sendJson(res, 503, {
            ok: false,
            error:
              "Set SITE_URL (or INSURED_PUBLIC_SITE_URL) on the server so upload links work in email.",
          });
        }
        var uploadUrlRe =
          baseUre + "/insured-upload.html?upload_token=" + encodeURIComponent(uploadTokRe);
        try {
          await sendUploadLinkEmail(req, normEmail(rowRe.email), rowRe.name, uploadUrlRe);
        } catch (mailErrU) {
          console.error("[insured] resend sendUploadLinkEmail", mailErrU);
          return sendJson(res, 502, {
            ok: false,
            error: "Could not send email. Check SMTP settings.",
          });
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        return sendJson(res, 200, { ok: true, message: "Upload link email sent." });
      }

      if (rowRe.status === "completed") {
        var uploadTokDone = insuredToken.signInsuredUploadToken(rowRe.id);
        if (!uploadTokDone) {
          return sendJson(res, 503, { ok: false, error: "Could not issue upload session." });
        }
        var baseDone = baseUrlForInsuredLinks(req);
        if (!baseDone) {
          return sendJson(res, 503, {
            ok: false,
            error:
              "Set SITE_URL (or INSURED_PUBLIC_SITE_URL) on the server so upload links work in email.",
          });
        }
        var uploadUrlDone =
          baseDone + "/insured-upload.html?upload_token=" + encodeURIComponent(uploadTokDone);
        try {
          await sendUploadLinkEmailOopsResend(req, normEmail(rowRe.email), rowRe.name, uploadUrlDone);
        } catch (mailErrD) {
          console.error("[insured] resend sendUploadLinkEmailOopsResend", mailErrD);
          return sendJson(res, 502, {
            ok: false,
            error: "Could not send email. Check SMTP settings.",
          });
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        return sendJson(res, 200, { ok: true, message: "Reminder email sent." });
      }

      return sendJson(res, 400, { ok: false, error: "Unexpected insured status." });
    }

    if (action === "verify_mfa") {
      var linkTok = typeof body.verifyToken === "string" ? body.verifyToken.trim() : "";
      var codeIn = typeof body.code === "string" ? body.code.trim().replace(/\s/g, "") : "";
      var vt = insuredToken.verifyInsuredVerifyLink(linkTok);
      if (!vt.ok) {
        return sendJson(res, 400, { ok: false, error: vt.error || "Invalid link." });
      }
      if (!/^\d{6}$/.test(codeIn)) {
        return sendJson(res, 400, { ok: false, error: "Enter the 6-digit code." });
      }

      var row = await insuredDb.getById(vt.insuredId);
      if (!row) {
        return sendJson(res, 400, { ok: false, error: "Insured record not found." });
      }
      if (normEmail(row.email) !== normEmail(vt.email)) {
        return sendJson(res, 400, { ok: false, error: "Invalid link." });
      }
      if (row.status !== "pending_mfa") {
        return sendJson(res, 400, { ok: false, error: "This verification was already completed." });
      }
      var mfaExp = row.mfa_expires_at ? new Date(row.mfa_expires_at).getTime() : 0;
      if (Date.now() > mfaExp) {
        return sendJson(res, 400, { ok: false, error: "This code has expired. Ask your broker to resend." });
      }

      var okCode = insuredMfa.verifyMfaCode(codeIn, row.mfa_code_hash);
      if (!okCode) {
        return sendJson(res, 400, { ok: false, error: "Invalid verification code." });
      }

      await insuredDb.clearMfaAndSetAwaitingUpload(row.id);

      var uploadTok = insuredToken.signInsuredUploadToken(row.id);
      if (!uploadTok) {
        return sendJson(res, 503, { ok: false, error: "Could not issue upload session." });
      }

      var baseU = baseUrlForInsuredLinks(req);
      if (!baseU) {
        return sendJson(res, 503, {
          ok: false,
          error:
            "Set SITE_URL (or INSURED_PUBLIC_SITE_URL) on the server to your public site (e.g. https://www.underwritly.com) so upload links work.",
        });
      }
      var uploadUrl =
        baseU + "/insured-upload.html?upload_token=" + encodeURIComponent(uploadTok);

      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, {
        ok: true,
        uploadToken: uploadTok,
        uploadUrl: uploadUrl,
      });
    }

    if (action === "upload") {
      var uploadTokIn = typeof body.uploadToken === "string" ? body.uploadToken.trim() : "";
      var ut = insuredToken.verifyInsuredUploadToken(uploadTokIn);
      if (!ut.ok) {
        return sendJson(res, 401, { ok: false, error: ut.error || "Invalid session." });
      }

      var rowU = await insuredDb.getById(ut.insuredId);
      if (!rowU || (rowU.status !== "awaiting_upload" && rowU.status !== "completed")) {
        return sendJson(res, 400, {
          ok: false,
          error: "Upload is not allowed for this record (wrong status).",
        });
      }

      var files = body.files;
      if (!Array.isArray(files) || !files.length) {
        return sendJson(res, 400, { ok: false, error: "Add at least one file (PDF or CSV)." });
      }
      if (files.length > MAX_FILES) {
        return sendJson(res, 400, { ok: false, error: "Too many files (max " + MAX_FILES + ")." });
      }

      var stored = [];
      var totalDecoded = 0;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f || typeof f !== "object") continue;
        var fname = typeof f.name === "string" ? f.name.trim().slice(0, 180) : "upload.bin";
        var mime = typeof f.mime === "string" ? f.mime.trim().slice(0, 120) : "application/octet-stream";
        var b64 = typeof f.bodyBase64 === "string" ? f.bodyBase64 : "";
        if (!b64) {
          return sendJson(res, 400, { ok: false, error: "Each file must include bodyBase64." });
        }
        var buf;
        try {
          buf = Buffer.from(b64, "base64");
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: "Invalid file encoding." });
        }
        if (buf.length > MAX_FILE_BYTES) {
          return sendJson(res, 400, { ok: false, error: "Each file must be at most 1.5 MB." });
        }
        totalDecoded += buf.length;
        if (totalDecoded > MAX_TOTAL_UPLOAD_BYTES) {
          return sendJson(res, 400, {
            ok: false,
            error:
              "Combined file size exceeds 4 MB. Use smaller or compressed PDFs, or contact your broker.",
          });
        }
        if (mime.indexOf("pdf") < 0 && mime.indexOf("csv") < 0 && mime.indexOf("spreadsheet") < 0) {
          if (fname.toLowerCase().indexOf(".pdf") < 0 && fname.toLowerCase().indexOf(".csv") < 0) {
            return sendJson(res, 400, {
              ok: false,
              error: "Only PDF or CSV uploads are allowed for IFTA reports.",
            });
          }
        }
        stored.push({
          name: fname,
          mime: mime,
          size: buf.length,
          receivedAt: new Date().toISOString(),
          bodyBase64: b64,
        });
      }

      var updated = await insuredDb.appendUploadsAndComplete(ut.insuredId, stored);
      if (!updated) {
        return sendJson(res, 500, { ok: false, error: "Could not save uploads." });
      }

      var brokerEm = normEmail(updated.broker_email);
      var insEm = normEmail(updated.email);
      var insName = updated.name || "";

      try {
        await sendCompletionEmails(req, brokerEm, insEm, insName, stored.length);
      } catch (e) {
        console.error("[insured] completion email", e);
      }

      var webhookPayload = {
        event: "insured_ifta_upload",
        brokerEmail: brokerEm,
        companyKey: updated.company_key,
        insuredId: updated.id,
        insuredName: insName,
        insuredEmail: insEm,
        files: stored.map(function (s) {
          return { name: s.name, mime: s.mime, size: s.size, bodyBase64: s.bodyBase64 };
        }),
      };
      iftaIngestWebhook.postIftaWebhook(webhookPayload).catch(function (whErr) {
        console.error("[insured] IFTA ingest webhook failed (uploads still saved)", whErr && whErr.message);
      });

      var uploadTotalAfter = null;
      try {
        var up = updated.uploads;
        if (typeof up === "string") up = JSON.parse(up);
        if (Array.isArray(up)) uploadTotalAfter = up.length;
      } catch (eUp) {
        uploadTotalAfter = null;
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, {
        ok: true,
        message:
          "Thank you for uploading your IFTA reports. Your broker has been sent the files and will review them in IFTA Summary.",
        uploadTotal: uploadTotalAfter,
      });
    }

    return sendJson(res, 400, { ok: false, error: "Unknown action." });
  } catch (fatal) {
    console.error("[insured-api] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
