# Sauvegarde déclenchée par la clôture de la caisse.
# Appelé par la tâche planifiée toutes les 30 minutes : interroge la base,
# détecte une session de caisse fermée depuis la dernière sauvegarde, puis
# lance scripts/sauvegarde.ps1. Une sauvegarde de secours est faite à 23 h 30
# si aucune copie n'a réussi dans la journée.
#
# Exemple :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sauvegarde-auto.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sauvegarde-auto.ps1 -Destination "D:\Sauvegardes"

[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'OneDrive\Sauvegardes-Mercerie-PDJ'),
  [string]$ProjectRef = 'uwruoxubqsyfhyxnmvdd'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Destination = [System.IO.Path]::GetFullPath($Destination)
$backupScript = Join-Path $PSScriptRoot 'sauvegarde.ps1'
$stateFile = Join-Path $Destination 'derniere-cloture.txt'
$statusFile = Join-Path $Destination 'etat-sauvegarde.json'
$lockFile = Join-Path $Destination '.verrou-verification'
$fallback = [TimeSpan]'23:30:00'

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Destination '_journaux') -Force | Out-Null

function Write-Log {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path (Join-Path $Destination '_journaux\sauvegardes.log') -Value $line -Encoding UTF8
  Write-Host $line
}

function Invoke-Native {
  param([string]$FilePath, [string[]]$Arguments)

  $errorFile = [System.IO.Path]::GetTempFileName()
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $FilePath @Arguments 2> $errorFile
    $code = $LASTEXITCODE
    $errors = if (Test-Path $errorFile) { Get-Content -Path $errorFile -Raw -Encoding UTF8 } else { '' }
  }
  finally {
    $ErrorActionPreference = $previous
    Remove-Item -Path $errorFile -Force -ErrorAction SilentlyContinue
  }
  return [pscustomobject]@{ Code = $code; Output = @($output); Error = $errors }
}

function Get-LastCashClose {
  $supabase = Get-Command supabase -ErrorAction SilentlyContinue
  if (-not $supabase) {
    throw "La commande supabase est introuvable. Lance « supabase login » sur ce compte Windows."
  }

  $sql = 'select max(fermee_at) as derniere from public.cash_sessions where fermee_at is not null;'
  $result = Invoke-Native -FilePath $supabase.Source -Arguments @(
    'db', 'query', "--remote=$ProjectRef", '--read-only', '--output-format', 'json', $sql
  )
  if ($result.Code -ne 0) {
    $detail = (@($result.Output) + @($result.Error) | Out-String).Trim()
    throw "Lecture des clôtures impossible.`n$detail"
  }

  $text = ($result.Output | Out-String).Trim()
  if (-not $text) {
    return $null
  }
  $parsed = $text | ConvertFrom-Json
  $value = $parsed[0].derniere
  if (-not $value) {
    return $null
  }
  return [DateTimeOffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
}

function Get-LastBackedUpClose {
  if (-not (Test-Path $stateFile)) {
    return $null
  }
  $text = (Get-Content -Path $stateFile -Raw -Encoding UTF8).Trim()
  if (-not $text) {
    return $null
  }
  try {
    return [DateTimeOffset]::Parse($text, [Globalization.CultureInfo]::InvariantCulture)
  }
  catch {
    Write-Log 'État de clôture illisible : une nouvelle sauvegarde sera faite.'
    return $null
  }
}

function Test-BackedUpToday {
  if (-not (Test-Path $statusFile)) {
    return $false
  }
  try {
    $status = Get-Content -Path $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($status.statut -ne 'succes' -or -not $status.horodatage) {
      return $false
    }
    $moment = [DateTimeOffset]::Parse($status.horodatage, [Globalization.CultureInfo]::InvariantCulture)
    return $moment.LocalDateTime.Date -eq (Get-Date).Date
  }
  catch {
    return $false
  }
}

$lock = Get-Item -Path $lockFile -ErrorAction SilentlyContinue
if ($lock -and ((Get-Date) - $lock.LastWriteTime).TotalMinutes -lt 15) {
  Write-Host 'Vérification déjà en cours.'
  exit 0
}
if ($lock) {
  Remove-Item -Path $lockFile -Force
}
New-Item -ItemType File -Path $lockFile | Out-Null

try {
  $lastClose = Get-LastCashClose
  $backedUpClose = Get-LastBackedUpClose
  $reason = $null

  if ($lastClose -and (-not $backedUpClose -or $lastClose -gt $backedUpClose)) {
    $reason = 'clôture de caisse du {0}' -f $lastClose.ToLocalTime().ToString('dd/MM/yyyy à HH:mm')
  }
  elseif (-not (Test-Path $stateFile) -and -not (Test-BackedUpToday)) {
    $reason = 'première sauvegarde'
  }
  elseif ((Get-Date).TimeOfDay -ge $fallback -and -not (Test-BackedUpToday)) {
    $reason = 'sauvegarde de secours de fin de journée'
  }

  if (-not $reason) {
    Write-Host 'Aucune nouvelle clôture : rien à sauvegarder.'
    exit 0
  }

  Write-Log "Sauvegarde déclenchée : $reason."
  & $backupScript -Destination $Destination

  $stateValue = if ($lastClose) { $lastClose.ToString('o') } else { '' }
  Set-Content -Path $stateFile -Value $stateValue -Encoding UTF8
  Write-Log 'Fin de la sauvegarde automatique.'
}
catch {
  $message = $_.Exception.Message
  Write-Log "ECHEC de la sauvegarde automatique : $message"
  throw
}
finally {
  Remove-Item -Path $lockFile -Force -ErrorAction SilentlyContinue
}
