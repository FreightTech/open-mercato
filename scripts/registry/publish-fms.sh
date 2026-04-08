#!/bin/bash
# Republish FMS packages to the FreightTech Verdaccio registry
#
# Usage:
#   ./scripts/registry/publish-fms.sh              # publish to remote (https://dev.registry.freighttech.org/)
#   ./scripts/registry/publish-fms.sh --local      # publish to local  (http://localhost:4873)
#   FMS_VERDACCIO_URL=http://custom:4873 ./scripts/registry/publish-fms.sh  # custom URL

LOCAL_REGISTRY="http://localhost:4873"
REMOTE_REGISTRY="https://dev.registry.freighttech.org/"

# Parse arguments
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --remote) TARGET="remote" ;;
    --local)  TARGET="local" ;;
    --help|-h)
      echo "Usage: $0 [--local|--remote]"
      echo ""
      echo "  --local   Publish to local Verdaccio ($LOCAL_REGISTRY)"
      echo "  --remote  Publish to remote FreightTech Verdaccio ($REMOTE_REGISTRY) (default)"
      echo ""
      echo "Environment variables:"
      echo "  FMS_VERDACCIO_URL  Override the registry URL directly"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Determine registry URL (default: remote)
if [ -n "$FMS_VERDACCIO_URL" ]; then
  REGISTRY_URL="$FMS_VERDACCIO_URL"
elif [ "$TARGET" = "local" ]; then
  REGISTRY_URL="$LOCAL_REGISTRY"
else
  REGISTRY_URL="$REMOTE_REGISTRY"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FAILED_PACKAGES=()

# Check if registry is reachable
if ! curl -s "$REGISTRY_URL/-/ping" > /dev/null 2>&1; then
  echo "Error: Verdaccio registry is not reachable at $REGISTRY_URL"
  if [ "$REGISTRY_URL" = "$LOCAL_REGISTRY" ]; then
    echo "Run 'docker compose up -d verdaccio' first"
  else
    echo "Check your network connection and VPN"
  fi
  exit 1
fi

# Check if user is authenticated with the registry
WHOAMI=$(npm whoami --registry "$REGISTRY_URL" 2>/dev/null)
if [ -z "$WHOAMI" ]; then
  echo "Error: Not authenticated with registry at $REGISTRY_URL"
  echo "Run 'yarn registry:setup-user' first to log in."
  exit 1
fi
echo "Authenticated as: $WHOAMI"

# FMS packages in dependency order
PACKAGES=(
  "fms"
  "fms_tracking"
  "ksef"
)

echo "=========================================="
echo "  Republishing FMS packages to Verdaccio"
echo "  Registry: $REGISTRY_URL"
echo "=========================================="
echo ""

# Step 1: Unpublish all existing versions
echo "Step 1: Removing existing packages..."
for pkg in "${PACKAGES[@]}"; do
  PKG_NAME=$(jq -r '.name' "$ROOT_DIR/packages/$pkg/package.json" 2>/dev/null)
  VERSION=$(jq -r '.version' "$ROOT_DIR/packages/$pkg/package.json" 2>/dev/null)
  if [ -n "$VERSION" ] && [ "$VERSION" != "null" ] && [ -n "$PKG_NAME" ] && [ "$PKG_NAME" != "null" ]; then
    echo "  Unpublishing $PKG_NAME@$VERSION..."
    npm unpublish "$PKG_NAME@$VERSION" --registry "$REGISTRY_URL" --force 2>/dev/null || true
  fi
done
echo ""

# Step 2: Build all packages
echo "Step 2: Building packages..."
cd "$ROOT_DIR"
if ! yarn build:packages; then
  echo "Error: Build failed"
  exit 1
fi
echo ""

# Step 3: Publish FMS packages
echo "Step 3: Publishing packages..."
for pkg in "${PACKAGES[@]}"; do
  PKG_DIR="$ROOT_DIR/packages/$pkg"
  PKG_NAME=$(jq -r '.name' "$PKG_DIR/package.json" 2>/dev/null)

  if [ -d "$PKG_DIR" ]; then
    echo "  Publishing $PKG_NAME..."
    cd "$PKG_DIR"

    # Clean any existing tarballs
    rm -f *.tgz @open-mercato-*.tgz 2>/dev/null

    # Use yarn pack to create tarball with workspace:* resolved
    if ! yarn pack --out "package.tgz" >/dev/null 2>&1; then
      echo "    ✗ Failed to create tarball"
      FAILED_PACKAGES+=("$PKG_NAME (pack)")
      cd "$ROOT_DIR"
      continue
    fi

    if [ -f "package.tgz" ]; then
      if npm publish "package.tgz" --registry "$REGISTRY_URL" --access public --tag latest; then
        echo "    ✓ Published"
      else
        echo "    ✗ Failed to publish (exit code: $?)"
        FAILED_PACKAGES+=("$PKG_NAME (publish)")
      fi
      rm -f "package.tgz"
    else
      echo "    ✗ Failed to create tarball"
      FAILED_PACKAGES+=("$PKG_NAME (pack)")
    fi

    cd "$ROOT_DIR"
  fi
done

echo ""
echo "=========================================="
if [ ${#FAILED_PACKAGES[@]} -eq 0 ]; then
  echo "  Done! All FMS packages published."
else
  echo "  Done with errors. Failed packages:"
  for failed in "${FAILED_PACKAGES[@]}"; do
    echo "    ✗ $failed"
  done
fi
echo "  View packages at: $REGISTRY_URL"
echo "=========================================="

[ ${#FAILED_PACKAGES[@]} -eq 0 ]
