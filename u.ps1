# Kurzbefehl fuer Windows: .\u.ps1 "Update-Nachricht"
# Veroeffentlicht ein EAS Update (OTA) auf den 'production'-Channel.
#
# Token einmalig dauerhaft hinterlegen (dann entfaellt das Setzen pro Sitzung):
#   [Environment]::SetEnvironmentVariable('EXPO_TOKEN', 'dein-token', 'User')
# Danach PowerShell neu oeffnen.
param([string]$Message = "Update")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $env:EXPO_TOKEN) {
  Write-Host "EXPO_TOKEN ist nicht gesetzt." -ForegroundColor Red
  Write-Host "Token erzeugen: https://expo.dev/settings/access-tokens"
  Write-Host 'Dann:  $env:EXPO_TOKEN = "dein-token"'
  exit 1
}

Write-Host "Eingeloggt als:" -ForegroundColor Cyan
npx eas whoami

Write-Host "Installiere Dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Veroeffentliche Update auf Branch 'production': $Message" -ForegroundColor Cyan
npx eas update --branch production --platform ios --message $Message
