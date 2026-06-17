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

function Assert-NativeExitCode($label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

# ── Backend ──

Step "backend tests" {
  Set-Location "$ProjectRoot\backend"
  go test ./... 2>&1 | Select-Object -Last 1
  Assert-NativeExitCode "go test ./..."
}

# ── Frontend ──

Step "frontend tests" {
  Set-Location "$ProjectRoot\frontend"
  npm test 2>&1 | Select-Object -Last 1
  Assert-NativeExitCode "npm test"
}

Step "TypeScript type check" {
  Set-Location "$ProjectRoot\frontend"
  npx tsc --noEmit 2>&1 | Out-Null
  Assert-NativeExitCode "npx tsc --noEmit"
  Write-Host "  tsc --noEmit: no errors"
}

Step "frontend build" {
  Set-Location "$ProjectRoot\frontend"
  npm run build 2>&1 | Select-Object -Last 1
  Assert-NativeExitCode "npm run build"
}

Step "backend build" {
  Set-Location "$ProjectRoot\backend"
  go build -o backend.exe . 2>&1 | Out-Null
  Assert-NativeExitCode "go build"
  Write-Host "  go build: ok"
}

# ── Git hygiene ──

Step "git diff --check" {
  Set-Location $ProjectRoot
  git diff --check 2>&1 | Out-Null
  Assert-NativeExitCode "git diff --check"
  Write-Host "  no whitespace errors"
}

# ── Docker ──

if (-not $SkipDocker) {
  Step "Dockerfile build check" {
    Set-Location $ProjectRoot
    docker build --check -f Dockerfile . 2>&1 | Select-Object -Last 1
    Assert-NativeExitCode "docker build --check -f Dockerfile ."
  }

  Step "Dockerfile.runtime build check" {
    Set-Location $ProjectRoot
    docker build --check -f Dockerfile.runtime . 2>&1 | Select-Object -Last 1
    Assert-NativeExitCode "docker build --check -f Dockerfile.runtime ."
  }

  Step "docker compose config" {
    Set-Location $ProjectRoot
    $oldSessionSecret = $env:CHAT_SESSION_SECRET
    if (-not $env:CHAT_SESSION_SECRET) {
      $env:CHAT_SESSION_SECRET = "verify-compose-session-secret"
    }
    try {
      docker compose config 2>&1 | Select-Object -Last 1
      Assert-NativeExitCode "docker compose config"
    } finally {
      $env:CHAT_SESSION_SECRET = $oldSessionSecret
    }
  }
}

# ── Visual Acceptance ──

if (-not $SkipVisual) {
  if ($env:VISUAL_BASE_URL) {
    Step "visual acceptance" {
      Set-Location "$ProjectRoot\frontend"
      npm run visual:acceptance 2>&1 | Select-Object -Last 8
      Assert-NativeExitCode "npm run visual:acceptance"
    }
  } else {
    $visualPort = 8198
    $visualDB = Join-Path ([System.IO.Path]::GetTempPath()) "tdchat-visual-verify"
    Remove-Item -Recurse -Force $visualDB -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $visualDB | Out-Null

    $oldDBPath = $env:CHAT_DB_PATH
    $oldFrontendDir = $env:CHAT_FRONTEND_DIR
    $oldAddr = $env:CHAT_ADDR
    $oldOIDCEnabled = $env:CHAT_OIDC_ENABLED
    $oldSessionSecret = $env:CHAT_SESSION_SECRET
    $oldVisualBase = $env:VISUAL_BASE_URL

    Write-Host "`n  Starting backend for visual acceptance on port $visualPort..." -ForegroundColor Cyan
    $env:CHAT_DB_PATH = Join-Path $visualDB "chat.db"
    $env:CHAT_FRONTEND_DIR = Join-Path $ProjectRoot "frontend\dist"
    $env:CHAT_ADDR = ":$visualPort"
    $env:CHAT_OIDC_ENABLED = "false"
    $env:CHAT_SESSION_SECRET = "verify-visual-session-secret"
    $env:VISUAL_BASE_URL = "http://127.0.0.1:$visualPort"

    $visualBackend = Start-Process -FilePath "$ProjectRoot\backend\backend.exe" -PassThru -WindowStyle Hidden
    try {
      $ready = $false
      for ($i = 0; $i -lt 30; $i++) {
        try {
          $null = Invoke-WebRequest -Uri "$env:VISUAL_BASE_URL/api/health" -UseBasicParsing -TimeoutSec 1
          $ready = $true
          break
        } catch {
          Start-Sleep -Milliseconds 500
        }
      }
      if (-not $ready) {
        throw "visual acceptance backend did not become ready"
      }
      Write-Host "  Backend ready" -ForegroundColor Green

      Step "visual acceptance" {
        Set-Location "$ProjectRoot\frontend"
        npm run visual:acceptance 2>&1 | Select-Object -Last 8
        Assert-NativeExitCode "npm run visual:acceptance"
      }
    } finally {
      if ($visualBackend -and -not $visualBackend.HasExited) {
        Stop-Process -Id $visualBackend.Id -Force -ErrorAction SilentlyContinue
      }
      Remove-Item -Recurse -Force $visualDB -ErrorAction SilentlyContinue
      $env:CHAT_DB_PATH = $oldDBPath
      $env:CHAT_FRONTEND_DIR = $oldFrontendDir
      $env:CHAT_ADDR = $oldAddr
      $env:CHAT_OIDC_ENABLED = $oldOIDCEnabled
      $env:CHAT_SESSION_SECRET = $oldSessionSecret
      $env:VISUAL_BASE_URL = $oldVisualBase
      Write-Host "  Visual acceptance backend stopped" -ForegroundColor Cyan
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
  $env:CHAT_DB_PATH = Join-Path $e2eDB "chat.db"
  $env:CHAT_FRONTEND_DIR = Join-Path $ProjectRoot "frontend\dist"
  $env:CHAT_ADDR = ":$e2ePort"
  $env:CHAT_OIDC_ENABLED = "false"
  $env:CHAT_SESSION_SECRET = "verify-local-session-secret"
  $env:CHAT_API_RATE_LIMIT_PER_MINUTE = "1000"

  $e2eBackend = Start-Process -FilePath "$ProjectRoot\backend\backend.exe" -PassThru -NoNewWindow
  Start-Sleep -Seconds 3

  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$e2ePort/api/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "  Backend ready" -ForegroundColor Green

    Step "Playwright E2E" {
      Set-Location "$ProjectRoot\frontend"
      $env:E2E_BASE_URL = "http://127.0.0.1:$e2ePort"
      npx playwright test --project=chromium --reporter=line 2>&1 | Select-Object -Last 15
      Assert-NativeExitCode "npx playwright test --project=chromium --reporter=line"
    }
  } catch {
    Write-Host "  Backend failed to start for E2E" -ForegroundColor Red
    $script:Failures += "E2E backend startup"
  } finally {
    Stop-Process -Id $e2eBackend.Id -Force -ErrorAction SilentlyContinue
    Remove-Item Env:CHAT_API_RATE_LIMIT_PER_MINUTE -ErrorAction SilentlyContinue
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
