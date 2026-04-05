$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$ShortcutPath = [System.IO.Path]::Combine($DesktopPath, "Station ZIZ (Web).lnk")
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "c:\Users\user\Desktop\gestion ziz\StationZIZ_Web.bat"
$Shortcut.WorkingDirectory = "c:\Users\user\Desktop\gestion ziz"
$Shortcut.IconLocation = "shell32.dll,13" # A generic world icon or similar
$Shortcut.Description = "Gestion de Station ZIZ (Mode Web)"
$Shortcut.Save()

Write-Host "Raccourci 'Station ZIZ (Web)' créé avec succès sur le Bureau."
