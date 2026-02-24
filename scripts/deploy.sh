#!/bin/bash
# =============================================================================
# IT HelpDesk Agent - Production Deployment Script
# Usage: ./scripts/deploy.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
ENV_FILE="$PROJECT_DIR/.env.production"

echo "========================================="
echo "IT HelpDesk Agent - Production Deployment"
echo "========================================="

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "ERROR: Docker Compose V2 is not available"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env.production not found"
    echo "Copy .env.production.example and fill in production values"
    exit 1
fi

# Pull latest code (if in a git repo)
if [ -d "$PROJECT_DIR/.git" ]; then
    echo ""
    echo "[1/4] Pulling latest code..."
    cd "$PROJECT_DIR"
    git pull --ff-only || echo "WARNING: git pull failed, continuing with current code"
fi

# Build Docker images
echo ""
echo "[2/4] Building Docker images..."
cd "$PROJECT_DIR"

# Source env file for build args
set -a
source "$ENV_FILE"
set +a

docker compose -f "$COMPOSE_FILE" build --no-cache

# Restart containers
echo ""
echo "[3/4] Restarting containers..."
docker compose -f "$COMPOSE_FILE" down
docker compose -f "$COMPOSE_FILE" up -d

# Health check
echo ""
echo "[4/4] Waiting for services to start..."
sleep 10

# Check API health
echo -n "API health check: "
if curl -sf http://127.0.0.1:3001/api/health > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAILED (may still be starting)"
fi

# Check Web health
echo -n "Web health check: "
if curl -sf http://127.0.0.1:3000/ > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAILED (may still be starting)"
fi

echo ""
echo "========================================="
echo "Deployment complete!"
echo "API:  http://127.0.0.1:3001"
echo "Web:  http://127.0.0.1:3000"
echo ""
echo "If Nginx is configured:"
echo "  https://helpdesk.ai3lines.com"
echo "========================================="
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.prod.yml logs -f    # View logs"
echo "  docker compose -f docker-compose.prod.yml ps         # Check status"
echo "  docker compose -f docker-compose.prod.yml restart     # Restart"
