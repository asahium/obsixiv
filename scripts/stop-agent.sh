#!/bin/bash

# Stop ObsiXiv Koog Agent

set -e

echo "🛑 Stopping ObsiXiv Koog Agent..."

cd koog-agent
docker-compose down

echo "✅ Agent stopped successfully!"

