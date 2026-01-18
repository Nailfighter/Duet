#!/bin/bash

# AudioBook Companion Startup Script
# This script starts both the Python agent (backend) and React frontend (frontend)

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   AudioBook Companion - Startup Script        ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$SCRIPT_DIR/agent-starter-python"
REACT_DIR="$SCRIPT_DIR/agent-starter-react"

# Check if required directories exist
if [ ! -d "$PYTHON_DIR" ]; then
    echo -e "${RED}❌ Error: Python directory not found at $PYTHON_DIR${NC}"
    exit 1
fi

if [ ! -d "$REACT_DIR" ]; then
    echo -e "${RED}❌ Error: React directory not found at $REACT_DIR${NC}"
    exit 1
fi

# Check if .env.local exists
if [ ! -f "$PYTHON_DIR/.env.local" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env.local not found in agent-starter-python${NC}"
    echo -e "${YELLOW}   Please create .env.local with your LiveKit credentials${NC}"
    echo ""
fi

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    if [ ! -z "$PYTHON_PID" ]; then
        echo -e "${YELLOW}   Stopping Python agent (PID: $PYTHON_PID)${NC}"
        kill $PYTHON_PID 2>/dev/null || true
    fi
    if [ ! -z "$REACT_PID" ]; then
        echo -e "${YELLOW}   Stopping React frontend (PID: $REACT_PID)${NC}"
        kill $REACT_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Shutdown complete${NC}"
    exit 0
}

# Set up trap to catch Ctrl+C and cleanup
trap cleanup SIGINT SIGTERM

# Start Python agent
echo -e "${BLUE}🐍 Starting Python agent...${NC}"
cd "$PYTHON_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${RED}❌ Error: Python virtual environment not found${NC}"
    echo -e "${YELLOW}   Please set up the virtual environment first${NC}"
    exit 1
fi

# Start Python agent in background
source .venv/bin/activate
python src/agent.py dev > /tmp/audiobook-agent.log 2>&1 &
PYTHON_PID=$!

# Wait a bit for agent to start
sleep 3

# Check if Python process is still running
if ! kill -0 $PYTHON_PID 2>/dev/null; then
    echo -e "${RED}❌ Error: Python agent failed to start${NC}"
    echo -e "${YELLOW}   Check logs at: /tmp/audiobook-agent.log${NC}"
    cat /tmp/audiobook-agent.log
    exit 1
fi

echo -e "${GREEN}✅ Python agent started (PID: $PYTHON_PID)${NC}"
echo -e "${BLUE}   Logs: tail -f /tmp/audiobook-agent.log${NC}"
echo ""

# Start React frontend
echo -e "${BLUE}⚛️  Starting React frontend...${NC}"
cd "$REACT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules not found, installing dependencies...${NC}"
    npm install
fi

# Start React in background
npm run dev > /tmp/audiobook-frontend.log 2>&1 &
REACT_PID=$!

# Wait a bit for frontend to start
sleep 5

# Check if React process is still running
if ! kill -0 $REACT_PID 2>/dev/null; then
    echo -e "${RED}❌ Error: React frontend failed to start${NC}"
    echo -e "${YELLOW}   Check logs at: /tmp/audiobook-frontend.log${NC}"
    cat /tmp/audiobook-frontend.log
    cleanup
    exit 1
fi

echo -e "${GREEN}✅ React frontend started (PID: $REACT_PID)${NC}"
echo -e "${BLUE}   Logs: tail -f /tmp/audiobook-frontend.log${NC}"
echo ""

# Display status
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            🎉 All Services Running! 🎉         ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo ""
echo -e "${BLUE}📱 Frontend:${NC}  http://localhost:3000"
echo -e "${BLUE}🐍 Backend:${NC}   Running in dev mode"
echo ""
echo -e "${YELLOW}📋 Quick Commands:${NC}"
echo -e "   ${BLUE}View agent logs:${NC}     tail -f /tmp/audiobook-agent.log"
echo -e "   ${BLUE}View frontend logs:${NC}  tail -f /tmp/audiobook-frontend.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and wait for processes
wait $PYTHON_PID $REACT_PID
