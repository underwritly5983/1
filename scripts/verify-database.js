#!/usr/bin/env node
/**
 * Confirms DATABASE_URL works and creates tables (form_submissions, app_users, profile_drafts).
 *
 * Usage (from project root):
 *   npm run db:verify
 *
 * Requires DATABASE_URL in .env (copy from Neon → Connection details → URI).
 */

var path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function printHelp() {
  console.log("");
  console.log("DATABASE_URL is not set in .env");
  console.log("");
  console.log("Do this once:");
  console.log("  1. Open https://console.neon.tech → your project.");
  console.log("  2. Click \"Connection details\" (or Dashboard → connect).");
  console.log("  3. Copy the connection string (URI). It looks like:");
  console.log("     postgresql://user:password@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require");
  console.log("  4. In this project folder, create a file named .env (copy from .env.example).");
  console.log("  5. Add a line (no quotes around the URL):");
  console.log("");
  console.log("     DATABASE_URL=postgresql://...");
  console.log("");
  console.log("  6. Run again: npm run db:verify");
  console.log("");
  console.log("For production, add the same DATABASE_URL in Vercel:");
  console.log("  Project → Settings → Environment Variables → DATABASE_URL → Save → Redeploy.");
  console.log("");
}

async function main() {
  var url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    printHelp();
    process.exit(1);
  }

  var db = require("../lib/db-postgres");
  try {
    await db.ensureSchema();
    var sql = db.getSql();
    if (!sql) {
      console.error("Could not create SQL client.");
      process.exit(1);
    }
    var rows = await sql`SELECT 1 AS ok`;
    if (!rows || !rows.length) {
      console.error("Unexpected response from database.");
      process.exit(1);
    }
    console.log("");
    console.log("Success: connected to PostgreSQL and tables are ready.");
    console.log("You can deploy; add DATABASE_URL to Vercel if you have not already.");
    console.log("");
  } catch (e) {
    console.error("");
    console.error("Connection failed:", e && e.message ? e.message : e);
    console.error("");
    console.error("Check: URL is complete, includes password, and sslmode=require if Neon asks for SSL.");
    console.error("");
    process.exit(1);
  }
}

main();
