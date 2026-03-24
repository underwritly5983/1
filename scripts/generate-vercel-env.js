#!/usr/bin/env node
/**
 * Prints environment variable lines to add in Vercel (and optionally merge into local .env).
 * Run: node scripts/generate-vercel-env.js
 *
 * You must still create/link Redis (KV) in the Vercel dashboard — we cannot do that from this repo.
 */

var crypto = require("crypto");

function hex(n) {
  return crypto.randomBytes(n).toString("hex");
}

function password() {
  var chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var out = "";
  var buf = crypto.randomBytes(24);
  for (var i = 0; i < 24; i++) {
    out += chars[buf[i] % chars.length];
  }
  return out;
}

var profileSecret = hex(32);
var sessionSecret = hex(32);
var adminSessionSecret = hex(32);
var adminPass = password();

console.log("");
console.log("================================================================");
console.log("  Vercel environment variables");
console.log("================================================================");
console.log("");
console.log("--- 1) Redis / KV (you add these from the Vercel dashboard) ---");
console.log("");
console.log("  a) Open https://vercel.com/dashboard → your team → your project");
console.log("  b) Storage tab → Create Database → Redis (Upstash) — or Integrations → Redis");
console.log("  c) Link the database to this project if prompted");
console.log("  d) In the Redis integration / database settings, copy:");
console.log("       - REST API URL   → KV_REST_API_URL");
console.log("       - REST API Token → KV_REST_API_TOKEN");
console.log("");
console.log("  (Vercel often auto-injects these when you connect the store — check Settings → Environment Variables.)");
console.log("");
console.log("--- 2) Copy the lines below into Vercel: Settings → Environment Variables ---");
console.log("     Enable Production (and Preview if you use preview deployments).");
console.log("");
console.log("KV_REST_API_URL=paste-from-vercel-redis-dashboard");
console.log("KV_REST_API_TOKEN=paste-from-vercel-redis-dashboard");
console.log("ADMIN_EMAIL=you@yourdomain.com");
console.log("ADMIN_PASSWORD=" + adminPass);
console.log("ADMIN_SESSION_SECRET=" + adminSessionSecret);
console.log("SESSION_SECRET=" + sessionSecret);
console.log("PROFILE_ACCESS_SECRET=" + profileSecret);
console.log("");
console.log("--- 3) Optional CLI: after `vercel login`, you can push each var with: ---");
console.log("  echo VALUE | npx vercel env add VAR_NAME production");
console.log("");
console.log("================================================================");
console.log("  Save this output somewhere safe — it will not be shown again.");
console.log("  Do not commit secrets to git.");
console.log("================================================================");
console.log("");
