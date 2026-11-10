@echo off
chcp 65001 >nul
title Hydarium - Lancement
cd /d "%~dp0"
echo.
echo   HYDARIUM  -  Lancement du launcher
echo   ------------------------------------------
echo.
where node >nul 2>nul
if errorlevel 1 (
  if not exist ".node\node.exe" (
    echo   Preparation : Node.js n'est pas installe sur ce PC.
    echo   Je telecharge une version portable ^(environ 30 Mo, une seule fois, sans droits administrateur^)...
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\get-node.ps1"
    if errorlevel 1 (
      echo.
      echo   Le telechargement a echoue. Verifie ta connexion Internet, ou installe Node.js depuis https://nodejs.org puis relance.
      pause
      exit /b 1
    )
  )
  set "PATH=%~dp0.node;%PATH%"
)
node scripts\build.js dev
if errorlevel 1 (
  echo   Si tu as besoin d'aide, envoie le fichier build.log a l'equipe.
  echo.
  pause
)
