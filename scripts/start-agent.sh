#!/bin/bash

# ObsiXiv Koog Agent Startup Script

set -e

echo "🚀 Starting ObsiXiv Koog Agent..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    echo "Visit: https://www.docker.com/get-started"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi

# Navigate to koog-agent directory
cd koog-agent

# Start the agent
echo "📦 Building and starting Koog Agent..."
docker-compose up -d

# Wait for health check
echo "⏳ Waiting for agent to be ready..."
sleep 5

# Check health
if curl -s http://localhost:8080/api/v1/health > /dev/null; then
    echo ""
    echo "✅ Koog Agent is running!"
    echo "📍 URL: http://localhost:8080"
    echo "🔍 Health check: http://localhost:8080/api/v1/health"
    echo ""
    echo "Now you can:"
    echo "1. Open Obsidian"
    echo "2. Go to Settings → ObsiXiv"
    echo "3. Add your Anthropic API key"
    echo "4. Start generating blog posts! 🎉"
else
    echo ""
    echo "⚠️  Agent started but health check failed."
    echo "Check logs with: docker-compose logs -f"
fi

