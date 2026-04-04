/**
 * User accounts after "complete registration".
 * Production: PostgreSQL when DATABASE_URL is set (Neon, etc.).
 * Local dev without DATABASE_URL: JSON file at .data/users.json.
 */

var fs = require("fs");
var path = require("path");

var DATA_PATH = path.join(__dirname, "..", ".data", "users.json");

var dbPostgres = require("./db-postgres");
var companyKeyLib = require("./company-key");

function hasDatabaseUrl() {
  return !!(process.env.DATABASE_URL || "").trim();
}

function isVercelRuntime() {
  return process.env.VERCEL === "1";
}

function storeMode() {
  var force = (process.env.USER_STORE || "").trim().toLowerCase();
  if (force === "file") return "file";
  if (force === "postgres" && !hasDatabaseUrl()) {
    return isVercelRuntime() ? "missing" : "file";
  }
  if (hasDatabaseUrl()) return "postgres";
  if (isVercelRuntime()) return "missing";
  return "file";
}

function ensureDataDir() {
  var dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFileStore() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    var raw = fs.readFileSync(DATA_PATH, "utf8");
    var j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch (e) {
    return {};
  }
}

function writeFileStore(obj) {
  ensureDataDir();
  var tmp = DATA_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  fs.renameSync(tmp, DATA_PATH);
}

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function userKey(email) {
  return "user:" + normEmail(email);
}

function draftKey(email) {
  return "profiledraft:" + normEmail(email);
}

function parseJsonCell(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function getUserPostgres(email) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var norm = normEmail(email);
  if (!norm) return null;
  var rows = await sql`SELECT record FROM app_users WHERE email = ${norm}`;
  if (!rows || !rows.length) return null;
  return parseJsonCell(rows[0].record);
}

async function getUser(email) {
  var mode = storeMode();
  if (mode === "missing") {
    var err = new Error("DATABASE_URL must be set on Vercel for user accounts.");
    err.code = "STORE_CONFIG";
    throw err;
  }
  if (mode === "file") {
    var all = readFileStore();
    var raw = all[userKey(email)];
    return raw && typeof raw === "object" ? raw : null;
  }
  return getUserPostgres(email);
}

async function putUserPostgres(email, record) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var norm = normEmail(email);
  var js = JSON.stringify(record);
  await sql`
    INSERT INTO app_users (email, record)
    VALUES (${norm}, ${js}::jsonb)
    ON CONFLICT (email) DO UPDATE SET record = EXCLUDED.record
  `;
}

async function putUser(email, record) {
  var mode = storeMode();
  if (mode === "missing") {
    var err = new Error("DATABASE_URL must be set on Vercel for user accounts.");
    err.code = "STORE_CONFIG";
    throw err;
  }
  if (mode === "file") {
    var all = readFileStore();
    all[userKey(email)] = record;
    writeFileStore(all);
    return;
  }
  await putUserPostgres(email, record);
}

async function putProfileDraftPostgres(email, draft) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var norm = normEmail(email);
  var js = JSON.stringify(draft);
  await sql`
    INSERT INTO profile_drafts (email, draft)
    VALUES (${norm}, ${js}::jsonb)
    ON CONFLICT (email) DO UPDATE SET draft = EXCLUDED.draft
  `;
}

async function putProfileDraft(email, draft) {
  var mode = storeMode();
  if (mode === "missing") return;
  if (mode === "file") {
    var all = readFileStore();
    all[draftKey(email)] = draft;
    writeFileStore(all);
    return;
  }
  await putProfileDraftPostgres(email, draft);
}

async function getProfileDraftPostgres(email) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var norm = normEmail(email);
  var rows = await sql`SELECT draft FROM profile_drafts WHERE email = ${norm}`;
  if (!rows || !rows.length) return null;
  return parseJsonCell(rows[0].draft);
}

async function getProfileDraft(email) {
  var mode = storeMode();
  if (mode === "missing") return null;
  if (mode === "file") {
    var all = readFileStore();
    var raw = all[draftKey(email)];
    return raw && typeof raw === "object" ? raw : null;
  }
  return getProfileDraftPostgres(email);
}

async function deleteProfileDraftPostgres(email) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var norm = normEmail(email);
  await sql`DELETE FROM profile_drafts WHERE email = ${norm}`;
}

async function deleteProfileDraft(email) {
  var mode = storeMode();
  if (mode === "missing") return;
  if (mode === "file") {
    var all = readFileStore();
    delete all[draftKey(email)];
    writeFileStore(all);
    return;
  }
  await deleteProfileDraftPostgres(email);
}

function sanitizePermissions(obj) {
  if (!obj || typeof obj !== "object") return {};
  var out = {};
  Object.keys(obj).forEach(function (k) {
    if (/^[a-z0-9_]{1,32}$/.test(k) && typeof obj[k] === "boolean") {
      out[k] = obj[k];
    }
  });
  return out;
}

function sanitizeUserForAdmin(record) {
  if (!record || typeof record !== "object") return null;
  var at = record.accountType === "sub" ? "sub" : "primary";
  var pe = typeof record.primaryEmail === "string" ? normEmail(record.primaryEmail) : "";
  return {
    email: record.email || "",
    name: record.name || "",
    company: record.company || "",
    role: record.role || "",
    phone: record.phone || "",
    appRole: typeof record.appRole === "string" ? record.appRole : "",
    iftaAccess: record.iftaAccess === true,
    companyKey: companyKeyLib.resolveCompanyKey(record),
    accountType: at,
    primaryEmail: pe,
    permissions: sanitizePermissions(record.permissions),
    completedAt: record.completedAt || "",
    profileSubmittedAt: record.profileSubmittedAt || "",
  };
}

function sortByEmail(a, b) {
  return (a.email || "").localeCompare(b.email || "");
}

async function listAllUsersPublicPostgres() {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var rows = await sql`SELECT email, record FROM app_users`;
  var users = [];
  for (var i = 0; i < rows.length; i++) {
    var rec = parseJsonCell(rows[i].record);
    if (rec && rec.passwordHash) users.push(sanitizeUserForAdmin(rec));
  }
  return users.sort(sortByEmail);
}

async function listAllUsersPublic() {
  var mode = storeMode();
  if (mode === "missing") return [];
  if (mode === "file") {
    var all = readFileStore();
    var out = [];
    Object.keys(all).forEach(function (k) {
      if (k.indexOf("user:") !== 0) return;
      var u = all[k];
      if (u && u.passwordHash) out.push(sanitizeUserForAdmin(u));
    });
    return out.sort(sortByEmail);
  }
  try {
    return await listAllUsersPublicPostgres();
  } catch (e) {
    console.error("[user-store] listAllUsersPublic", e && e.message);
    return [];
  }
}

function publicSubUser(rec, emailKey) {
  if (!rec || typeof rec !== "object") return null;
  var at = rec.accountType === "sub" ? "sub" : "primary";
  if (at !== "sub") return null;
  return {
    email: emailKey || rec.email || "",
    name: rec.name || "",
    role: rec.role || "",
    phone: rec.phone || "",
    completedAt: rec.completedAt || "",
  };
}

async function listSubUsersByPrimaryPostgres(primaryEmail) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var pe = normEmail(primaryEmail);
  var rows = await sql`SELECT email, record FROM app_users`;
  var out = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var rec = parseJsonCell(rows[i].record);
    if (!rec || !rec.passwordHash) continue;
    if (rec.accountType !== "sub") continue;
    if (normEmail(rec.primaryEmail) !== pe) continue;
    var pub = publicSubUser(rec, rows[i].email);
    if (pub) out.push(pub);
  }
  return out.sort(sortByEmail);
}

async function listSubUsersByPrimary(primaryEmail) {
  var mode = storeMode();
  var pe = normEmail(primaryEmail);
  if (!pe) return [];
  if (mode === "missing") return [];
  if (mode === "file") {
    var all = readFileStore();
    var out = [];
    Object.keys(all).forEach(function (k) {
      if (k.indexOf("user:") !== 0) return;
      var u = all[k];
      if (!u || !u.passwordHash || u.accountType !== "sub") return;
      if (normEmail(u.primaryEmail) !== pe) return;
      var em = k.slice("user:".length);
      var pub = publicSubUser(u, em);
      if (pub) out.push(pub);
    });
    return out.sort(sortByEmail);
  }
  try {
    return await listSubUsersByPrimaryPostgres(pe);
  } catch (e) {
    console.error("[user-store] listSubUsersByPrimary", e && e.message);
    return [];
  }
}

async function updateUserAdminSettings(email, body) {
  body = body || {};
  var norm = normEmail(email);
  if (!norm) return { ok: false, error: "Invalid email." };
  var raw = typeof body.appRole === "string" ? body.appRole.trim() : "";
  if (raw.length > 64) return { ok: false, error: "Role is too long (max 64 characters)." };
  if (raw && !/^[a-zA-Z0-9_\-\s]+$/.test(raw)) {
    return {
      ok: false,
      error: "Role may only contain letters, numbers, spaces, hyphens, and underscores.",
    };
  }
  var rec = await getUser(norm);
  if (!rec || !rec.passwordHash) {
    return { ok: false, error: "User not found or account setup is incomplete." };
  }
  var next = {};
  Object.keys(rec).forEach(function (k) {
    next[k] = rec[k];
  });
  next.appRole = raw;
  if (body && Object.prototype.hasOwnProperty.call(body, "iftaAccess")) {
    next.iftaAccess = body.iftaAccess === true;
  }
  if (typeof body.accountType === "string") {
    if (body.accountType === "primary" || body.accountType === "sub") {
      next.accountType = body.accountType;
    }
  }
  if (typeof body.primaryEmail === "string") {
    next.primaryEmail = normEmail(body.primaryEmail);
  }
  if (body.permissions !== undefined) {
    if (body.permissions === null || typeof body.permissions === "object") {
      next.permissions = sanitizePermissions(body.permissions);
    }
  }
  await putUser(norm, next);
  return { ok: true };
}

async function deleteUserPostgres(email) {
  await dbPostgres.ensureSchema();
  var sql = dbPostgres.getSql();
  var norm = normEmail(email);
  if (!norm) return { ok: false, error: "Invalid email." };
  await sql`DELETE FROM profile_drafts WHERE email = ${norm}`;
  var rows = await sql`DELETE FROM app_users WHERE email = ${norm} RETURNING email`;
  if (!rows || !rows.length) {
    return { ok: false, error: "User not found or account setup is incomplete." };
  }
  return { ok: true };
}

async function deleteUser(email) {
  var norm = normEmail(email);
  if (!norm) return { ok: false, error: "Invalid email." };
  var mode = storeMode();
  if (mode === "missing") {
    return { ok: false, error: "Account storage is not configured." };
  }
  var rec = await getUser(norm);
  if (!rec || !rec.passwordHash) {
    return { ok: false, error: "User not found or account setup is incomplete." };
  }
  if (mode === "file") {
    var all = readFileStore();
    if (!all[userKey(norm)]) {
      return { ok: false, error: "User not found or account setup is incomplete." };
    }
    delete all[userKey(norm)];
    delete all[draftKey(norm)];
    writeFileStore(all);
    return { ok: true };
  }
  return deleteUserPostgres(norm);
}

module.exports = {
  getUser: getUser,
  putUser: putUser,
  putProfileDraft: putProfileDraft,
  getProfileDraft: getProfileDraft,
  deleteProfileDraft: deleteProfileDraft,
  listAllUsersPublic: listAllUsersPublic,
  listSubUsersByPrimary: listSubUsersByPrimary,
  updateUserAdminSettings: updateUserAdminSettings,
  sanitizePermissions: sanitizePermissions,
  deleteUser: deleteUser,
  storeMode: storeMode,
};
