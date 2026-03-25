# Copies the Vercel serverless ingest into your IFTA project (Vite).
# Usage:
#   .\copy-into-ifta-repo.ps1 -IftaRepoRoot "C:\path\to\ifta-dev-underwritly"

param(
  [Parameter(Mandatory = $true)]
  [string] $IftaRepoRoot
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here "api\ingest\underwritly-insured.js"
if (-not (Test-Path $src)) {
  Write-Error "Missing: $src"
}

$destDir = Join-Path $IftaRepoRoot "api\ingest"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir "underwritly-insured.js"
Copy-Item -Path $src -Destination $dest -Force
Write-Host "OK: copied to $dest"
Write-Host "Next: commit, push, deploy the IFTA project, then test POST (see README.txt)."
