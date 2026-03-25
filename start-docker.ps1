# PowerShell script for Windows

Write-Host "🚀 Starting IFTA Summarizer Pro with Docker..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "⚠️  Creating .env file..." -ForegroundColor Yellow
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    @"
JWT_SECRET=$jwtSecret
OPENAI_API_KEY=your-openai-api-key-here
"@ | Out-File -FilePath .env -Encoding utf8
    Write-Host "✅ Created .env file. Please add your OPENAI_API_KEY!" -ForegroundColor Green
}

# Create uploads directories
New-Item -ItemType Directory -Force -Path "uploads\logos" | Out-Null
New-Item -ItemType Directory -Force -Path "uploads\reports" | Out-Null

# Start services (run from project root)
Write-Host "📦 Starting Docker containers..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
docker compose -f docker-compose.dev.yml up --build
