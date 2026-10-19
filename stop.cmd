@echo off
rem Остановка квиза «Сумеречный шабаш» на Windows. Двойной клик в Проводнике или stop.cmd в терминале.
rem Если сервер запущен на другом порту: set "PORT=3001" ^&^& stop.cmd
chcp 65001 >nul
if not defined PORT set PORT=3000

rem Только процессы квиза (server/src/index.ts), которые слушают этот порт, — чужие программы не трогаем.
rem Код выхода: 0 — остановлен, 1 — не был запущен, 2 — пришлось завершить принудительно.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]$env:PORT; $ids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { (Get-CimInstance Win32_Process -Filter \"ProcessId=$_\").CommandLine -match 'server[\\/]src[\\/]index\.ts' }); if ($ids.Count -eq 0) { exit 1 }; foreach ($id in $ids) { taskkill /PID $id /T /F >$null 2>&1 }; for ($i = 0; $i -lt 5; $i++) { if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { exit 0 }; Start-Sleep -Seconds 1 }; foreach ($id in $ids) { taskkill /PID $id /T /F >$null 2>&1 }; exit 2"

if errorlevel 2 (
  echo Сервер не остановился за 5 секунд, завершил принудительно.
  goto done
)
if errorlevel 1 (
  echo Сервер квиза на порту %PORT% не запущен.
  goto end
)
:done
echo Сервер квиза на порту %PORT% остановлен. Игроки и очки сохранены — при следующем запуске игра продолжится.
:end
if /i "%~1" neq "/nopause" pause
