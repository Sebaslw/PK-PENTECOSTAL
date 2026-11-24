@echo off
setlocal
title Backup PK-PENTECOSTAL

rem === Carpeta del software (donde esta este .bat) y carpeta destino ===
set "ORIGEN=%~dp0"
if "%ORIGEN:~-1%"=="\" set "ORIGEN=%ORIGEN:~0,-1%"
set "DESTINO=C:\Users\Usuario\Desktop\DESARROLLO\PROYECTO - PK PENTECOSTAL\BK-PK-PENTECOSTAL"

rem === Version (de package.json) y fecha-hora ===
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -Raw '%ORIGEN%\package.json' | ConvertFrom-Json).version"`) do set "VERSION=%%v"
for /f "usebackq delims=" %%f in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HHmm'"`) do set "FECHA=%%f"

set "ARCHIVO=%DESTINO%\Respaldo PK-PENTECOSTAL VER %VERSION% %FECHA%.zip"

if not exist "%DESTINO%" mkdir "%DESTINO%"

echo.
echo  ==============================================
echo    BACKUP PK-PENTECOSTAL  -  version %VERSION%
echo  ==============================================
echo.
echo  Origen : %ORIGEN%
echo  Destino: %ARCHIVO%
echo.
echo  Se omiten: node_modules, dist (instaladores compilados)
echo  y los .zip / .exe de web\descargas (ya estan en GitHub).
echo.
echo  Creando respaldo, espera unos minutos...
echo.

tar -a -c -f "%ARCHIVO%" -C "%ORIGEN%" ^
  --exclude "./node_modules" ^
  --exclude "./dist" ^
  --exclude "./web/descargas/*.zip" ^
  --exclude "./web/descargas/*.exe" ^
  .

if errorlevel 1 (
  echo.
  echo  [ERROR] No se pudo completar el backup.
  echo.
  pause
  exit /b 1
)

for %%A in ("%ARCHIVO%") do set /a TAM=%%~zA/1048576
echo.
echo  [OK] Backup terminado  -  %TAM% MB
echo  %ARCHIVO%
echo.
pause
