@echo off
TITLE Lancement Station ZIZ Web
cd /d "c:\Users\user\Desktop\gestion ziz"

:: --- IP Detection ---
set "MY_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /r /c:"IPv4.*Address" /c:"Adresse IPv4"') do (
    set "MY_IP=%%a"
    goto :found_ip
)
:found_ip
set "MY_IP=%MY_IP: =%"

echo ----------------------------------------------------
echo         STATION ZIZ - SERVEUR RESEAU
echo ----------------------------------------------------
echo.
echo Nettoyage du port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do (
    taskkill /F /PID %%a /T >nul 2>&1
)

:: --- Portable Node Check ---
set "NODE_EXE=node"
if exist "node-x86\node.exe" (
    set "NODE_EXE=node-x86\node.exe"
)

echo Demarrage du serveur...
start /min cmd /c "%NODE_EXE% server.js"


echo Attente du demarrage (3s)...
timeout /t 3 /nobreak >nul

echo.
echo L'application est prete !
echo.
echo  PC LOCAL : http://localhost:3001
echo  AUTRES PC: http://%MY_IP%:3001
echo.
echo ----------------------------------------------------
echo  Laissez cette fenetre ouverte tant que vous utilisez l'app.
echo ----------------------------------------------------

:: Ouvrir localement
start http://localhost:3001

exit

