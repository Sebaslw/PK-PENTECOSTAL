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
  echo   Se abrira la pagina de descarga: instale la version LTS
  echo   y vuelva a abrir PK-PENTECOSTAL.
  echo  ============================================================
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
