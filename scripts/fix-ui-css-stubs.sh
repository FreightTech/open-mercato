#!/bin/bash
# Fix for DynamicTable CSS dynamic imports in @open-mercato/ui
# The build script incorrectly adds .js extension to CSS imports.
# This creates stub files so the imports don't fail at runtime.
# The actual CSS is loaded via globals.css in the app.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
STYLES_DIR="$ROOT_DIR/packages/ui/dist/backend/dynamic-table/styles"

mkdir -p "$STYLES_DIR"

echo "// Stub file - CSS is loaded via globals.css
export default {};" > "$STYLES_DIR/DynamicTable.css.js"

echo "// Stub file - CSS is loaded via globals.css
export default {};" > "$STYLES_DIR/ContextMenu.css.js"

echo "// Stub file - CSS is loaded via globals.css
export default {};" > "$STYLES_DIR/SearchBar.css.js"

echo "Created CSS stub files in $STYLES_DIR"
