#!/usr/bin/env bash
set -e

echo "=== Starting EduTech Web (Dev Mode) ==="
# Ensure PostgreSQL is started if docker is available
if command -v docker &> /dev/null; then
  echo "Checking PostgreSQL container..."
  docker compose up -d postgres
fi

# Run concurrent API and Web development servers
pnpm dev
