#!/bin/bash
# Republish all packages to local Verdaccio registry (removes existing versions first)
# Usage: ./scripts/registry/republish.sh

REGISTRY_URL="${VERDACCIO_URL:-http://localhost:4873}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FAILED_PACKAGES=()

# Check if registry is running
if ! curl -s "$REGISTRY_URL/-/ping" > /dev/null 2>&1; then
  echo "Error: Verdaccio registry is not running at $REGISTRY_URL"
  echo "Run 'docker compose up -d verdaccio' first"
  exit 1
fi

# Define packages in dependency order
PACKAGES=(
  "shared"
  "events"
  "cache"
  "queue"
  "ui"
  "core"
  "gateway-stripe"
  "ksef"
  "search"
  "content"
  "onboarding"
  "ai-assistant"
  "scheduler"
  "cli"
  "create-app"
)

echo "=========================================="
echo "  Republishing to Verdaccio"
echo "  Registry: $REGISTRY_URL"
echo "=========================================="
echo ""

# Step 1: Unpublish all existing versions
echo "Step 1: Removing existing packages..."
for pkg in "${PACKAGES[@]}"; do
  # Get actual package name and version from package.json
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

# Step 3: Publish all packages
echo "Step 3: Publishing packages..."
for pkg in "${PACKAGES[@]}"; do
  PKG_DIR="$ROOT_DIR/packages/$pkg"
  PKG_NAME=$(jq -r '.name' "$PKG_DIR/package.json" 2>/dev/null)

  if [ -d "$PKG_DIR" ]; then
    echo "  Publishing $PKG_NAME..."
    cd "$PKG_DIR"

    # Clean any existing tarballs
    rm -f *.tgz @open-mercato-*.tgz create-mercato-app-*.tgz 2>/dev/null

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
  echo "  Done! All packages published."
else
  echo "  Done with errors. Failed packages:"
  for failed in "${FAILED_PACKAGES[@]}"; do
    echo "    ✗ $failed"
  done
fi
echo "  View packages at: $REGISTRY_URL"
echo "=========================================="

[ ${#FAILED_PACKAGES[@]} -eq 0 ]
