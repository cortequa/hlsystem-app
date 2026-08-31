# Quick Release Script
# Tento script vám pomůže rychle vytvořit GitHub Release

Write-Host "🚀 GitHub Release Helper" -ForegroundColor Cyan
Write-Host ""

# Získat aktuální verzi
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$version = $packageJson.version
$tagName = "v$version"

Write-Host "📦 Current version: $version" -ForegroundColor Green
Write-Host "🏷️  Tag name: $tagName" -ForegroundColor Green
Write-Host ""

# Kontrola, zda existují release soubory
$releaseDir = "release\$version"
if (-not (Test-Path $releaseDir)) {
    Write-Host "❌ Release folder not found: $releaseDir" -ForegroundColor Red
    Write-Host "   Run 'npm run build:draft' first" -ForegroundColor Yellow
    exit 1
}

$setupFile = Get-ChildItem "$releaseDir\*.exe" | Select-Object -First 1
$blockMapFile = Get-ChildItem "$releaseDir\*.blockmap" | Select-Object -First 1

if (-not $setupFile) {
    Write-Host "❌ Setup.exe file not found in $releaseDir" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found files:" -ForegroundColor Green
Write-Host "   📄 $($setupFile.Name)" -ForegroundColor White
Write-Host "   📄 $($blockMapFile.Name)" -ForegroundColor White
Write-Host ""

Write-Host "🌐 Next steps:" -ForegroundColor Cyan
Write-Host "1. Go to: https://github.com/cortequa/hlsystem-app/releases/new" -ForegroundColor White
Write-Host "2. Set tag: $tagName" -ForegroundColor White
Write-Host "3. Set title: Release $tagName" -ForegroundColor White
Write-Host "4. Upload these files:" -ForegroundColor White
Write-Host "   - $($setupFile.FullName)" -ForegroundColor Yellow
Write-Host "   - $($blockMapFile.FullName)" -ForegroundColor Yellow
Write-Host "5. Click 'Publish release'" -ForegroundColor White
Write-Host ""

Write-Host "💡 Tip: Drag and drop the files directly to the GitHub release page!" -ForegroundColor Cyan

# Otevřít složku s release soubory
Write-Host ""
$openFolder = Read-Host "Open release folder? (y/n)"
if ($openFolder -eq "y" -or $openFolder -eq "Y") {
    Start-Process "explorer.exe" -ArgumentList $releaseDir
}

# Otevřít GitHub release page
$openGitHub = Read-Host "Open GitHub releases page? (y/n)"
if ($openGitHub -eq "y" -or $openGitHub -eq "Y") {
    Start-Process "https://github.com/cortequa/hlsystem-app/releases/new"
}
