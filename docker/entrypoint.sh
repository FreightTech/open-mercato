#!/bin/sh
# Open Mercato Docker Entrypoint
# Starts the main app and optionally the MCP server
#
# Environment variables:
#   AUTO_SPAWN_MCP=false    - Disable MCP server (enabled by default)
#   MCP_PORT=3001           - MCP server port (default: 3001)

set -e

# Track child PIDs for cleanup
MCP_PID=""

cleanup() {
  echo "[entrypoint] Shutting down..."
  if [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null; then
    echo "[entrypoint] Stopping MCP server (PID: $MCP_PID)..."
    kill -TERM "$MCP_PID" 2>/dev/null || true
    wait "$MCP_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup TERM INT

# Start MCP server if enabled (default: enabled)
if [ "${AUTO_SPAWN_MCP:-true}" != "false" ]; then
  MCP_PORT="${MCP_PORT:-3001}"
  echo "[entrypoint] Starting MCP server on port $MCP_PORT..."
  yarn mcp:serve --port "$MCP_PORT" &
  MCP_PID=$!
  echo "[entrypoint] MCP server started (PID: $MCP_PID)"
fi

# Start the main application (foreground)
echo "[entrypoint] Starting main application..."
exec "$@"
