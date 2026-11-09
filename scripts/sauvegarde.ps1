# Sauvegarde de la base Mercerie PDJ, lancée après une clôture de caisse
# ou manuellement.
# Crée un dossier horodaté contenant le schéma public, les données et les
# comptes, vérifie le contenu, écrit un manifeste avec les empreintes SHA-256,
# puis applique la rétention (30 sauvegardes quotidiennes + 12 mensuelles).
#
# Prérequis :
#   - supabase CLI connecté (supabase login) ;
#   - pg_dump 17 (scripts/installer-outils-postgres.ps1 ou dans le PATH).
# Aucun mot de passe n'est enregistré : le CLI fournit un rôle de connexion
# temporaire, valable deux heures, le temps du dump.
#
# Exemple :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sauvegarde.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sauvegarde.ps1 -Destination "D:\Sauvegardes"

[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'OneDrive\Sauvegardes-Mercerie-PDJ'),
  [string]$ProjectRef = 'uwruoxubqsyfhyxnmvdd',
  [int]$DailyKeep = 30,
  [int]$MonthlyKeep = 12
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Destination = [System.IO.Path]::GetFullPath($Destination)

function Write-Log {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path (Join-Path $Destination '_journaux\sauvegardes.log') -Value $line -Encoding UTF8
  Write-Host $line
}

function Write-Status {
  param([string]$Statut, [string]$Detail, [string]$Dossier = '')
  $status = [ordered]@{
    statut    = $Statut
    detail    = $Detail
    dossier   = $Dossier
    horodatage = (Get-Date).ToString('o')
    projet    = $ProjectRef
  }
  $status | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $Destination 'etat-sauvegarde.json') -Encoding UTF8
}

function Find-Supabase {
  $command = Get-Command supabase -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "La commande supabase est introuvable. Installe le CLI puis lance « supabase login »."
  }
  return $command.Source
}

function Find-PgDump {
  $local = Join-Path $ProjectRoot '.tools\pgsql\bin\pg_dump.exe'
  if (Test-Path $local) {
    return $local
  }
  $command = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  throw "pg_dump est introuvable. Lance scripts/installer-outils-postgres.ps1 pour l'installer dans .tools."
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

function Get-DatabaseCredentials {
  param([string]$Supabase)

  $result = Invoke-Native -FilePath $Supabase -Arguments @(
    'db', 'dump', "--remote=$ProjectRef", '--dry-run'
  )
  if ($result.Code -ne 0) {
    $detail = (@($result.Output) + @($result.Error) | Out-String)
    $detail = ($detail -split "`n" | Select-Object -Last 8 | Out-String)
    $detail = $detail -replace '(?i)password=\S+', 'password=***'
    $detail = $detail -replace '\b[A-Za-z0-9+/]{32,}\b', '[masqué]'
    throw "Le CLI n'a pas pu ouvrir de session de sauvegarde.`n$($detail.Trim())"
  }

  $credentials = @{}
  foreach ($line in ($result.Output | ForEach-Object { $_.ToString() })) {
    if ($line -match '^export (PG[A-Z]+)=(.*)$') {
      $credentials[$Matches[1]] = $Matches[2].Trim().Trim('"')
    }
  }
  foreach ($name in @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')) {
    if (-not $credentials.ContainsKey($name) -or -not $credentials[$name]) {
      throw "Le CLI n'a pas fourni $name. Vérifie que « supabase login » est actif."
    }
  }
  return $credentials
}

function Invoke-PgDump {
  param(
    [string]$PgDump,
    [string[]]$Arguments,
    [string]$Label
  )

  Write-Log "Début : $Label"
  $result = Invoke-Native -FilePath $PgDump -Arguments $Arguments
  if ($result.Code -ne 0) {
    $detail = (@($result.Output) + @($result.Error) | Out-String)
    $detail = ($detail -split "`n" | Select-Object -Last 8 | Out-String)
    $detail = $detail -replace 'postgres(ql)?://\S+', 'postgresql://[masqué]'
    $detail = $detail -replace '(?i)password=\S+', 'password=***'
    $detail = $detail -replace '\b[A-Za-z0-9+/]{32,}\b', '[masqué]'
    throw "$Label a échoué (code $($result.Code)).`n$($detail.Trim())"
  }
  Write-Log "Fin : $Label"
}

function Assert-Contains {
  param([string]$Content, [string]$Marker, [string]$File)
  if (-not $Content.Contains($Marker)) {
    throw "Vérification échouée : « $Marker » est absent de $File."
  }
}

function Get-KeyCounts {
  param([string]$Supabase)

  $sql = @'
select json_build_object(
  'sales', (select count(*) from public.sales),
  'stock_movements', (select count(*) from public.stock_movements),
  'profiles', (select count(*) from public.profiles),
  'payments', (select count(*) from public.payments),
  'alerts', (select count(*) from public.alerts)
) as comptes;
'@

  $result = Invoke-Native -FilePath $Supabase -Arguments @(
    'db', 'query', "--remote=$ProjectRef", '--read-only', '--output-format', 'json', $sql
  )
  if ($result.Code -ne 0) {
    Write-Log 'Comptes non relevés : la requête en lecture seule a échoué.'
    return $null
  }

  $text = $result.Output | Out-String
  $start = $text.IndexOf('[')
  if ($start -lt 0) {
    Write-Log 'Comptes non relevés : réponse inattendue.'
    return $null
  }

  try {
    $parsed = $text.Substring($start) | ConvertFrom-Json
    return $parsed[0].comptes
  }
  catch {
    Write-Log 'Comptes non relevés : réponse illisible.'
    return $null
  }
}

function Remove-OldBackups {
  $directories = @(
    Get-ChildItem -Path $Destination -Directory |
      Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{2}\d{2}\d{2}$' } |
      Sort-Object Name -Descending
  )
  if ($directories.Count -eq 0) {
    return
  }

  $keep = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($directory in ($directories | Select-Object -First $DailyKeep)) {
    [void]$keep.Add($directory.FullName)
  }

  $today = Get-Date
  for ($index = 0; $index -lt $MonthlyKeep; $index++) {
    $month = $today.AddMonths(-$index).ToString('yyyy-MM')
    $first = $directories |
      Where-Object { $_.Name.StartsWith($month, [System.StringComparison]::Ordinal) } |
      Sort-Object Name |
      Select-Object -First 1
    if ($first) {
      [void]$keep.Add($first.FullName)
    }
  }

  foreach ($directory in $directories) {
    if ($keep.Contains($directory.FullName)) {
      continue
    }
    if (-not (Test-Path (Join-Path $directory.FullName 'manifest.json'))) {
      Write-Log "Conservé (manifeste absent) : $($directory.Name)"
      continue
    }
    Remove-Item -Path $directory.FullName -Recurse -Force
    Write-Log "Ancienne sauvegarde supprimée : $($directory.Name)"
  }
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Destination '_journaux') -Force | Out-Null

$lockPath = Join-Path $Destination '.verrou-sauvegarde'
if (Test-Path $lockPath) {
  $age = (Get-Date) - (Get-Item $lockPath).LastWriteTime
  if ($age.TotalHours -lt 6) {
    throw 'Une sauvegarde est déjà en cours sur cet ordinateur.'
  }
  Remove-Item $lockPath -Force
  Write-Log 'Verrou ancien supprimé.'
}
New-Item -ItemType File -Path $lockPath | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$final = Join-Path $Destination $stamp
$temp = Join-Path $Destination ".tmp-$stamp"
$suffix = 1
while (Test-Path $final) {
  $stamp = '{0}-{1}' -f (Get-Date -Format 'yyyy-MM-dd_HHmmss'), $suffix
  $final = Join-Path $Destination $stamp
  $temp = Join-Path $Destination ".tmp-$stamp"
  $suffix++
}

try {
  $supabase = Find-Supabase
  $pgDump = Find-PgDump
  $env:PATH = '{0};{1}' -f (Split-Path $pgDump), $env:PATH

  Write-Log "Sauvegarde du projet $ProjectRef vers $final"
  New-Item -ItemType Directory -Path $temp -Force | Out-Null

  $credentials = Get-DatabaseCredentials -Supabase $supabase
  foreach ($name in $credentials.Keys) {
    Set-Item -Path "env:$name" -Value $credentials[$name]
  }

  Invoke-PgDump -PgDump $pgDump -Label 'schéma applicatif' -Arguments @(
    '--schema-only', '--role', 'postgres', '--no-owner',
    '--schema=public', '--schema=private', '--schema=app_private',
    '-f', (Join-Path $temp 'schema.sql')
  )
  Invoke-PgDump -PgDump $pgDump -Label 'données publiques' -Arguments @(
    '--data-only', '--role', 'postgres', '--schema=public',
    '-f', (Join-Path $temp 'data.sql')
  )
  Invoke-PgDump -PgDump $pgDump -Label 'comptes utilisateurs' -Arguments @(
    '--data-only', '--role', 'postgres',
    '--table=auth.users', '--table=auth.identities',
    '-f', (Join-Path $temp 'auth.sql')
  )

  foreach ($name in @('schema.sql', 'data.sql', 'auth.sql')) {
    $path = Join-Path $temp $name
    if (-not (Test-Path $path)) {
      throw "Fichier manquant : $name"
    }
    if ((Get-Item $path).Length -eq 0) {
      throw "Fichier vide : $name"
    }
  }

  $schema = Get-Content -Path (Join-Path $temp 'schema.sql') -Raw
  foreach ($marker in @(
      'CREATE TABLE public.profiles',
      'CREATE TABLE public.sales',
      'CREATE TABLE public.stock_movements',
      'CREATE TABLE public.payments',
      'CREATE FUNCTION private.notify_alert_push',
      'CREATE FUNCTION app_private.require_role'
    )) {
    Assert-Contains -Content $schema -Marker $marker -File 'schema.sql'
  }

  $data = Get-Content -Path (Join-Path $temp 'data.sql') -Raw
  foreach ($marker in @(
      'COPY public.profiles',
      'COPY public.sales',
      'COPY public.stock_movements',
      'COPY public.payments'
    )) {
    Assert-Contains -Content $data -Marker $marker -File 'data.sql'
  }

  $auth = Get-Content -Path (Join-Path $temp 'auth.sql') -Raw
  Assert-Contains -Content $auth -Marker 'COPY auth.users' -File 'auth.sql'
  Assert-Contains -Content $auth -Marker 'COPY auth.identities' -File 'auth.sql'

  $cliVersion = (& $supabase --version | Select-Object -First 1 | Out-String).Trim()
  $dumpVersion = (& $pgDump --version | Select-Object -First 1 | Out-String).Trim()
  $counts = Get-KeyCounts -Supabase $supabase

  $files = @()
  foreach ($name in @('schema.sql', 'data.sql', 'auth.sql')) {
    $item = Get-Item (Join-Path $temp $name)
    $files += [ordered]@{
      nom    = $name
      octets = $item.Length
      sha256 = (Get-FileHash -Path $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $manifest = [ordered]@{
    format        = 1
    cree_le       = (Get-Date).ToUniversalTime().ToString('o')
    projet        = $ProjectRef
    version_cli   = $cliVersion
    version_dump  = $dumpVersion
    comptes       = $counts
    fichiers      = $files
    verification  = [ordered]@{
      schema_ok  = $true
      donnees_ok = $true
      comptes_ok = $true
    }
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $temp 'manifest.json') -Encoding UTF8

  Move-Item -Path $temp -Destination $final
  Write-Status -Statut 'succes' -Detail 'Sauvegarde vérifiée.' -Dossier $final
  Write-Log "Sauvegarde terminée : $final"

  Remove-OldBackups
}
catch {
  $message = $_.Exception.Message -replace 'postgres(ql)?://\S+', 'postgresql://[masqué]'
  Write-Log "ECHEC : $message"
  Write-Status -Statut 'echec' -Detail $message
  if (Test-Path $temp) {
    Remove-Item -Path $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
  throw
}
finally {
  Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
  foreach ($name in @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')) {
    Remove-Item -Path "env:$name" -ErrorAction SilentlyContinue
  }
}
