<#
.SYNOPSIS
  Creates the .env file for docker compose: strong random secrets, plus the first admin account.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\new-env.ps1
#>
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)  # repo root, where docker-compose.yml is

if (Test-Path '.env') {
    Write-Output '.env already exists. Delete it first if you really want a new one (the database password in it must match the existing database).'
    exit 1
}

function New-Secret([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    ($buffer | ForEach-Object { $_.ToString('x2') }) -join ''
}

# Quote a value so docker compose reads it literally (no $variable expansion).
function Format-EnvValue([string]$Value) {
    if ($Value -notmatch "'") { return "'$Value'" }
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"' -replace '\$', '$$$$') + '"'
}

$email = Read-Host 'First admin email'
$name = Read-Host 'First admin name'
while ($true) {
    $secure = Read-Host 'First admin password (8-72 characters)' -AsSecureString
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    if ($password.Length -ge 8 -and [Text.Encoding]::UTF8.GetByteCount($password) -le 72) { break }
    Write-Output 'It must be 8-72 characters. Try again.'
}

$lines = @(
    '# Created by scripts\new-env.ps1. Keep this file private and never share or commit it.',
    "POSTGRES_PASSWORD=$(New-Secret 16)",
    "SECRET_KEY=$(New-Secret 32)",
    "INITIAL_ADMIN_EMAIL=$(Format-EnvValue $email)",
    "INITIAL_ADMIN_PASSWORD=$(Format-EnvValue $password)",
    "INITIAL_ADMIN_NAME=$(Format-EnvValue $name)"
)
# UTF-8 without a byte-order mark.
[IO.File]::WriteAllLines((Join-Path $PWD.Path '.env'), $lines)
Write-Output 'Created .env. Next: docker compose up -d --build'
