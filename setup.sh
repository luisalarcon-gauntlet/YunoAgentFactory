#!/bin/bash
set -e

echo "=== Yuno Agent Orchestration Platform Setup ==="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker required. Install: https://docs.docker.com/get-docker/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "Docker Compose v2 required."; exit 1; }

# Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template. Edit it with your API keys, then re-run this script."
  exit 0
fi

# Create openclaw data directories
mkdir -p openclaw-data/config openclaw-data/workspace

# Build and launch
docker compose up -d --build

echo ""
echo "Platform is starting..."
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000/docs"
echo "  OpenClaw:  http://localhost:18789"
echo ""
echo "Run 'docker compose logs -f' to watch startup."
