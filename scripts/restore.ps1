<#
.SYNOPSIS
  Replaces ALL data in the Hydro database with a backup made by backup.ps1.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 backups\hydro-20260101-210000.dump
#>
param(
    [Parameter(Mandatory = $true)][string]$BackupFile
)
$ErrorActionPreference = 'Stop'
$dump = (Resolve-Path $BackupFile).Path          # resolve before changing directory
Set-Location (Split-Path -Parent $PSScriptRoot)  # repo root, where docker-compose.yml is

function Invoke-Docker {
    # Docker prints progress on stderr. When run unattended (e.g. Task Scheduler), Windows
    # PowerShell can treat that as an error, so judge success by the exit code only.
    $ErrorActionPreference = 'Continue'
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') failed (exit code $LASTEXITCODE)" }
}

Write-Output "This replaces ALL current Hydro data with $dump."
$answer = Read-Host "Type 'restore' to continue"
if ($answer -ne 'restore') {
    Write-Output 'Cancelled.'
    exit 1
}

Invoke-Docker compose stop app
try {
    # Copy the file in rather than piping it, for the same reason as in backup.ps1.
    Invoke-Docker compose cp $dump 'db:/tmp/hydro-restore.dump'
    Invoke-Docker compose exec -T db pg_restore -U hydro -d hydro --clean --if-exists --no-owner /tmp/hydro-restore.dump
    Invoke-Docker compose exec -T db rm -f /tmp/hydro-restore.dump
}
finally {
    Invoke-Docker compose start app
}
Write-Output 'Restored.'
