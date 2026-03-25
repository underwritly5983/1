/**
 * Form submissions: PostgreSQL when DATABASE_URL is set (Neon, etc.).
 * Local dev without DATABASE_URL: SQLite at .data/submissions.sqlite.
 */

var fs = require("fs");
var path = require("path");

var dbPath = path.join(__dirname, "..", ".data", "submissions.sqlite");
var _sqlite = null;

var dbPostgres = require("./db-postgres");

function useSqliteFile() {
  if (dbPostgres.hasPostgres()) return false;
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

function nowIso() {
  return new Date().toISOString();
}

function parsePayloadCell(p) {
  if (p == null) return {};
  if (typeof p === "object") return p;
  if (typeof p === "string") {
    try {
      return JSON.parse(p);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function mergeRow(row) {
  var p = parsePayloadCell(row.payload);
  var out = {};
  Object.keys(p).forEach(function (k) {
    out[k] = p[k];
  });
  out.id = row.id;
  if (!out.receivedAt && row.received_at) {
    try {
      out.receivedAt = new Date(row.received_at).toISOString();
    } catch (e) {
      out.receivedAt = String(row.received_at);
    }
  }
  if (!out.receivedAt) out.receivedAt = nowIso();
  return out;
}

async function insertEarlyAccessPostgres(row) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var receivedAt = nowIso();
  var payload = {
    name: String(row.name || ""),
    email: String(row.email || "").toLowerCase(),
    phone: String(row.phone || ""),
    source: String(row.source || ""),
    usage: String(row.usage || ""),
    submittedAt: String(row.submittedAt || receivedAt),
    receivedAt: receivedAt,
  };
  var js = JSON.stringify(payload);
  await sql`
    INSERT INTO form_submissions (form_type, payload)
    VALUES ('early_access', ${js}::jsonb)
  `;
}

async function insertProfileRegistrationPostgres(row) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var receivedAt = nowIso();
  var payload = {
    name: String(row.name || ""),
    email: String(row.email || "").toLowerCase(),
    company: String(row.company || ""),
    role: String(row.role || ""),
    phone: String(row.phone || ""),
    submittedAt: String(row.submittedAt || receivedAt),
    receivedAt: receivedAt,
  };
  var js = JSON.stringify(payload);
  await sql`
    INSERT INTO form_submissions (form_type, payload)
    VALUES ('profile_registration', ${js}::jsonb)
  `;
}

async function insertAccountCompletionPostgres(row) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var receivedAt = nowIso();
  var payload = {
    email: String(row.email || "").toLowerCase(),
    name: row.name != null ? String(row.name) : "",
    company: row.company != null ? String(row.company) : "",
    completedAt: String(row.completedAt || receivedAt),
    receivedAt: receivedAt,
  };
  var js = JSON.stringify(payload);
  await sql`
    INSERT INTO form_submissions (form_type, payload)
    VALUES ('account_completion', ${js}::jsonb)
  `;
}

async function listAllPostgres() {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var rows = await sql`
    SELECT id, form_type, received_at, payload
    FROM form_submissions
    ORDER BY id DESC
  `;
  var early = [];
  var prof = [];
  var acct = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var ft = String(row.form_type || "");
    var merged = mergeRow(row);
    if (ft === "early_access") early.push(merged);
    else if (ft === "profile_registration") prof.push(merged);
    else if (ft === "account_completion") acct.push(merged);
  }
  return {
    earlyAccess: early,
    profileRegistration: prof,
    accountCompletions: acct,
  };
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
    if (dbPostgres.hasPostgres()) {
      await insertEarlyAccessPostgres(row);
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
    if (dbPostgres.hasPostgres()) {
      await insertProfileRegistrationPostgres(row);
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
    if (dbPostgres.hasPostgres()) {
      await insertAccountCompletionPostgres(row);
      return;
    }
    if (useSqliteFile()) {
      insertAccountCompletionSqlite(row);
    }
  } catch (e) {
    console.error("[submissions-db] insertAccountCompletion", e && e.message);
  }
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
    if (dbPostgres.hasPostgres()) {
      return await listAllPostgres();
    }
    return listAllSqlite();
  } catch (e) {
    console.error("[submissions-db] listAll", e && e.message);
    return { earlyAccess: [], profileRegistration: [], accountCompletions: [] };
  }
}

function isEnabled() {
  return dbPostgres.hasPostgres() || !!getSqlite();
}

module.exports = {
  isEnabled: isEnabled,
  hasPostgresStorage: function () {
    return dbPostgres.hasPostgres();
  },
  insertEarlyAccess: insertEarlyAccess,
  insertProfileRegistration: insertProfileRegistration,
  insertAccountCompletion: insertAccountCompletion,
  listAll: listAll,
};
