#!/usr/bin/env bash
# Start PostgreSQL (waiting until it is healthy), then the app. Non-destructive: never runs
# `docker compose down -v`, never resets or seeds the database.
set -e

echo "=== Starting EduTech Web (Dev Mode) ==="

if [ ! -f .env ]; then
  echo "No .env found. Create it first:  cp .env.example .env" >&2
  exit 1
fi

if command -v docker &> /dev/null; then
  echo "Starting PostgreSQL and waiting until it is healthy..."
  docker compose up -d --wait postgres
else
  echo "Docker not found: make sure DATABASE_URL in .env points to a reachable PostgreSQL server."
fi

echo "If this is a new database, apply the migrations once:  pnpm db:migrate --confirm-migrate"
# Next.js starts the NestJS API (see instrumentation.ts); the API waits for PostgreSQL itself.
pnpm dev
