/**
 * Pending sub-broker invitations (email code + complete-sub-broker page).
 * Requires PostgreSQL (same as insureds).
 */

var dbPostgres = require("./db-postgres");

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function upsertInvite(primaryEmail, subEmail, codeHash, expiresIso) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  if (!sql) return { ok: false, error: "Database not configured." };
  var pe = normEmail(primaryEmail);
  var se = normEmail(subEmail);
  await sql`
    INSERT INTO sub_broker_invites (sub_email, primary_email, code_hash, expires_at)
    VALUES (${se}, ${pe}, ${codeHash}, ${expiresIso}::timestamptz)
    ON CONFLICT (primary_email, sub_email)
    DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
  `;
  return { ok: true };
}

async function getInvite(primaryEmail, subEmail) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  if (!sql) return null;
  var pe = normEmail(primaryEmail);
  var se = normEmail(subEmail);
  var rows = await sql`
    SELECT sub_email, primary_email, code_hash, expires_at, created_at
    FROM sub_broker_invites
    WHERE primary_email = ${pe} AND sub_email = ${se}
    LIMIT 1
  `;
  return rows && rows[0] ? rows[0] : null;
}

/** Most recent pending invite for this email (sub completes without knowing primary org). */
async function getInviteBySubEmailOnly(subEmail) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  if (!sql) return null;
  var se = normEmail(subEmail);
  var rows = await sql`
    SELECT sub_email, primary_email, code_hash, expires_at, created_at
    FROM sub_broker_invites
    WHERE sub_email = ${se}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows && rows[0] ? rows[0] : null;
}

async function deleteInvite(primaryEmail, subEmail) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  if (!sql) return;
  var pe = normEmail(primaryEmail);
  var se = normEmail(subEmail);
  await sql`
    DELETE FROM sub_broker_invites
    WHERE primary_email = ${pe} AND sub_email = ${se}
  `;
}

async function listInvitesForPrimary(primaryEmail) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  if (!sql) return [];
  var pe = normEmail(primaryEmail);
  var rows = await sql`
    SELECT sub_email, expires_at, created_at
    FROM sub_broker_invites
    WHERE primary_email = ${pe}
    ORDER BY created_at DESC
  `;
  return (rows || []).map(function (r) {
    return {
      subEmail: normEmail(r.sub_email),
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : "",
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
    };
  });
}

module.exports = {
  upsertInvite: upsertInvite,
  getInvite: getInvite,
  getInviteBySubEmailOnly: getInviteBySubEmailOnly,
  deleteInvite: deleteInvite,
  listInvitesForPrimary: listInvitesForPrimary,
  hasPostgres: function () {
    return dbPostgres.hasPostgres();
  },
};
