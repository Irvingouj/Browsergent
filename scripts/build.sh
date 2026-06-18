#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Build complete."
echo ""
echo "Load as unpacked extension: chrome://extensions → Developer mode → Load unpacked → dist/"
echo ""
echo "To package a signed .crx (needs a key):"
echo "  node scripts/package-crx.mjs --key /path/to/extension.pem"
