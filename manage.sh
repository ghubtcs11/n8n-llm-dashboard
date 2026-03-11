#!/bin/bash

# n8n LLM Dashboard Management Script
# Usage: ./manage.sh [start|stop|restart|status|install|uninstall|logs]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=3100
APP_NAME="n8n-llm-dashboard"
PID_FILE="$SCRIPT_DIR/.pid"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_node() {
    if ! command -v node &> /dev/null; then
        echo_error "Node.js is not installed. Please install Node.js first."
        echo "Visit: https://nodejs.org"
        exit 1
    fi
}

get_pid() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "$PID"
            return 0
        fi
    fi
    # Check if running on port
    PID=$(lsof -t -i:$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "$PID"
        return 0
    fi
    return 1
}

start() {
    echo_status "Starting $APP_NAME..."
    
    if get_pid > /dev/null 2>&1; then
        echo_warn "$APP_NAME is already running!"
        exit 0
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo_warn "Dependencies not found. Running install..."
        install
    fi
    
    # Start the server
    node server.js > /tmp/n8n-llm-dashboard.log 2>&1 &
    NEW_PID=$!
    echo $NEW_PID > "$PID_FILE"
    
    sleep 2
    
    if get_pid > /dev/null 2>&1; then
        echo_status "$APP_NAME started successfully!"
        echo_status "Open http://localhost:$PORT in your browser"
    else
        echo_error "Failed to start $APP_NAME"
        echo "Check logs: tail -f /tmp/n8n-llm-dashboard.log"
        exit 1
    fi
}

stop() {
    echo_status "Stopping $APP_NAME..."
    
    if ! get_pid > /dev/null 2>&1; then
        echo_warn "$APP_NAME is not running!"
        rm -f "$PID_FILE" 2>/dev/null
        exit 0
    fi
    
    PID=$(get_pid)
    kill "$PID" 2>/dev/null
    sleep 1
    
    if ! ps -p "$PID" > /dev/null 2>&1; then
        echo_status "$APP_NAME stopped successfully!"
        rm -f "$PID_FILE"
    else
        echo_warn "Force killing process..."
        kill -9 "$PID" 2>/dev/null
        rm -f "$PID_FILE"
        echo_status "$APP_NAME stopped!"
    fi
}

restart() {
    stop
    sleep 1
    start
}

status() {
    if get_pid > /dev/null 2>&1; then
        PID=$(get_pid)
        echo_status "$APP_NAME is RUNNING (PID: $PID)"
    else
        echo_status "$APP_NAME is NOT running"
    fi
}

install() {
    check_node
    
    echo_status "Installing dependencies..."
    npm install
    
    if [ $? -eq 0 ]; then
        echo_status "Dependencies installed successfully!"
    else
        echo_error "Failed to install dependencies"
        exit 1
    fi
}

uninstall() {
    echo_warn "This will remove node_modules and the PID file."
    read -p "Are you sure? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        # Stop if running
        if get_pid > /dev/null 2>&1; then
            stop
        fi
        
        # Remove node_modules
        rm -rf node_modules package-lock.json
        rm -f "$PID_FILE"
        
        echo_status "Uninstall complete!"
        echo_status "To reinstall, run: ./manage.sh install"
    else
        echo_status "Cancelled."
    fi
}

logs() {
    if [ -f "/tmp/n8n-llm-dashboard.log" ]; then
        tail -f /tmp/n8n-llm-dashboard.log
    else
        echo_error "No log file found. Has the app been started?"
    fi
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    install)
        install
        ;;
    uninstall)
        uninstall
        ;;
    logs)
        logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|install|uninstall|logs}"
        echo ""
        echo "Commands:"
        echo "  start     - Start the dashboard server"
        echo "  stop      - Stop the dashboard server"
        echo "  restart   - Restart the dashboard server"
        echo "  status    - Check if the server is running"
        echo "  install   - Install dependencies"
        echo "  uninstall - Remove dependencies and clean up"
        echo "  logs      - View server logs (live)"
        exit 1
        ;;
esac