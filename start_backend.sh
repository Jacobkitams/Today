#!/bin/bash
# IUEA Today - Backend Startup Script
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
VENV_DIR="$PROJECT_DIR/venv"

echo "=== IUEA Today Backend ==="
echo "Project: $PROJECT_DIR"
echo "Backend: $BACKEND_DIR"

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Change to backend directory (so relative paths like ./today.db work)
cd "$BACKEND_DIR"

# Load .env if present
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

HOST=${HOST:-127.0.0.1}
PORT=${PORT:-8000}

echo "Starting server on $HOST:$PORT ..."
exec uvicorn main:app --host "$HOST" --port "$PORT" --reload
