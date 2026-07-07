#!/usr/bin/env bash
# Starts Postgres + Redis in Docker, then runs the backend (uvicorn) and
# frontend (vite) locally. Ctrl+C stops both.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env not found — copy .env.example to .env and fill in your credentials first."
  exit 1
fi

echo "Starting Postgres + Redis containers..."
docker compose up -d postgres redis

echo "Starting backend at http://localhost:8000 ..."
(
  cd backend
  # shellcheck disable=SC1091
  source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate
  uvicorn main:app --reload --port 8000
) &
BACKEND_PID=$!

echo "Starting frontend at http://localhost:5173 ..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' EXIT
wait
