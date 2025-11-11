@echo off
REM ObsiXiv Koog Agent Startup Script for Windows

echo Starting ObsiXiv Koog Agent...
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo Docker not found. Please install Docker Desktop first.
    echo Visit: https://www.docker.com/get-started
    pause
    exit /b 1
)

REM Navigate to koog-agent directory
cd koog-agent

REM Start the agent
echo Building and starting Koog Agent...
docker-compose up -d

REM Wait for startup
echo Waiting for agent to be ready...
timeout /t 5 /nobreak >nul

REM Check health
curl -s http://localhost:8080/api/v1/health >nul 2>&1
if errorlevel 1 (
    echo.
    echo Agent started but health check failed.
    echo Check logs with: docker-compose logs
) else (
    echo.
    echo Koog Agent is running!
    echo URL: http://localhost:8080
    echo.
    echo Now you can:
    echo 1. Open Obsidian
    echo 2. Go to Settings - ObsiXiv
    echo 3. Add your Anthropic API key
    echo 4. Start generating blog posts!
)

pause

