# Enregistre la sauvegarde dans le Planificateur de tâches Windows.
# La tâche vérifie toutes les 30 minutes si une session de caisse a été
# clôturée, et lance la sauvegarde immédiatement après. Une copie de secours
# est faite à 23 h 30 si aucune sauvegarde n'a réussi dans la journée.
#
# Exemple :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-tache-sauvegarde.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-tache-sauvegarde.ps1 -Debut 07:00 -IntervalleMinutes 15

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Debut = '08:00',
  [int]$IntervalleMinutes = 30,
  [string]$Destination = (Join-Path $env:USERPROFILE 'OneDrive\Sauvegardes-Mercerie-PDJ')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$autoScript = Join-Path $PSScriptRoot 'sauvegarde-auto.ps1'
$taskName = 'Mercerie PDJ - Sauvegarde après clôture'

if (-not (Test-Path $autoScript)) {
  throw "Script introuvable : $autoScript"
}

$argument = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Destination "{1}"' -f $autoScript, $Destination
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $projectRoot

$start = Get-Date -Date $Debut
$trigger = New-ScheduledTaskTrigger -Daily -At $start
$window = New-TimeSpan -Hours 16
$repeat = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes $IntervalleMinutes) -RepetitionDuration $window
$trigger.Repetition = $repeat.Repetition

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -MultipleInstances IgnoreNew
$description = 'Sauvegarde Mercerie PDJ : contrôle des clôtures de caisse toutes les 30 minutes, copie après clôture, secours à 23 h 30.'

if ($PSCmdlet.ShouldProcess($taskName, 'Enregistrer la tâche planifiée')) {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description $description `
    -Force | Out-Null

  $lastCheck = $start.Add($window).AddMinutes(-$IntervalleMinutes)
  Write-Host "Tâche enregistrée : $taskName"
  Write-Host "Contrôle toutes les $IntervalleMinutes minutes de $Debut à $($lastCheck.ToString('HH:mm'))."
  Write-Host "Secours : 23 h 30 si aucune sauvegarde n'a réussi dans la journée."
  Write-Host "Destination : $Destination"
  Write-Host "Compte : $env:USERNAME (session Windows courante)"
}
