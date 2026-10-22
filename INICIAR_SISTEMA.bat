@echo off
chcp 65001 >nul
title Agenda Hair v0.1.0-alpha.1 - Inicializador
echo ========================================================
echo   AGENDA HAIR v0.1.0-alpha.1 (Alpha Release)
echo   Plataforma SaaS para Saloes de Beleza e Barbearias
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Por favor, instale o Node.js LTS (v22.5 ou superior) em: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/2] Instalando dependencias do projeto pela primeira vez...
    call npm install
)

echo.
echo [2/2] Iniciando Servidor API (porta 3333) e Interface Web (porta 5173)...
echo Acesse no navegador: http://localhost:5173
echo.
start "" "http://localhost:5173"
call npm run dev
pause
