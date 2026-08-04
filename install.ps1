# install.ps1
$ErrorActionPreference = "Stop"

# Silent install of Kilo CLI via npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Please install Node.js and npm before running this installer."
    exit 1
}
npm install -g @kilocode/cli > $null 2>$null

# Roxera configuration repository
$repo = "roxera/roxera-cli-config"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"
$installDir = "$HOME\.config\roxera"
$binDir = "$HOME\AppData\Local\Microsoft\WindowsApps" # Adjust if needed

# Get latest release
try {
    $release = Invoke-RestMethod -Uri $apiUrl -ErrorAction Stop
    $latestTag = $release.tag_name
    $downloadUrl = $release.zipball_url
} catch {
    # Fallback if API fails
    $latestTag = "v0.0.0"
    $downloadUrl = "https://github.com/$repo/archive/refs/heads/main.zip"
}

# Create directories
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# Download and extract
Write-Host "Downloading Roxera CLI..."
$zipPath = "$env:TEMP\roxera.zip"
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $installDir -Force

# The extracted folder will be something like roxera-roxera-cli-config-<hash> or main
$child = Get-ChildItem $installDir -Directory | Select-Object -First 1
if ($child) {
    Move-Item ($child.FullName + "\*") $installDir -Force
    Remove-Item $child.FullName -Force -Recurse
}

# Write version file
$latestTag | Set-Content -Path (Join-Path $installDir "VERSION") -Encoding ASCII

# Create batch launcher with update support
$roxeraBat = Join-Path $binDir "roxera.bat"
@"
@echo off
setlocal
set "KILO_CONFIG_DIR=%USERPROFILE%\.config\roxera"
rem Check if first argument is update
if "%~1" == "update" (
    call :update
    goto :eof
)
rem Background update check
start "" /b powershell -command "& {
    `\`$versionFile = '%USERPROFILE%\.config\roxera\VERSION'
    `\`$current = if (Test-Path `\`$versionFile) { Get-Content `\`$versionFile } else { '0.0.0' }
    `\`$latest = (Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/roxera/roxera-cli-config/releases/latest').tag_name
    if (`\`$latest -ne `\`$current -and `\`$current -ne '0.0.0') {
        Write-Host ``"рџљЂ Р”РѕСЃС‚СѓРїРЅР° РЅРѕРІР°СЏ РІРµСЂСЃРёСЏ Roxera CLI: `\`$latest`n   РўРµРєСѓС‰Р°СЏ РІРµСЂСЃРёСЏ: `\`$current`n   Р’С‹РїРѕР»РЅРёС‚Рµ 'roxera update' РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ`n"" -HostUserInterface
    }
}"
kilo "%KILO_CONFIG_DIR%" %*
goto :eof

:update
echo Updating Roxera CLI...
try {
    `$release = Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/roxera/roxera-cli-config/releases/latest'
    `$zipPath = \"$env:TEMP\roxera_update.zip\"
    Invoke-WebRequest -Uri `$release.zipball_url -OutFile `$zipPath -UseBasicParsing
    `$extractDir = \"$env:TEMP\roxera_update\"
    Expand-Archive -Path `$zipPath -DestinationPath `$extractDir -Force
    `$subDir = Get-ChildItem `$extractDir -Directory | Select-Object -First 1
    if (`$subDir) {
        Remove-Item "$installDir\*" -Recurse -Force
        Move-Item ($subDir.FullName + "\*") "$installDir" -Force
    }
    `$versionFile = "$installDir\VERSION"
    `$newTag = `$release.tag_name
    Set-Content -Path `$versionFile -Value `$newTag -Encoding ASCII
    Write-Host "Update complete. Please restart your terminal."
} catch {
    Write-Host "Update failed: $_"
}
exit /b 0
"@ | Set-Content -Path $roxeraBat -Encoding ASCII

Write-Host ""
Write-Host "Roxera CLI installed successfully."
Write-Host "Please restart your terminal or add $binDir to PATH if necessary."
Write-Host "Then use the command: roxera"
Write-Host ""