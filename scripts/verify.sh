#!/usr/bin/env bash
set -e

echo "=== Running Phase 0 Verification Checks ==="

echo "1. Checking TypeScript compilation..."
pnpm build

echo "2. Running ESLint..."
pnpm lint

echo "=== All Phase 0 checks passed! ==="
