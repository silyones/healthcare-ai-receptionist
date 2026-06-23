#!/bin/sh
set -e

PORT="${PORT:-8000}"

echo "Starting LiveKit agent worker in background..."
python agent.py start &

echo "Starting FastAPI on 0.0.0.0:${PORT}..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
