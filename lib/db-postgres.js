/**
 * PostgreSQL via DATABASE_URL (Neon, Vercel Postgres, Supabase, etc.).
 * Replaces Redis/KV for form submissions and user accounts.
 */

var _sql = null;
var _schemaPromise = null;

function getDatabaseUrl() {
  return (process.env.DATABASE_URL || "").trim();
}

function hasPostgres() {
  return !!getDatabaseUrl();
}

function getSql() {
  if (!hasPostgres()) return null;
  if (!_sql) {
    var neon = require("@neondatabase/serverless").neon;
    _sql = neon(getDatabaseUrl());
  }
  return _sql;
}

function ensureSchema() {
  if (_schemaPromise) return _schemaPromise;
  var sql = getSql();
  if (!sql) {
    _schemaPromise = Promise.resolve();
    return _schemaPromise;
  }
  _schemaPromise = (async function () {
    await sql`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id SERIAL PRIMARY KEY,
        form_type VARCHAR(40) NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS app_users (
        email VARCHAR(320) PRIMARY KEY,
        record JSONB NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS profile_drafts (
        email VARCHAR(320) PRIMARY KEY,
        draft JSONB NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS early_access_review (
        email VARCHAR(320) PRIMARY KEY,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        name TEXT,
        company TEXT,
        phone TEXT,
        profile_submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ
      )
    `;
  })().catch(function (e) {
    console.error("[db-postgres] ensureSchema", e && e.message);
    throw e;
  });
  return _schemaPromise;
}

module.exports = {
  hasPostgres: hasPostgres,
  getSql: getSql,
  ensureSchema: ensureSchema,
};
