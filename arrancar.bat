@echo off
REM ============================================================
REM  NV Streaming - arranque de UN comando en Windows (Docker).
REM  Doble clic a este archivo, o en una terminal:  arrancar.bat
REM
REM  Requisito: Docker Desktop instalado y abierto.
REM  No necesitas instalar Node ni PostgreSQL: Docker levanta todo.
REM
REM    Frontend: http://localhost:8090   (entra por /auth.html)
REM    Backend : http://localhost:3000/health
REM    Admin   : admin@nv.com / Admin12345
REM
REM  Para detener: cierra esta ventana o ejecuta  detener.bat
REM ============================================================
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro "docker". Instala Docker Desktop desde:
  echo         https://www.docker.com/products/docker-desktop/
  echo         Abrelo y espera a que diga "Engine running", luego reintenta.
  pause
  exit /b 1
)

echo Levantando NV Streaming con Docker (la primera vez tarda unos minutos)...
docker compose up --build
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo al arrancar. Comprueba que Docker Desktop este ABIERTO
  echo         (icono de la ballena "Engine running") y vuelve a ejecutar.
  pause
  exit /b 1
)
