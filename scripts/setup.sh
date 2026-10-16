#!/usr/bin/env bash
set -e

echo "=== Setting up EduTech Web Monorepo ==="

# 1. Verify pnpm installation
if ! command -v pnpm &> /dev/null; then
  echo "pnpm not found, enabling via corepack..."
  corepack enable
fi

# 2. Setup environment configuration (never overwrites an existing .env)
if [ ! -f .env ]; then
  echo "Creating .env from .env.example (local development placeholders)..."
  cp .env.example .env
fi

# 3. Install workspace dependencies
echo "Installing dependencies..."
pnpm install

echo "=== Setup complete! ==="
echo "1. Start PostgreSQL:        pnpm db:up"
echo "2. Apply migrations:        pnpm db:migrate --confirm-migrate"
echo "3. (optional) demo data:    pnpm db:seed:dev --confirm-seed"
echo "4. Start development:       pnpm dev"
