$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot

Write-Host ''
Write-Host '====================================' -ForegroundColor Cyan
Write-Host ' Website Git Upload Start' -ForegroundColor Cyan
Write-Host '====================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path -LiteralPath '.git')) {
    Write-Host 'ERROR: This folder is not a Git project.' -ForegroundColor Red
    Write-Host 'Put this script in the folder that contains .git and index.html.' -ForegroundColor Yellow
    Pause
    exit 1
}

if (-not (Test-Path -LiteralPath 'index.html')) {
    Write-Host 'WARNING: index.html was not found in this folder.' -ForegroundColor Yellow
}

Write-Host 'Checking files larger than 25MB...' -ForegroundColor Cyan

$largeFiles = Get-ChildItem -Recurse -File -Force | Where-Object {
    $_.FullName -notmatch '\\\.git\\' -and $_.Length -gt 25MB
} | Sort-Object Length -Descending

if ($largeFiles.Count -gt 0) {
    Write-Host ''
    Write-Host 'ERROR: Some files are larger than 25MB. Cloudflare Pages may fail.' -ForegroundColor Red
    Write-Host ''

    foreach ($file in $largeFiles) {
        $mb = [math]::Round($file.Length / 1MB, 2)
        Write-Host "$mb MB  $($file.FullName)" -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'Please compress or remove these files, then run again.' -ForegroundColor Red
    Pause
    exit 1
}

Write-Host 'File size check passed.' -ForegroundColor Green
Write-Host ''

Write-Host 'Current Git changes:' -ForegroundColor Cyan
git status --short

Write-Host ''
Write-Host 'Adding files...' -ForegroundColor Cyan
git add -A

$changes = git diff --cached --name-only

if (-not $changes) {
    Write-Host ''
    Write-Host 'No changes to commit.' -ForegroundColor Yellow
    Pause
    exit 0
}

$commitMessage = 'update website ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

Write-Host ''
Write-Host "Commit message: $commitMessage" -ForegroundColor Cyan
git commit -m "$commitMessage"

Write-Host ''
Write-Host 'Pushing to GitHub...' -ForegroundColor Cyan
git push

Write-Host ''
Write-Host '====================================' -ForegroundColor Green
Write-Host ' Upload complete. Cloudflare Pages will deploy automatically.' -ForegroundColor Green
Write-Host '====================================' -ForegroundColor Green
Write-Host ''

Pause