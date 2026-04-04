/**
 * Insured records (broker-scoped) for IFTA intake flow.
 */

var dbPostgres = require("./db-postgres");

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

var _schemaPromise = null;

function ensureInsuredSchema() {
  if (_schemaPromise) return _schemaPromise;
  var sql = dbPostgres.getSql();
  if (!sql) {
    _schemaPromise = Promise.resolve();
    return _schemaPromise;
  }
  _schemaPromise = (async function () {
    await dbPostgres.ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS insureds (
        id SERIAL PRIMARY KEY,
        broker_email VARCHAR(320) NOT NULL,
        company_key VARCHAR(128) NOT NULL,
        name TEXT NOT NULL,
        email VARCHAR(320) NOT NULL,
        phone VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending_mfa',
        mfa_code_hash TEXT,
        mfa_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        verified_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        uploads JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS insureds_broker_email_idx ON insureds (broker_email)
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS insureds_broker_email_unique
      ON insureds (broker_email, email)
    `;
    await sql`
      ALTER TABLE insureds ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(320)
    `;
  })().catch(function (e) {
    console.error("[insured-db] ensureInsuredSchema", e && e.message);
    throw e;
  });
  return _schemaPromise;
}

function rowToPublic(row) {
  if (!row) return null;
  var uploads = row.uploads;
  if (typeof uploads === "string") {
    try {
      uploads = JSON.parse(uploads);
    } catch (e) {
      uploads = [];
    }
  }
  if (!Array.isArray(uploads)) uploads = [];
  var uc =
    row.upload_count != null
      ? parseInt(row.upload_count, 10)
      : Array.isArray(uploads)
        ? uploads.length
        : 0;
  if (isNaN(uc)) uc = 0;
  return {
    id: row.id,
    brokerEmail: row.broker_email || "",
    companyKey: row.company_key || "",
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    status: row.status || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : "",
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : "",
    uploads: uploads,
    uploadCount: uc,
    createdByEmail: row.created_by_email ? normEmail(row.created_by_email) : "",
  };
}

async function listByBroker(brokerEmail) {
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var be = normEmail(brokerEmail);
  if (!be) return [];
  var rows = await sql`
    SELECT id, broker_email, company_key, name, email, phone, status,
           created_at, verified_at, completed_at, created_by_email,
           COALESCE(jsonb_array_length(uploads), 0) AS upload_count
    FROM insureds
    WHERE broker_email = ${be}
    ORDER BY created_at DESC
  `;
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var rp = rowToPublic(rows[i]);
    if (rp) rp.uploads = [];
    out.push(rp);
  }
  return out;
}

async function getById(id) {
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var n = parseInt(id, 10);
  if (isNaN(n) || n < 1) return null;
  var rows = await sql`
    SELECT id, broker_email, company_key, name, email, phone, status,
           mfa_code_hash, mfa_expires_at, created_at, verified_at, completed_at, uploads
    FROM insureds WHERE id = ${n}
  `;
  if (!rows || !rows.length) return null;
  return rows[0];
}

async function getByBrokerAndId(brokerEmail, id) {
  var row = await getById(id);
  if (!row) return null;
  if (normEmail(row.broker_email) !== normEmail(brokerEmail)) return null;
  return row;
}

async function createInsured(
  brokerEmail,
  companyKey,
  name,
  email,
  phone,
  mfaHash,
  mfaExpiresIso,
  createdByEmail
) {
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var be = normEmail(brokerEmail);
  var em = normEmail(email);
  var creator =
    createdByEmail && String(createdByEmail).trim()
      ? normEmail(createdByEmail)
      : be;
  var rows = await sql`
    INSERT INTO insureds (broker_email, company_key, name, email, phone, status, mfa_code_hash, mfa_expires_at, created_by_email)
    VALUES (
      ${be},
      ${String(companyKey || "").slice(0, 128)},
      ${String(name || "").trim()},
      ${em},
      ${String(phone || "").trim()},
      'pending_mfa',
      ${mfaHash},
      ${mfaExpiresIso}::timestamptz,
      ${creator}
    )
    RETURNING id, broker_email, company_key, name, email, phone, status, created_at, verified_at, completed_at, uploads, created_by_email
  `;
  return rows && rows[0] ? rowToPublic(rows[0]) : null;
}

async function clearMfaAndSetAwaitingUpload(id) {
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var n = parseInt(id, 10);
  if (isNaN(n) || n < 1) return false;
  var now = new Date().toISOString();
  await sql`
    UPDATE insureds
    SET status = 'awaiting_upload',
        mfa_code_hash = NULL,
        mfa_expires_at = NULL,
        verified_at = ${now}::timestamptz
    WHERE id = ${n} AND status = 'pending_mfa'
  `;
  return true;
}

async function appendUploadsAndComplete(id, newFiles) {
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var n = parseInt(id, 10);
  if (isNaN(n) || n < 1) return null;
  var row = await getById(n);
  if (!row) return null;
  var arr = Array.isArray(newFiles) ? newFiles : [];
  if (!arr.length) return null;
  var now = new Date().toISOString();
  var chunk = JSON.stringify(arr);
  await sql`
    UPDATE insureds
    SET uploads = COALESCE(uploads, '[]'::jsonb) || ${chunk}::jsonb,
        status = 'completed',
        completed_at = ${now}::timestamptz
    WHERE id = ${n}
  `;
  return getById(n);
}

async function deleteAllForBrokerEmail(brokerEmail) {
  if (!dbPostgres.hasPostgres()) return { ok: true, deleted: 0 };
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var be = normEmail(brokerEmail);
  if (!be) return { ok: false, error: "Invalid email." };
  var rows = await sql`DELETE FROM insureds WHERE broker_email = ${be} RETURNING id`;
  return { ok: true, deleted: rows ? rows.length : 0 };
}

async function deleteByBrokerAndId(brokerEmail, id) {
  if (!dbPostgres.hasPostgres()) {
    return { ok: false, error: "Insured storage requires DATABASE_URL." };
  }
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var n = parseInt(id, 10);
  if (isNaN(n) || n < 1) return { ok: false, error: "Invalid insured id." };
  var be = normEmail(brokerEmail);
  if (!be) return { ok: false, error: "Invalid broker." };
  var rows = await sql`
    DELETE FROM insureds WHERE id = ${n} AND broker_email = ${be} RETURNING id
  `;
  if (!rows || !rows.length) return { ok: false, error: "Insured not found." };
  return { ok: true, deleted: 1 };
}

async function getOrgDashboardStats(brokerEmail) {
  if (!dbPostgres.hasPostgres()) {
    return { insuredCount: 0, totalReportFiles: 0, byCreator: [] };
  }
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var be = normEmail(brokerEmail);
  if (!be) return { insuredCount: 0, totalReportFiles: 0, byCreator: [] };
  var agg = await sql`
    SELECT
      COUNT(*)::int AS insured_count,
      COALESCE(SUM(COALESCE(jsonb_array_length(uploads), 0)), 0) AS total_files
    FROM insureds
    WHERE broker_email = ${be}
  `;
  var insuredCount = 0;
  var totalReportFiles = 0;
  if (agg && agg[0]) {
    insuredCount = parseInt(agg[0].insured_count, 10) || 0;
    totalReportFiles = parseInt(String(agg[0].total_files || 0), 10) || 0;
  }
  var byRows = await sql`
    SELECT created_by_email, COUNT(*)::int AS cnt
    FROM insureds
    WHERE broker_email = ${be}
    GROUP BY created_by_email
    ORDER BY cnt DESC
  `;
  var byCreator = [];
  for (var i = 0; i < (byRows || []).length; i++) {
    var r = byRows[i];
    byCreator.push({
      email: r.created_by_email ? normEmail(r.created_by_email) : "",
      label: r.created_by_email ? normEmail(r.created_by_email) : "Legacy (before tracking)",
      insuredsCreated: parseInt(r.cnt, 10) || 0,
    });
  }
  return {
    insuredCount: insuredCount,
    totalReportFiles: totalReportFiles,
    byCreator: byCreator,
  };
}

async function updateMfaForPendingInsured(brokerEmail, insuredId, mfaHash, mfaExpiresIso) {
  await ensureInsuredSchema();
  var sql = dbPostgres.getSql();
  var n = parseInt(insuredId, 10);
  if (isNaN(n) || n < 1) return false;
  var be = normEmail(brokerEmail);
  var rows = await sql`
    UPDATE insureds
    SET mfa_code_hash = ${mfaHash},
        mfa_expires_at = ${mfaExpiresIso}::timestamptz
    WHERE id = ${n} AND broker_email = ${be} AND status = 'pending_mfa'
    RETURNING id
  `;
  return !!(rows && rows.length);
}

module.exports = {
  ensureInsuredSchema: ensureInsuredSchema,
  hasPostgres: function () {
    return dbPostgres.hasPostgres();
  },
  deleteAllForBrokerEmail: deleteAllForBrokerEmail,
  deleteByBrokerAndId: deleteByBrokerAndId,
  updateMfaForPendingInsured: updateMfaForPendingInsured,
  listByBroker: listByBroker,
  getById: getById,
  getByBrokerAndId: getByBrokerAndId,
  createInsured: createInsured,
  clearMfaAndSetAwaitingUpload: clearMfaAndSetAwaitingUpload,
  appendUploadsAndComplete: appendUploadsAndComplete,
  rowToPublic: rowToPublic,
  getOrgDashboardStats: getOrgDashboardStats,
};
