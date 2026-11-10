$ErrorActionPreference = 'Stop'
$v = 'v22.11.0'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root '.node'
if (Test-Path (Join-Path $dest 'node.exe')) { exit 0 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$zip = Join-Path $env:TEMP 'hydarium-node.zip'
Write-Host "  Telechargement en cours (environ 30 Mo), patiente un instant..."
$ProgressPreference = 'SilentlyContinue'  # sans barre PowerShell : beaucoup plus rapide
Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-win-$arch.zip" -OutFile $zip -UseBasicParsing
Write-Host "  Installation de Node.js..."
$tmp = Join-Path $root '.node-tmp'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip -DestinationPath $tmp -Force
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Move-Item (Join-Path $tmp "node-$v-win-$arch") $dest
Remove-Item $tmp -Recurse -Force
Remove-Item $zip -Force
Write-Host "  Node.js est pret."
