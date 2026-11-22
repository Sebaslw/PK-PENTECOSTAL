@echo off
title PK-PENTECOSTAL
rem Hecho por Sebastian Lopez · IPUC Natania 6° Etapa - Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
chcp 65001 >nul
cd /d "%~dp0PK-PENTECOSTAL"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ============================================================
  echo   PK-PENTECOSTAL necesita Node.js ^(gratis^).
  echo  ============================================================
  echo.
  rem El .zip trae el instalador oficial en la carpeta NODEJS: no hace falta internet
  for %%F in ("%~dp0NODEJS\node-*-x64.msi") do (
    echo   Se abrira el instalador de Node.js incluido en la carpeta NODEJS.
    echo   Deje todo como viene ^(Siguiente, Siguiente, Instalar^)
    echo   y al terminar vuelva a abrir PK-PENTECOSTAL.
    echo.
    start "" "%%~fF"
    pause
    exit /b 1
  )
  echo   Se abrira la pagina de descarga: instale la version LTS
  echo   y vuelva a abrir PK-PENTECOSTAL.
  echo.
  start "" "https://nodejs.org/es/download"
  pause
  exit /b 1
)
echo.
echo   PK-PENTECOSTAL - Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
echo   Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
echo   "Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras." Salmos 19:4
echo.
node server.js --abrir
if errorlevel 1 pause
