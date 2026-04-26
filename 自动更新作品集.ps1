Add-Type -AssemblyName System.Windows.Forms

Write-Host "========================================"
Write-Host " 空空Studio 作品集自动更新工具"
Write-Host "========================================"
Write-Host ""

# 1. 自动找到 Git 仓库根目录
try {
    $repoRoot = git rev-parse --show-toplevel
    if (-not $repoRoot) {
        throw "未找到 Git 仓库"
    }
    Set-Location $repoRoot
    Write-Host "当前仓库目录：$repoRoot"
} catch {
    [System.Windows.Forms.MessageBox]::Show("没有找到 Git 仓库。请把脚本放在作品集网站文件夹里面，或者先进入 Git 仓库目录。", "错误")
    Read-Host "按回车关闭"
    exit
}

Write-Host ""

# 2. 确认 Git LFS 已启用
Write-Host "检查 Git LFS..."
git lfs install

# 3. 自动追踪常见大文件格式
Write-Host "配置 Git LFS 大文件规则..."
git lfs track "*.png"
git lfs track "*.jpg"
git lfs track "*.jpeg"
git lfs track "*.webp"
git lfs track "*.psd"
git lfs track "*.mp4"
git lfs track "*.mov"
git lfs track "*.zip"

# 4. 自动写入 .gitignore，避免提交无关文件
$ignoreItems = @(
    "bigfiles.txt",
    "*.bak",
    "*.tmp",
    "*.log",
    "*.ps1",
    "*.bat",
    ".gitattributes.baidu.uploading.cfg",
    "_backups/",
    "备注/"
)

if (!(Test-Path ".gitignore")) {
    New-Item ".gitignore" -ItemType File | Out-Null
}

$currentIgnore = Get-Content ".gitignore" -ErrorAction SilentlyContinue

foreach ($item in $ignoreItems) {
    if ($currentIgnore -notcontains $item) {
        Add-Content ".gitignore" $item
    }
}

Write-Host "已检查 .gitignore"
Write-Host ""

# 5. 显示当前修改文件
Write-Host "检测修改文件..."
$gitStatus = git status --porcelain

if (-not $gitStatus) {
    [System.Windows.Forms.MessageBox]::Show("当前没有检测到任何修改，不需要更新。", "提示")
    Read-Host "按回车关闭"
    exit
}

$previewText = ($gitStatus | Select-Object -First 80) -join "`n"

if ($gitStatus.Count -gt 80) {
    $previewText += "`n`n......还有更多文件未显示"
}

[System.Windows.Forms.MessageBox]::Show("检测到以下修改/新增/删除文件：`n`n$previewText", "待提交文件预览")

# 6. 弹窗输入提交说明
$templates = @(
    "优化手机端页面",
    "压缩图片优化网站速度",
    "更新作品集内容",
    "修复页面问题",
    "新增作品案例",
    "优化交互和排版",
    "其他更新"
)

$form = New-Object System.Windows.Forms.Form
$form.Text = "作品集提交说明"
$form.Width = 420
$form.Height = 230
$form.StartPosition = "CenterScreen"

$label1 = New-Object System.Windows.Forms.Label
$label1.Text = "选择一个提交模板："
$label1.Width = 360
$label1.Location = New-Object System.Drawing.Point(20,20)
$form.Controls.Add($label1)

$combo = New-Object System.Windows.Forms.ComboBox
$combo.Width = 360
$combo.Location = New-Object System.Drawing.Point(20,45)
$combo.DropDownStyle = 'DropDownList'
$combo.Items.AddRange($templates)
$combo.SelectedIndex = 0
$form.Controls.Add($combo)

$label2 = New-Object System.Windows.Forms.Label
$label2.Text = "或者输入自定义说明："
$label2.Width = 360
$label2.Location = New-Object System.Drawing.Point(20,85)
$form.Controls.Add($label2)

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Width = 360
$textBox.Location = New-Object System.Drawing.Point(20,110)
$form.Controls.Add($textBox)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = "开始更新"
$okButton.Width = 100
$okButton.Location = New-Object System.Drawing.Point(150,150)
$okButton.Add_Click({
    $form.Tag = "OK"
    $form.Close()
})
$form.Controls.Add($okButton)

$form.ShowDialog() | Out-Null

if ($form.Tag -ne "OK") {
    Write-Host "已取消提交。"
    Read-Host "按回车关闭"
    exit
}

$commitMessage = if ($textBox.Text.Trim() -ne "") {
    $textBox.Text.Trim()
} else {
    $combo.SelectedItem
}

$commitMessage += " - " + (Get-Date -Format "yyyy-MM-dd HH:mm")

Write-Host ""
Write-Host "本次提交说明：$commitMessage"
Write-Host ""

# 7. 添加、提交、推送
try {
    Write-Host "正在添加文件..."
    git add .

    Write-Host ""
    Write-Host "正在提交..."
    git commit -m "$commitMessage"

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "可能没有新的可提交内容，正在检查状态..."
        git status
        Read-Host "按回车关闭"
        exit
    }

    Write-Host ""
    Write-Host "正在推送到 GitHub..."
    git push origin main

    if ($LASTEXITCODE -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("更新成功！`n已推送到 GitHub，Netlify 会自动重新部署。`n`n提交说明：$commitMessage", "完成")
    } else {
        [System.Windows.Forms.MessageBox]::Show("推送失败，请查看窗口里的红色报错信息。", "推送失败")
    }

} catch {
    [System.Windows.Forms.MessageBox]::Show("脚本执行失败：`n$_", "错误")
}

Write-Host ""
Write-Host "========================================"
Write-Host " 脚本执行完毕"
Write-Host "========================================"
Read-Host "按回车关闭"