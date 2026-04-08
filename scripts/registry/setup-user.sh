#!/bin/bash
# Create a user for publishing to a Verdaccio registry
#
# Usage:
#   ./scripts/registry/setup-user.sh              # local registry
#   ./scripts/registry/setup-user.sh --remote     # remote registry

LOCAL_REGISTRY="http://localhost:4873"
REMOTE_REGISTRY="https://dev.registry.freighttech.org/"

TARGET=""
for arg in "$@"; do
  case "$arg" in
    --remote) TARGET="remote" ;;
    --local)  TARGET="local" ;;
    *)
      echo "Usage: $0 [--local|--remote]"
      exit 1
      ;;
  esac
done

if [ -n "$VERDACCIO_URL" ]; then
  REGISTRY_URL="$VERDACCIO_URL"
elif [ "$TARGET" = "remote" ]; then
  REGISTRY_URL="$REMOTE_REGISTRY"
else
  REGISTRY_URL="$LOCAL_REGISTRY"
fi

# Check if registry is reachable
if ! curl -s "$REGISTRY_URL/-/ping" > /dev/null 2>&1; then
  echo "Error: Verdaccio registry is not reachable at $REGISTRY_URL"
  if [ "$REGISTRY_URL" = "$LOCAL_REGISTRY" ]; then
    echo "Run 'docker compose up -d verdaccio' first"
  fi
  exit 1
fi

echo "Setting up user for registry: $REGISTRY_URL"
npm adduser --registry "$REGISTRY_URL"
