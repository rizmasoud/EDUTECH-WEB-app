#!/usr/bin/env bash
set -e

echo "=== Setting up EduTech Web Monorepo ==="

# 1. Verify pnpm installation
if ! command -v pnpm &> /dev/null; then
  echo "pnpm not found, enabling via corepack..."
  corepack enable
fi

# 2. Setup environment configuration
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

# 3. Install workspace dependencies
echo "Installing dependencies..."
pnpm install

echo "=== Setup complete! ==="
echo "To start PostgreSQL: docker compose up -d"
echo "To start development: pnpm dev"
