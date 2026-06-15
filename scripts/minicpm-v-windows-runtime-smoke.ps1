param(
  [string]$ArtifactId = "llama-cpp-windows-x64-cpu",
  [string]$OutputDir = "test-results/minicpm-v/windows-runtime-smoke",
  [string]$RunId = "",
  [string]$Image = "resources/welcome-onboarding/screenshots/01-main-shell.png",
  [string]$Model = "",
  [int]$StartupTimeoutMs = 900000,
  [int]$RequestTimeoutMs = 900000,
  [int]$MaxTokens = 700,
  [switch]$SkipEvidenceValidation
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $Path))
}

function Invoke-CheckedNode([string[]]$Arguments) {
  & node @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "node $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot
Set-Location $RepoRoot

$IsWindowsHost = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
if (-not $IsWindowsHost) {
  throw "MiniCPM-V Windows runtime smoke must run on a real Windows host."
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  throw "Node.js is required on PATH before running the MiniCPM-V Windows runtime smoke."
}

if ([string]::IsNullOrWhiteSpace($RunId)) {
  $RunId = "windows-x64-b9122-" + [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
}

$ResolvedOutputDir = Resolve-RepoPath $OutputDir
$ResolvedImage = Resolve-RepoPath $Image
$SmokeScript = Resolve-RepoPath "scripts/minicpm-v-windows-runtime-smoke.mjs"
$EvidenceScript = Resolve-RepoPath "scripts/minicpm-v-windows-runtime-evidence.mjs"
$SummaryPath = Join-Path (Join-Path $ResolvedOutputDir $RunId) "summary.json"
$BundlePath = Join-Path $ResolvedOutputDir "$RunId.zip"

$SmokeArgs = @(
  $SmokeScript,
  "--artifact-id", $ArtifactId,
  "--output-dir", $ResolvedOutputDir,
  "--run-id", $RunId,
  "--image", $ResolvedImage,
  "--startup-timeout-ms", [string]$StartupTimeoutMs,
  "--request-timeout-ms", [string]$RequestTimeoutMs,
  "--max-tokens", [string]$MaxTokens
)
if (-not [string]::IsNullOrWhiteSpace($Model)) {
  $SmokeArgs += @("--model", $Model)
}

Write-Host "MiniCPM-V Windows runtime smoke"
Write-Host "Repository: $RepoRoot"
Write-Host "Run id: $RunId"
Write-Host "Output: $ResolvedOutputDir"
Write-Host "Node: $($NodeCommand.Source)"
Write-Host "PowerShell: $($PSVersionTable.PSVersion)"

$SmokeSucceeded = $false
try {
  Invoke-CheckedNode $SmokeArgs
  $SmokeSucceeded = $true
} finally {
  $RunDir = Join-Path $ResolvedOutputDir $RunId
  if (Test-Path $RunDir) {
    if (Test-Path $BundlePath) {
      Remove-Item $BundlePath -Force
    }
    Compress-Archive -Path $RunDir -DestinationPath $BundlePath -Force
    Write-Host "Evidence bundle: $BundlePath"
  }

  if (-not $SkipEvidenceValidation -and (Test-Path $SummaryPath)) {
    Write-Host "Validating Windows smoke evidence..."
    Invoke-CheckedNode @($EvidenceScript, "--summary", $SummaryPath, "--require-artifacts")
  }
}

if (-not $SmokeSucceeded) {
  throw "MiniCPM-V Windows runtime smoke failed before evidence validation completed."
}

Write-Host "MiniCPM-V Windows runtime smoke passed."
Write-Host "Summary: $SummaryPath"
