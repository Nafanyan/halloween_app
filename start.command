#!/bin/bash
# Запуск квиза «Сумеречный шабаш». Двойной клик в Finder или ./start.command в терминале.
# PIN ведущего можно поменять: ADMIN_PIN=4242 ./start.command
set -e
cd "$(dirname "$0")"

export ADMIN_PIN="${ADMIN_PIN:-1234}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Не найден Node.js (npm). Установите его: https://nodejs.org или brew install node"
  read -r -p "Нажмите Enter, чтобы закрыть…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: ставлю зависимости…"
  npm install
fi

echo "Mac не уснёт, пока сервер работает. Остановить: Ctrl+C."
caffeinate -dis npm start
