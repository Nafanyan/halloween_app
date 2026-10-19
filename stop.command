#!/bin/bash
# Остановка квиза «Сумеречный шабаш». Двойной клик в Finder или ./stop.command в терминале.
# Если сервер запущен на другом порту: PORT=3001 ./stop.command
PORT="${PORT:-3000}"

# Только процессы квиза, которые слушают этот порт, — чужие программы не трогаем.
PIDS=""
for pid in $(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null); do
  if ps -o command= -p "$pid" | grep -q "server/src/index.ts"; then
    PIDS="$PIDS $pid"
  fi
done

if [ -z "$PIDS" ]; then
  echo "Сервер квиза на порту $PORT не запущен."
else
  kill $PIDS
  for _ in 1 2 3 4 5; do
    lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 1
  done
  if lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Сервер не остановился за 5 секунд, завершаю принудительно."
    kill -9 $PIDS 2>/dev/null
  fi
  echo "Сервер квиза на порту $PORT остановлен. Игроки и очки сохранены — при следующем запуске игра продолжится."
fi

