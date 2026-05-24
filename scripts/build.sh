#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

echo "Build complete. Load dist/ as unpacked extension."
