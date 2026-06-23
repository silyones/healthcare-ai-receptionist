#!/usr/bin/env sh
set -e

cd "$(dirname "$0")"
PORT="${PORT:-8000}"

echo "Starting LiveKit agent worker..."
python agent.py start &

echo "Starting FastAPI on port ${PORT}..."
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
