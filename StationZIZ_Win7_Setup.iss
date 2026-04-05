; --- Station ZIZ - Windows 7 x32 Setup Script ---
; NOTE: You must have Inno Setup installed to compile this script.

[Setup]
AppName=Station ZIZ
AppVersion=1.0.16
DefaultDirName={pf}\StationZIZ
DefaultGroupName=Station ZIZ
UninstallDisplayIcon={app}\StationZIZ_Web.bat
Compression=lzma2
SolidCompression=yes
OutputDir=Output
OutputBaseFilename=Station_ZIZ_Win7_x32_Setup
; "ArchitecturesAllowed=x86" ensures it only runs on 32-bit (or 64-bit which can run 32-bit)
ArchitecturesAllowed=x86 x64

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Portabe Node.js (should be in node-x86 folder in project)
Source: "node-x86\*"; DestDir: "{app}\node-x86"; Flags: ignoreversion recursesubdirs createallsubdirs

; Application Core Files
Source: "server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "konnach.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "security.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "konnach.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "style.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "StationZIZ_Web.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion

; Node Modules
Source: "node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs

; Database (ONLY IF DOESN'T EXIST to prevent overwriting user data)
Source: "gestion_ziz.db"; DestDir: "{app}"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\Station ZIZ"; Filename: "{app}\StationZIZ_Web.bat"; IconFilename: "{sys}\shell32.dll"; IconIndex: 12
Name: "{commondesktop}\Station ZIZ"; Filename: "{app}\StationZIZ_Web.bat"; Tasks: desktopicon; IconFilename: "{sys}\shell32.dll"; IconIndex: 12

[Run]
Filename: "{app}\StationZIZ_Web.bat"; Description: "{cm:LaunchProgram,Station ZIZ}"; Flags: shellexec postinstall skipifsilent
