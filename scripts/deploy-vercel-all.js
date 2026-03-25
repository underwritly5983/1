#!/usr/bin/env node
/**
 * Deploy both Underwritly landing and IFTA Summary to Vercel production.
 * Expects this repo (LANDING PAGE) and "IFTA SUMMARY 2" as sibling folders on disk.
 */
var path = require("path");
var fs = require("fs");
var { execSync } = require("child_process");

var landingRoot = path.resolve(__dirname, "..");
var iftaRoot = path.resolve(landingRoot, "..", "IFTA SUMMARY 2");

function run(title, cwd) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60) + "\n");
  execSync("npx vercel deploy --prod --yes", { cwd: cwd, stdio: "inherit", env: process.env });
}

if (!fs.existsSync(path.join(iftaRoot, "vercel.json"))) {
  console.error(
    "IFTA project not found at:\n  " +
      iftaRoot +
      "\n\n" +
      "Put the IFTA SUMMARY 2 folder next to LANDING PAGE on your Desktop, or edit scripts/deploy-vercel-all.js."
  );
  process.exit(1);
}

run("Underwritly landing", landingRoot);
run("IFTA Summary (ifta-dev-underwritly)", iftaRoot);

console.log("\n" + "=".repeat(60));
console.log("  Both production deploys finished.");
console.log("=".repeat(60) + "\n");
