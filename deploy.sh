#!/bin/bash
set -e

echo "=== Expense Tracker - Deploy ==="

# Pull latest code
echo ">> Pulling latest code..."
git pull origin main

# Build and restart container
echo ">> Building Docker image..."
docker compose build

echo ">> Starting container..."
docker compose up -d

# Run migrations
# The production image is a Next.js standalone build without the Prisma CLI or dotenv,
# so migrations run in a throwaway node container with the repo's prisma/ mounted.
echo ">> Running database migrations..."
docker run --rm \
  --env-file .env.production \
  -v "$PWD/prisma:/app/prisma:ro" \
  -v "$PWD/prisma.config.ts:/app/prisma.config.ts:ro" \
  -w /app node:22-alpine \
  sh -c "npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund --silent prisma@7.4.1 dotenv >/dev/null && npx prisma migrate deploy"

echo ">> Deploy complete!"
echo ">> App running at http://localhost:3000"
echo ""
echo "Next steps (first time only):"
echo "  1. Copy nginx/expenses.conf to /etc/nginx/sites-available/"
echo "  2. ln -s /etc/nginx/sites-available/expenses.conf /etc/nginx/sites-enabled/"
echo "  3. sudo certbot --nginx -d expenses.byruben.io"
echo "  4. sudo systemctl reload nginx"
echo "  5. Set up Telegram webhook:"
echo "     curl https://expenses.byruben.io/api/telegram/setup?secret=YOUR_JWT_SECRET"
