<#
.SYNOPSIS
  Backs up the Hydro database to backups\hydro-<timestamp>.dump and keeps the newest 30.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1

.EXAMPLE
  # Also put a copy somewhere off the laptop, e.g. a OneDrive folder:
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -CopyTo "$env:OneDrive\Hydro backups"
#>
param(
    [string]$CopyTo,
    [int]$Keep = 30
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)  # repo root, where docker-compose.yml is

function Invoke-Docker {
    # Docker prints progress on stderr. When run unattended (e.g. Task Scheduler), Windows
    # PowerShell can treat that as an error, so judge success by the exit code only.
    $ErrorActionPreference = 'Continue'
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') failed (exit code $LASTEXITCODE)" }
}

New-Item -ItemType Directory -Force -Path 'backups' | Out-Null
$name = 'hydro-{0}.dump' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
$file = Join-Path 'backups' $name

# pg_dump writes the file inside the container and docker copies it out, so the
# binary dump never goes through a PowerShell pipe (Windows PowerShell corrupts those).
Invoke-Docker compose exec -T db pg_dump -U hydro -d hydro --format=custom "--file=/tmp/$name"
Invoke-Docker compose cp "db:/tmp/$name" $file
Invoke-Docker compose exec -T db rm -f "/tmp/$name"
Write-Output ('Saved {0} ({1} KB)' -f $file, [math]::Ceiling((Get-Item $file).Length / 1KB))

if ($CopyTo) {
    New-Item -ItemType Directory -Force -Path $CopyTo | Out-Null
    Copy-Item $file -Destination $CopyTo
    Write-Output "Copied to $CopyTo"
}

# Keep only the newest $Keep backups in each folder written to.
foreach ($dir in @('backups', $CopyTo) | Where-Object { $_ }) {
    Get-ChildItem -Path $dir -Filter 'hydro-*.dump' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $Keep |
        Remove-Item
}
