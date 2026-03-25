/**
 * Tracks profile registrations awaiting admin approval (PostgreSQL only).
 */

var dbPostgres = require("./db-postgres");
var mailer = require("./mailer");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function upsertPendingFromProfile(row) {
  if (!dbPostgres.hasPostgres()) return;
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var em = normEmail(row.email);
  if (!em) return;
  var submitted = row.submittedAt || new Date().toISOString();
  await sql`
    INSERT INTO early_access_review (email, status, name, company, phone, profile_submitted_at)
    VALUES (${em}, 'pending', ${row.name}, ${row.company}, ${row.phone}, ${submitted}::timestamptz)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      company = EXCLUDED.company,
      phone = EXCLUDED.phone,
      profile_submitted_at = EXCLUDED.profile_submitted_at,
      status = CASE WHEN early_access_review.status = 'approved' THEN 'approved' ELSE 'pending' END
  `;
}

async function listPending() {
  if (!dbPostgres.hasPostgres()) return [];
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var rows = await sql`
    SELECT email, name, company, phone, profile_submitted_at, created_at
    FROM early_access_review
    WHERE status = 'pending'
    ORDER BY profile_submitted_at DESC NULLS LAST
  `;
  return (rows || []).map(function (r) {
    return {
      email: r.email,
      name: r.name || "",
      company: r.company || "",
      phone: r.phone || "",
      profileSubmittedAt: r.profile_submitted_at
        ? new Date(r.profile_submitted_at).toISOString()
        : "",
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
    };
  });
}

async function approveEarlyAccess(email, req) {
  var em = normEmail(email);
  if (!em) return { ok: false, error: "Invalid email." };
  if (!dbPostgres.hasPostgres()) {
    return { ok: false, error: "Database is not configured." };
  }
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var rows = await sql`
    UPDATE early_access_review
    SET status = 'approved', approved_at = NOW()
    WHERE email = ${em} AND status = 'pending'
    RETURNING email, name, company
  `;
  if (!rows || !rows.length) {
    return { ok: false, error: "No pending request for that email, or it was already approved." };
  }
  var row = rows[0];
  var sent = await sendApprovalEmail(row, req);
  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }
  return { ok: true };
}

async function sendApprovalEmail(row, req) {
  var transporter = mailer.createTransport();
  var from = mailer.getMailFrom();
  if (!transporter || !from) {
    return { ok: false, error: "Email is not configured (SMTP_USER, SMTP_PASS, MAIL_FROM)." };
  }
  var profileAccess = require("./profile-access-token");
  var base = req
    ? profileAccess.getPublicSiteBaseForEmailFromRequest(req)
    : profileAccess.getPublicSiteBaseForEmail();
  var siteHint = base ? base.replace(/^https?:\/\//, "") : "our site";
  var first = String(row.name || "there").split(/\s+/)[0];
  var subject = "Early access approved — Underwritly";
  var text =
    "Hi " +
    first +
    ",\n\n" +
    "Your broker profile is registered with Underwritly, and your early access has been approved. " +
    "You can sign in with the email address you used when you completed registration.\n\n" +
    "If you have not finished choosing your password yet, check your earlier email for the secure \"Complete registration\" link, or visit " +
    siteHint +
    " and use the login or complete-registration flow.\n\n" +
    "If you have questions, reply to this message or write to info@underwritly.com.\n\n" +
    "— The Underwritly team";

  var html =
    "<p>Hi " +
    escapeHtml(first) +
    ",</p>" +
    "<p>Your broker profile is registered with <strong>Underwritly</strong>, and your <strong>early access has been approved</strong>.</p>" +
    "<p>You can sign in with the email address you used when you completed registration. " +
    "If you still need to set your password, use the <strong>Complete registration</strong> link from your profile confirmation email.</p>" +
    "<p>Questions? Reply to this message or contact " +
    '<a href="mailto:info@underwritly.com">info@underwritly.com</a>.</p>' +
    "<p>— The Underwritly team</p>";

  try {
    await transporter.sendMail({
      from: from,
      to: row.email,
      replyTo: "info@underwritly.com",
      subject: subject,
      text: text,
      html: html,
    });
  } catch (e) {
    console.error("[early-access-review] sendApprovalEmail", e && e.message);
    return { ok: false, error: "Could not send approval email. Check SMTP logs." };
  } finally {
    try {
      transporter.close();
    } catch (closeErr) {
      /* ignore */
    }
  }
  return { ok: true };
}

async function deleteByEmail(email) {
  var em = normEmail(email);
  if (!em) return { ok: false, error: "Invalid email." };
  if (!dbPostgres.hasPostgres()) return { ok: true };
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  await sql`DELETE FROM early_access_review WHERE email = ${em}`;
  return { ok: true };
}

module.exports = {
  upsertPendingFromProfile: upsertPendingFromProfile,
  listPending: listPending,
  approveEarlyAccess: approveEarlyAccess,
  deleteByEmail: deleteByEmail,
};
