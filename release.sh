#!/usr/bin/env bash
# Build a Chrome Web Store / Load-unpacked zip for the current manifest version.
# Usage: ./release.sh            -> dist/xero-remittance-email-picker-v<version>.zip
#        ./release.sh 0.2.0      -> bumps manifest.json to 0.2.0 first, then zips
set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" != "" ]]; then
  sed -i '' -E "s/\"version\": \"[0-9.]+\"/\"version\": \"$1\"/" manifest.json
fi

VERSION=$(sed -nE 's/.*"version": "([0-9.]+)".*/\1/p' manifest.json)
OUT="dist/xero-remittance-email-picker-v${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"
zip -r "$OUT" manifest.json content.js content.css icons README.md -x '*.DS_Store'
echo "Built $OUT"
