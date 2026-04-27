# ------------------------------
# update-lfs.ps1
# ------------------------------
# 一键将指定 LFS 文件替换为普通文件并推送到 GitHub
# ------------------------------

# 配置：列出所有要取消 LFS 的文件路径（相对仓库根目录）
$LFSFiles = @(
    "carousel-gradient-fix.png",
    "another-large-file.png"  # 根据实际需要添加
)

# 确认当前目录是 Git 仓库
if (-not (Test-Path ".git")) {
    Write-Host "Error: 当前目录不是 Git 仓库根目录" -ForegroundColor Red
    exit
}

Write-Host "=============================="
Write-Host "Removing LFS files and converting to normal files..."
Write-Host "=============================="

foreach ($file in $LFSFiles) {
    if (Test-Path $file) {
        # 取消 LFS 缓存，保留文件
        git rm --cached $file
        git add $file
        Write-Host "Processed: $file" -ForegroundColor Green
    } else {
        Write-Host "Warning: 文件不存在 -> $file" -ForegroundColor Yellow
    }
}

# 移除 .gitattributes 中对应 LFS 配置
if (Test-Path ".gitattributes") {
    $attrContent = Get-Content ".gitattributes"
    $newAttr = $attrContent | Where-Object { 
        $line = $_.Trim()
        -not ($LFSFiles | ForEach-Object { $line -like "*$_*" } | Where-Object {$_})
    }
    $newAttr | Set-Content ".gitattributes"
    git add .gitattributes
    Write-Host ".gitattributes cleaned." -ForegroundColor Green
}

# 提交更改
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "Remove LFS and convert to normal files $timestamp"

# 推送到 GitHub 主分支
Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

Write-Host "=============================="
Write-Host "All done! LFS files converted and pushed." -ForegroundColor Green
Write-Host "=============================="