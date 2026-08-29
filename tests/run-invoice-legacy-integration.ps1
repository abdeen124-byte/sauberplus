param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin',
  [int]$Port = 55439
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$initdb = Join-Path $PostgresBin 'initdb.exe'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$psql = Join-Path $PostgresBin 'psql.exe'

foreach ($executable in @($initdb, $pgCtl, $psql)) {
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "PostgreSQL executable not found: $executable"
  }
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testRoot = Join-Path $tempBase ("sauberplus-invoice-pg-{0}" -f [guid]::NewGuid().ToString('N'))
$dataDirectory = Join-Path $testRoot 'data'
$logPath = Join-Path $testRoot 'postgres.log'
$serverStarted = $false

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$([IO.Path]::GetFileName($FilePath)) failed with exit code $LASTEXITCODE."
  }
}

try {
  New-Item -ItemType Directory -Path $testRoot | Out-Null
  Invoke-Checked $initdb @('-D', $dataDirectory, '--username=postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked $pgCtl @('-D', $dataDirectory, '-l', $logPath, '-o', "-p $Port -h 127.0.0.1", 'start', '-w')
  $serverStarted = $true

  $connection = @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', $Port.ToString(), '-U', 'postgres', '-d', 'postgres')
  Invoke-Checked $psql ($connection + @('-f', (Join-Path $PSScriptRoot 'invoice-integration-bootstrap.sql')))
  Invoke-Checked $psql ($connection + @('-f', (Join-Path $projectRoot 'supabase\migrations\20260829000100_invoice_management.sql')))
  Invoke-Checked $psql ($connection + @('-f', (Join-Path $projectRoot 'supabase\migrations\20260829000200_legacy_invoice_archive.sql')))
  Invoke-Checked $psql ($connection + @('-1', '-f', (Join-Path $PSScriptRoot 'invoice-legacy-integration.sql')))

  Write-Output 'Disposable PostgreSQL legacy invoice integration passed.'
}
finally {
  if ($serverStarted) {
    & $pgCtl -D $dataDirectory stop -m fast -w | Out-Null
  }
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  $isUnderTemp = $resolvedTestRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)
  $hasExpectedPrefix = [IO.Path]::GetFileName($resolvedTestRoot) -like 'sauberplus-invoice-pg-*'
  if (-not $isUnderTemp -or -not $hasExpectedPrefix) {
    throw "Unsafe temporary cleanup target: $resolvedTestRoot"
  }
  if (Test-Path -LiteralPath $resolvedTestRoot) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
  }
}
