@echo off
rem Запуск квиза «Сумеречный шабаш» на Windows. Двойной клик в Проводнике или start.cmd в терминале.
rem PIN ведущего можно поменять: set "ADMIN_PIN=4242" ^&^& start.cmd
chcp 65001 >nul
cd /d "%~dp0"
if not defined ADMIN_PIN set ADMIN_PIN=1234

where npm >nul 2>nul
if errorlevel 1 goto no_node

if exist node_modules goto run
echo Первый запуск: ставлю зависимости…
call npm install
if errorlevel 1 goto failed

:run
echo Компьютер не уснёт, пока сервер работает. Остановить: Ctrl+C в этом окне или stop.cmd.
rem SetThreadExecutionState держит систему и экран бодрыми, пока жив этот процесс PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -Name Power -Namespace Quiz -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; [void][Quiz.Power]::SetThreadExecutionState([uint32]2147483651); & npm.cmd start; exit $LASTEXITCODE"
if errorlevel 1 goto failed
goto :eof

:no_node
echo Не найден Node.js (npm). Установите его: https://nodejs.org
pause
exit /b 1

:failed
echo.
echo Сервер остановлен. Если вы его не останавливали — подробности выше.
pause
exit /b 1
