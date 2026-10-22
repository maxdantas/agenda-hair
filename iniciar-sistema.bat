@echo off
SET PATH=%PATH%;C:\Program Files\nodejs
echo Iniciando Agenda Hair (API + Painel Web)...
start http://localhost:5173
call "C:\Program Files\nodejs\npm.cmd" run dev
