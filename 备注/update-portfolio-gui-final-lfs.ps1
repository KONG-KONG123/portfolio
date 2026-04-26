Add-Type -AssemblyName System.Windows.Forms

# 提交模板
$templates = @(
    "首页更新",
    "作品集图片更新",
    "修复排版问题",
    "增加新作品",
    "优化图片大小",
    "其他修改"
)

# 自动使用脚本所在目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
cd $scriptDir

# 获取 Git 修改/新增文件
$gitStatus = git status --porcelain
$modifiedFiles = @()
foreach ($line in $gitStatus) {
    $status = $line.Substring(0,2).Trim()
    $file = $line.Substring(3)
    if ($status -ne "") { $modifiedFiles += "$status : $file" }
}

# 没有修改文件
if ($modifiedFiles.Count -eq 0) {
    [System.Windows.Forms.MessageBox]::Show("当前没有检测到修改或新增文件，脚本结束。","提示")
    exit
}

# 显示修改文件
$filesText = $modifiedFiles -join "`n"
[System.Windows.Forms.MessageBox]::Show("检测到以下修改/新增文件:`n`n$filesText","待提交文件")

# 创建提交说明窗口
$form = New-Object System.Windows.Forms.Form
$form.Text = "作品集提交工具"
$form.Width = 400
$form.Height = 200
$form.StartPosition = "CenterScreen"

$combo = New-Object System.Windows.Forms.ComboBox
$combo.Width = 360
$combo.Location = New-Object System.Drawing.Point(10,20)
$combo.DropDownStyle = 'DropDownList'
$combo.Items.AddRange($templates)
$combo.SelectedIndex = 0
$form.Controls.Add($combo)

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Width = 360
$textBox.Location = New-Object System.Drawing.Point(10,60)
$form.Controls.Add($textBox)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = "提交"
$okButton.Location = New-Object System.Drawing.Point(150,100)
$okButton.Add_Click({
    $form.Tag = "OK"
    $form.Close()
})
$form.Controls.Add($okButton)

$form.ShowDialog() | Out-Null

if ($form.Tag -eq "OK") {
    $commitMessage = if ($textBox.Text.Trim() -ne "") { $textBox.Text.Trim() } else { $combo.SelectedItem }
    $commitMessage += " (" + (Get-Date -Format "yyyy-MM-dd HH:mm") + ")"

    try {
        git add .
        git commit -m "$commitMessage"

        # Git LFS 上传显示进度
        Start-Process powershell -ArgumentList "git lfs push origin main" -NoNewWindow -Wait

        [System.Windows.Forms.MessageBox]::Show("提交完成！作品集已推送到 GitHub。`n提交说明：$commitMessage","完成")
    } catch {
        [System.Windows.Forms.MessageBox]::Show("提交失败！`n错误信息:`n$_","错误")
    }

    # 防止窗口闪退
    [System.Windows.Forms.MessageBox]::Show("脚本执行完毕，点击确定关闭窗口。","完成")
}