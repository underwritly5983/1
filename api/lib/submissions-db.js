/**
 * Form submissions: Vercel KV (Redis) when KV_REST_* is set — works on Vercel and locally.
 * Fallback: SQLite file .data/submissions.sqlite when not on Vercel and KV is not configured.
 * On Vercel without KV, inserts are skipped (configure Redis from Vercel Marketplace).
 */

var fs = require("fs");
var path = require("path");

var dbPath = path.join(__dirname, "..", "..", ".data", "submissions.sqlite");
var _sqlite = null;

var PREFIX = "uw:submissions:v1:";
var K_EARLY_LIST = PREFIX + "early_access:list";
var K_EARLY_SEQ = PREFIX + "early_access:seq";
var K_PROF_LIST = PREFIX + "profile_registration:list";
var K_PROF_SEQ = PREFIX + "profile_registration:seq";
var K_ACCT_LIST = PREFIX + "account_completion:list";
var K_ACCT_SEQ = PREFIX + "account_completion:seq";

function hasKvEnv() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useSqliteFile() {
  if (hasKvEnv()) return false;
  return process.env.VERCEL !== "1";
}

function getSqlite() {
  if (!useSqliteFile()) return null;
  if (_sqlite) return _sqlite;
  try {
    var Database = require("better-sqlite3");
    var dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    var db = new Database(dbPath);
    db.exec(
      "CREATE TABLE IF NOT EXISTS early_access (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "name TEXT NOT NULL," +
        "email TEXT NOT NULL," +
        "phone TEXT NOT NULL," +
        "source TEXT NOT NULL," +
        "usage TEXT NOT NULL," +
        "submitted_at TEXT NOT NULL," +
        "received_at TEXT NOT NULL" +
        ");" +
        "CREATE TABLE IF NOT EXISTS profile_registration (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "name TEXT NOT NULL," +
        "email TEXT NOT NULL," +
        "company TEXT NOT NULL," +
        "role TEXT NOT NULL," +
        "phone TEXT NOT NULL," +
        "submitted_at TEXT NOT NULL," +
        "received_at TEXT NOT NULL" +
        ");" +
        "CREATE TABLE IF NOT EXISTS account_completion (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "email TEXT NOT NULL," +
        "name TEXT," +
        "company TEXT," +
        "completed_at TEXT NOT NULL," +
        "received_at TEXT NOT NULL" +
        ");"
    );
    _sqlite = db;
    return _sqlite;
  } catch (e) {
    console.error("[submissions-db] sqlite open failed", e && e.message);
    return null;
  }
}

async function getKv() {
  return require("@vercel/kv").kv;
}

function nowIso() {
  return new Date().toISOString();
}

function parseListJson(rawList) {
  if (!rawList || !rawList.length) return [];
  var out = [];
  for (var i = 0; i < rawList.length; i++) {
    try {
      out.push(JSON.parse(rawList[i]));
    } catch (e) {
      /* skip bad row */
    }
  }
  return out.slice().reverse();
}

async function insertEarlyAccessKv(row) {
  var kv = await getKv();
  var id = await kv.incr(K_EARLY_SEQ);
  var payload = {
    id: id,
    name: String(row.name || ""),
    email: String(row.email || "").toLowerCase(),
    phone: String(row.phone || ""),
    source: String(row.source || ""),
    usage: String(row.usage || ""),
    submittedAt: String(row.submittedAt || nowIso()),
    receivedAt: nowIso(),
  };
  await kv.rpush(K_EARLY_LIST, JSON.stringify(payload));
}

function insertEarlyAccessSqlite(row) {
  var db = getSqlite();
  if (!db || !row) return;
  db.prepare(
    "INSERT INTO early_access (name, email, phone, source, usage, submitted_at, received_at) VALUES (?,?,?,?,?,?,?)"
  ).run(
    String(row.name || ""),
    String(row.email || "").toLowerCase(),
    String(row.phone || ""),
    String(row.source || ""),
    String(row.usage || ""),
    String(row.submittedAt || nowIso()),
    nowIso()
  );
}

async function insertProfileRegistrationKv(row) {
  var kv = await getKv();
  var id = await kv.incr(K_PROF_SEQ);
  var payload = {
    id: id,
    name: String(row.name || ""),
    email: String(row.email || "").toLowerCase(),
    company: String(row.company || ""),
    role: String(row.role || ""),
    phone: String(row.phone || ""),
    submittedAt: String(row.submittedAt || nowIso()),
    receivedAt: nowIso(),
  };
  await kv.rpush(K_PROF_LIST, JSON.stringify(payload));
}

function insertProfileRegistrationSqlite(row) {
  var db = getSqlite();
  if (!db || !row) return;
  db.prepare(
    "INSERT INTO profile_registration (name, email, company, role, phone, submitted_at, received_at) VALUES (?,?,?,?,?,?,?)"
  ).run(
    String(row.name || ""),
    String(row.email || "").toLowerCase(),
    String(row.company || ""),
    String(row.role || ""),
    String(row.phone || ""),
    String(row.submittedAt || nowIso()),
    nowIso()
  );
}

async function insertAccountCompletionKv(row) {
  var kv = await getKv();
  var id = await kv.incr(K_ACCT_SEQ);
  var payload = {
    id: id,
    email: String(row.email || "").toLowerCase(),
    name: row.name != null ? String(row.name) : "",
    company: row.company != null ? String(row.company) : "",
    completedAt: String(row.completedAt || nowIso()),
    receivedAt: nowIso(),
  };
  await kv.rpush(K_ACCT_LIST, JSON.stringify(payload));
}

function insertAccountCompletionSqlite(row) {
  var db = getSqlite();
  if (!db || !row) return;
  db.prepare(
    "INSERT INTO account_completion (email, name, company, completed_at, received_at) VALUES (?,?,?,?,?)"
  ).run(
    String(row.email || "").toLowerCase(),
    row.name != null ? String(row.name) : "",
    row.company != null ? String(row.company) : "",
    String(row.completedAt || nowIso()),
    nowIso()
  );
}

async function insertEarlyAccess(row) {
  if (!row) return;
  try {
    if (hasKvEnv()) {
      await insertEarlyAccessKv(row);
      return;
    }
    if (useSqliteFile()) {
      insertEarlyAccessSqlite(row);
    }
  } catch (e) {
    console.error("[submissions-db] insertEarlyAccess", e && e.message);
  }
}

async function insertProfileRegistration(row) {
  if (!row) return;
  try {
    if (hasKvEnv()) {
      await insertProfileRegistrationKv(row);
      return;
    }
    if (useSqliteFile()) {
      insertProfileRegistrationSqlite(row);
    }
  } catch (e) {
    console.error("[submissions-db] insertProfileRegistration", e && e.message);
  }
}

async function insertAccountCompletion(row) {
  if (!row) return;
  try {
    if (hasKvEnv()) {
      await insertAccountCompletionKv(row);
      return;
    }
    if (useSqliteFile()) {
      insertAccountCompletionSqlite(row);
    }
  } catch (e) {
    console.error("[submissions-db] insertAccountCompletion", e && e.message);
  }
}

async function listAllKv() {
  var kv = await getKv();
  var earlyRaw = await kv.lrange(K_EARLY_LIST, 0, -1);
  var profRaw = await kv.lrange(K_PROF_LIST, 0, -1);
  var acctRaw = await kv.lrange(K_ACCT_LIST, 0, -1);
  return {
    earlyAccess: parseListJson(earlyRaw),
    profileRegistration: parseListJson(profRaw),
    accountCompletions: parseListJson(acctRaw),
  };
}

function listAllSqlite() {
  var db = getSqlite();
  if (!db) {
    return { earlyAccess: [], profileRegistration: [], accountCompletions: [] };
  }
  try {
    var early = db
      .prepare(
        "SELECT id, name, email, phone, source, usage, submitted_at AS submittedAt, received_at AS receivedAt FROM early_access ORDER BY id DESC"
      )
      .all();
    var prof = db
      .prepare(
        "SELECT id, name, email, company, role, phone, submitted_at AS submittedAt, received_at AS receivedAt FROM profile_registration ORDER BY id DESC"
      )
      .all();
    var acct = db
      .prepare(
        "SELECT id, email, name, company, completed_at AS completedAt, received_at AS receivedAt FROM account_completion ORDER BY id DESC"
      )
      .all();
    return {
      earlyAccess: early || [],
      profileRegistration: prof || [],
      accountCompletions: acct || [],
    };
  } catch (e) {
    console.error("[submissions-db] listAllSqlite", e && e.message);
    return { earlyAccess: [], profileRegistration: [], accountCompletions: [] };
  }
}

async function listAll() {
  try {
    if (hasKvEnv()) {
      return await listAllKv();
    }
    return listAllSqlite();
  } catch (e) {
    console.error("[submissions-db] listAll", e && e.message);
    return { earlyAccess: [], profileRegistration: [], accountCompletions: [] };
  }
}

function isEnabled() {
  return hasKvEnv() || !!getSqlite();
}

module.exports = {
  isEnabled: isEnabled,
  hasKvStorage: hasKvEnv,
  insertEarlyAccess: insertEarlyAccess,
  insertProfileRegistration: insertProfileRegistration,
  insertAccountCompletion: insertAccountCompletion,
  listAll: listAll,
};
