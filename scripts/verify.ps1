# TokenDanceChat 全量验证脚本
# 用法: .\scripts\verify.ps1 [-SkipVisual] [-SkipDocker] [-WithE2E]
# 环境变量: VISUAL_BASE_URL (默认 http://127.0.0.1:8080)
param(
  [switch] $SkipVisual,
  [switch] $SkipDocker,
  [switch] $WithE2E
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Failures = @()
$StartTime = Get-Date

function Step($label, $script) {
  Write-Host "`n=== $label ===" -ForegroundColor Cyan
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    & $script
    $sw.Stop()
    Write-Host "  PASS ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s)" -ForegroundColor Green
  } catch {
    $sw.Stop()
    Write-Host "  FAIL: $_" -ForegroundColor Red
    $script:Failures += $label
    if ($ErrorActionPreference -eq "Stop") { throw }
  }
}

# ── Backend ──

Step "backend tests" {
  Set-Location "$ProjectRoot\backend"
  go test ./... 2>&1 | Select-Object -Last 1
}

# ── Frontend ──

Step "frontend tests" {
  Set-Location "$ProjectRoot\frontend"
  npm test 2>&1 | Select-Object -Last 1
}

Step "TypeScript type check" {
  Set-Location "$ProjectRoot\frontend"
  npx tsc --noEmit 2>&1 | Out-Null
  Write-Host "  tsc --noEmit: no errors"
}

Step "frontend build" {
  Set-Location "$ProjectRoot\frontend"
  npm run build 2>&1 | Select-Object -Last 1
}

Step "backend build" {
  Set-Location "$ProjectRoot\backend"
  go build -o backend.exe . 2>&1 | Out-Null
  Write-Host "  go build: ok"
}

# ── Git hygiene ──

Step "git diff --check" {
  Set-Location $ProjectRoot
  git diff --check 2>&1 | Out-Null
  Write-Host "  no whitespace errors"
}

# ── Docker ──

if (-not $SkipDocker) {
  Step "Dockerfile build check" {
    Set-Location $ProjectRoot
    docker build --check -f Dockerfile . 2>&1 | Select-Object -Last 1
  }

  Step "Dockerfile.runtime build check" {
    Set-Location $ProjectRoot
    docker build --check -f Dockerfile.runtime . 2>&1 | Select-Object -Last 1
  }
}

# ── Visual Acceptance ──

if (-not $SkipVisual) {
  $visualBase = if ($env:VISUAL_BASE_URL) { $env:VISUAL_BASE_URL } else { "http://127.0.0.1:8080" }

  # Check if backend is reachable before running visual acceptance
  $backendUp = $false
  try {
    $null = Invoke-WebRequest -Uri "$visualBase/api/health" -UseBasicParsing -TimeoutSec 3
    $backendUp = $true
  } catch {
    Write-Host "`n  SKIP visual acceptance: backend not reachable at $visualBase" -ForegroundColor Yellow
    Write-Host "  Start the backend first, then run: npm run visual:acceptance" -ForegroundColor Yellow
  }

  if ($backendUp) {
    Step "visual acceptance" {
      Set-Location "$ProjectRoot\frontend"
      $env:VISUAL_BASE_URL = $visualBase
      npm run visual:acceptance 2>&1 | Select-Object -Last 8
    }
  }
}

# ── E2E (Playwright) ──

if ($WithE2E) {
  $e2ePort = 8199
  $e2eDB = Join-Path ([System.IO.Path]::GetTempPath()) "tdchat-e2e-verify"
  Remove-Item -Recurse -Force $e2eDB -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $e2eDB | Out-Null

  Write-Host "`n  Starting backend for E2E on port $e2ePort..." -ForegroundColor Cyan
  $env:CHAT_DATA_DIR = $e2eDB
  $env:CHAT_ADDR = ":$e2ePort"

  $e2eBackend = Start-Process -FilePath "$ProjectRoot\backend\backend.exe" -PassThru -NoNewWindow
  Start-Sleep -Seconds 3

  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$e2ePort/api/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "  Backend ready" -ForegroundColor Green

    Step "Playwright E2E" {
      Set-Location "$ProjectRoot\frontend"
      $env:E2E_BASE_URL = "http://127.0.0.1:$e2ePort"
      npx playwright test --project=chromium --reporter=line 2>&1 | Select-Object -Last 15
    }
  } catch {
    Write-Host "  Backend failed to start for E2E" -ForegroundColor Red
    $script:Failures += "E2E backend startup"
  } finally {
    Stop-Process -Id $e2eBackend.Id -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $e2eDB -ErrorAction SilentlyContinue
    Write-Host "  E2E backend stopped" -ForegroundColor Cyan
  }
}

# ── Summary ──

$Duration = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
Write-Host "`n========================================" -ForegroundColor Cyan
if ($Failures.Count -eq 0) {
  Write-Host "ALL CHECKS PASSED ($Duration s)" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Cyan
  exit 0
} else {
  Write-Host "FAILURES: $($Failures.Count) steps" -ForegroundColor Red
  foreach ($f in $Failures) {
    Write-Host "  - $f" -ForegroundColor Red
  }
  Write-Host "========================================" -ForegroundColor Cyan
  exit 1
}
