/**
 * User accounts after "complete registration". Production: Vercel KV (KV_REST_*).
 * Local dev without KV: JSON file at .data/users.json (not used on Vercel).
 */

var fs = require("fs");
var path = require("path");

var DATA_PATH = path.join(__dirname, "..", "..", ".data", "users.json");

function hasKvEnv() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isVercelRuntime() {
  return process.env.VERCEL === "1";
}

function storeMode() {
  var force = (process.env.USER_STORE || "").trim().toLowerCase();
  if (force === "file") return "file";
  if (force === "kv" && !hasKvEnv()) {
    return isVercelRuntime() ? "missing" : "file";
  }
  if (hasKvEnv()) return "kv";
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

async function getKv() {
  return require("@vercel/kv").kv;
}

async function getUser(email) {
  var key = userKey(email);
  var mode = storeMode();
  if (mode === "missing") {
    var err = new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be set on Vercel.");
    err.code = "STORE_CONFIG";
    throw err;
  }
  if (mode === "file") {
    var all = readFileStore();
    var raw = all[key];
    return raw && typeof raw === "object" ? raw : null;
  }
  var kv = await getKv();
  var raw = await kv.get(key);
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

async function putUser(email, record) {
  var key = userKey(email);
  var mode = storeMode();
  if (mode === "missing") {
    var err = new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be set on Vercel.");
    err.code = "STORE_CONFIG";
    throw err;
  }
  if (mode === "file") {
    var all = readFileStore();
    all[key] = record;
    writeFileStore(all);
    return;
  }
  var kv = await getKv();
  await kv.set(key, JSON.stringify(record));
}

/** Saved when the user submits the profile form; merged on complete-registration. No-op if no KV/file. */
async function putProfileDraft(email, draft) {
  var mode = storeMode();
  if (mode === "missing") return;
  var key = draftKey(email);
  if (mode === "file") {
    var all = readFileStore();
    all[key] = draft;
    writeFileStore(all);
    return;
  }
  var kv = await getKv();
  await kv.set(key, JSON.stringify(draft));
}

async function getProfileDraft(email) {
  var mode = storeMode();
  if (mode === "missing") return null;
  var key = draftKey(email);
  if (mode === "file") {
    var all = readFileStore();
    var raw = all[key];
    return raw && typeof raw === "object" ? raw : null;
  }
  var kv = await getKv();
  var raw = await kv.get(key);
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

async function deleteProfileDraft(email) {
  var mode = storeMode();
  if (mode === "missing") return;
  var key = draftKey(email);
  if (mode === "file") {
    var all = readFileStore();
    delete all[key];
    writeFileStore(all);
    return;
  }
  var kv = await getKv();
  await kv.del(key);
}

module.exports = {
  getUser: getUser,
  putUser: putUser,
  putProfileDraft: putProfileDraft,
  getProfileDraft: getProfileDraft,
  deleteProfileDraft: deleteProfileDraft,
  storeMode: storeMode,
};
