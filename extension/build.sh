#!/bin/bash
# Vendor ninja-keys (bundled with lit-html) into lib/ninja-keys.mjs (ESM format).
# Run this whenever you need to update the ninja-keys dependency.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Installing ninja-keys into temp directory..."
(cd "$TMPDIR" && npm init -y --silent && npm install ninja-keys --silent) 2>&1 | tail -1

echo "Bundling with esbuild (ESM format)..."
mkdir -p "$SCRIPT_DIR/lib"
# Run esbuild from $TMPDIR so it resolves ninja-keys from its node_modules.
(cd "$TMPDIR" && npx --yes esbuild ninja-keys \
  --bundle --format=esm \
  --outfile="$SCRIPT_DIR/lib/ninja-keys.mjs")

echo "Done. lib/ninja-keys.mjs is ready."
ls -lh "$SCRIPT_DIR/lib/ninja-keys.mjs"
