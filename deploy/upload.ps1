# ============================================================
# VYRO POS - Upload to Server (PowerShell)
# Run this from your local machine to upload to your server
# Usage: .\deploy\upload.ps1 -Server "your-server-ip" -User "root"
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Server,        # Your server IP or hostname

    [string]$User = "root", # SSH username

    [string]$Port = "22",   # SSH port
    
    [switch]$SetupOnly,     # Only run setup, don't deploy
    [switch]$DeployOnly     # Only deploy, skip file upload
)

$DOMAIN = "pos.vyrosocial.com"
$REMOTE = "${User}@${Server}"
$APP_DIR = "/var/www/vyro-pos"
$LOCAL_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host ""
Write-Host "======================================================"
Write-Host "  VYRO POS - Upload & Deploy"
Write-Host "  Server: $REMOTE"
Write-Host "  Domain: $DOMAIN"
Write-Host "======================================================"
Write-Host ""

# ── Build frontend ────────────────────────────────────────
if (-not $DeployOnly) {
    Write-Host "🏗️  Building frontend..." -ForegroundColor Cyan
    Set-Location $LOCAL_DIR
    npm run build
    Write-Host "✅ Build complete" -ForegroundColor Green
}

# ── Upload files ──────────────────────────────────────────
if (-not $DeployOnly) {
    Write-Host ""
    Write-Host "📤 Uploading files to server..." -ForegroundColor Cyan

    # Upload dist (frontend)
    Write-Host "  → Uploading dist/..." -ForegroundColor Gray
    scp -P $Port -r "$LOCAL_DIR\dist\*" "${REMOTE}:${APP_DIR}/dist/"

    # Upload backend
    Write-Host "  → Uploading backend/..." -ForegroundColor Gray
    scp -P $Port -r "$LOCAL_DIR\backend\*" "${REMOTE}:${APP_DIR}/backend/"
    
    # Upload deploy scripts
    Write-Host "  → Uploading deploy scripts..." -ForegroundColor Gray
    scp -P $Port -r "$LOCAL_DIR\deploy\*" "${REMOTE}:${APP_DIR}/deploy/"

    Write-Host "✅ Upload complete" -ForegroundColor Green
}

# ── Run setup (first time only) ───────────────────────────
if ($SetupOnly) {
    Write-Host ""
    Write-Host "⚙️  Running server setup..." -ForegroundColor Cyan
    ssh -p $Port $REMOTE "chmod +x $APP_DIR/deploy/setup-server.sh && $APP_DIR/deploy/setup-server.sh"
    Write-Host "✅ Setup complete" -ForegroundColor Green
    exit
}

# ── Run deploy ────────────────────────────────────────────
Write-Host ""
Write-Host "🚀 Running deployment..." -ForegroundColor Cyan
ssh -p $Port $REMOTE "chmod +x $APP_DIR/deploy/deploy.sh && $APP_DIR/deploy/deploy.sh"

Write-Host ""
Write-Host "======================================================"
Write-Host "🎉 Done! Visit: https://$DOMAIN" -ForegroundColor Green
Write-Host "======================================================"
