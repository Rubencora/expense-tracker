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
echo ">> Running database migrations..."
docker compose exec app npx prisma migrate deploy

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
