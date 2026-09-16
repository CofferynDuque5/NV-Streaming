@echo off
REM Detiene NV Streaming (conserva los datos de la base de datos).
REM Para BORRAR tambien la base de datos:  docker compose down -v
cd /d "%~dp0"
echo Deteniendo NV Streaming...
docker compose down
echo Listo. Los datos se conservan. Para volver a arrancar: arrancar.bat
pause
