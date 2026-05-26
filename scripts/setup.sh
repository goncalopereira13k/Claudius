#!/usr/bin/env bash
set -e

echo "Claudius setup..."

if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env created — fill in your API keys before running dev.sh"
fi

echo "Done. Run: bash scripts/dev.sh"
