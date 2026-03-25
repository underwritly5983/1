#!/usr/bin/env node
/**
 * Prints environment variable lines to add in Vercel (and optionally merge into local .env).
 * Run: node scripts/generate-vercel-env.js
 *
 * Add a Postgres database (Neon) from Vercel → Storage or Integrations, then copy DATABASE_URL.
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
var iftaIngestSecret = hex(32);

console.log("");
console.log("================================================================");
console.log("  Vercel environment variables");
console.log("================================================================");
console.log("");
console.log("--- 1) PostgreSQL (Neon) — from Vercel dashboard ---");
console.log("");
console.log("  a) Open https://vercel.com/dashboard → your team → your project");
console.log("  b) Storage → Create Database → Neon Postgres — or Integrations → Neon");
console.log("  c) Link the database to this project if prompted");
console.log("  d) Copy the connection string as DATABASE_URL (pooled connection is fine for serverless)");
console.log("");
console.log("--- 2) Copy the lines below into Vercel: Settings → Environment Variables ---");
console.log("     Enable Production (and Preview if you use preview deployments).");
console.log("");
console.log("DATABASE_URL=paste-neon-connection-string");
console.log("ADMIN_EMAIL=you@yourdomain.com");
console.log("ADMIN_PASSWORD=" + adminPass);
console.log("ADMIN_SESSION_SECRET=" + adminSessionSecret);
console.log("SESSION_SECRET=" + sessionSecret);
console.log("PROFILE_ACCESS_SECRET=" + profileSecret);
console.log("");
console.log("# IFTA: ingest URL is derived from IFTA_DEPLOYMENT_URL (no IFTA_INGEST_WEBHOOK_URL needed).");
console.log("# Optional shared secret — paste the SAME line on the IFTA Summary Vercel project.");
console.log("IFTA_INGEST_SECRET=" + iftaIngestSecret);
console.log("");
console.log("--- 3) IFTA Summary app (second Vercel project) — minimal ---");
console.log("");
console.log("# Same Neon as landing is OK if you want one database; brokers must exist in IFTA `users` with the same email.");
console.log("DATABASE_URL=paste-neon-or-match-landing");
console.log("JWT_SECRET=generate-in-ifta-server-or-reuse-a-strong-secret");
console.log("OPENAI_API_KEY=your-openai-key");
console.log("# Must match the IFTA_INGEST_SECRET line above (optional; omit on both projects to skip ingest auth).");
console.log("IFTA_INGEST_SECRET=" + iftaIngestSecret);
console.log("");
console.log("--- 4) Optional CLI: after `vercel login`, you can push each var with: ---");
console.log("  echo VALUE | npx vercel env add VAR_NAME production");
console.log("");
console.log("  Two Vercel projects: paste block 2 into the landing project, block 3 into IFTA Summary.");
console.log("  IFTA_INGEST_SECRET must match in both blocks (or remove it from both to skip ingest auth).");
console.log("");
console.log("================================================================");
console.log("  Save this output somewhere safe — it will not be shown again.");
console.log("  Do not commit secrets to git.");
console.log("================================================================");
console.log("");
