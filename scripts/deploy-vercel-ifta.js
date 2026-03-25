#!/usr/bin/env node
var path = require("path");
var fs = require("fs");
var { execSync } = require("child_process");

var iftaRoot = path.resolve(__dirname, "..", "..", "IFTA SUMMARY 2");
if (!fs.existsSync(path.join(iftaRoot, "vercel.json"))) {
  console.error("IFTA not found at:\n  " + iftaRoot);
  process.exit(1);
}
execSync("npx vercel deploy --prod --yes", { cwd: iftaRoot, stdio: "inherit" });
