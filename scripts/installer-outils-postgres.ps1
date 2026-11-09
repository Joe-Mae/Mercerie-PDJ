# Installe pg_dump et psql 17 dans .tools/pgsql (sans administrateur).
# Télécharge les binaires officiels PostgreSQL pour Windows (environ 340 Mo).
#
# Exemple :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-outils-postgres.ps1

[CmdletBinding()]
param(
  [string]$Version = '17.11',
  [string]$ToolsDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ToolsDirectory) {
  $ToolsDirectory = Join-Path $PSScriptRoot '..\.tools'
}
$tools = [System.IO.Path]::GetFullPath($ToolsDirectory)
$target = Join-Path $tools 'pgsql'
$pgDump = Join-Path $target 'bin\pg_dump.exe'

if (Test-Path $pgDump) {
  Write-Host "pg_dump est déjà installé : $pgDump"
  & $pgDump --version
  exit 0
}

New-Item -ItemType Directory -Path $tools -Force | Out-Null
$zip = Join-Path $tools "postgresql-$Version.zip"

if (-not (Test-Path $zip)) {
  $url = "https://get.enterprisedb.com/postgresql/postgresql-$Version-1-windows-x64-binaries.zip"
  Write-Host "Téléchargement de PostgreSQL $Version..."
  Write-Host $url
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & $curl.Source -L --retry 3 --retry-delay 5 -o $zip $url
    if ($LASTEXITCODE -ne 0) {
      throw "Le téléchargement a échoué (code $LASTEXITCODE)."
    }
  }
  else {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  }
}

if (-not (Test-Path $zip)) {
  throw "L'archive est absente : $zip"
}

Write-Host 'Extraction des binaires...'
Expand-Archive -Path $zip -DestinationPath $tools -Force

if (-not (Test-Path $pgDump)) {
  throw "pg_dump est absent après l'extraction. Vérifie le contenu de $zip."
}

Write-Host "Installation terminée : $pgDump"
& $pgDump --version
