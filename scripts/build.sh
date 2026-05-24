#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Build TypeScript via Vite
npx vite build

# Fix HTML location
if [ -f dist/src/sidepanel.html ]; then
  mv dist/src/sidepanel.html dist/sidepanel.html
  # Fix the relative path from ../sidepanel.js to ./sidepanel.js
  sed -i.bak 's|src="../sidepanel.js"|src="./sidepanel.js"|g' dist/sidepanel.html
  rm -f dist/sidepanel.html.bak
  rmdir dist/src 2>/dev/null || true
fi

# Copy manifest
cp public/manifest.json dist/manifest.json

# Ensure sidepanel.html references sidepanel.js correctly
# (Vite should handle this, but verify)

echo "Build complete. Load dist/ as unpacked extension."
