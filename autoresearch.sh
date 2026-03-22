#!/bin/bash
set -euo pipefail

# 0xKobold Build Benchmark
# Measures TypeScript compilation time

cd "$(dirname "$0")"

# Clean build
rm -rf dist .tsbuildinfo

# Measure fresh build
echo "=== Measuring fresh build ==="
START=$(date +%s.%N)
OUTPUT=$(npx tsc -p tsconfig.build.json 2>&1) || true
END=$(date +%s.%N)
FRESH=$(echo "$END - $START" | bc)

# Count any errors
ERRORS=$(echo "$OUTPUT" | grep -c "error TS" || echo "0")

# Measure incremental build
echo "=== Measuring incremental build ==="
START=$(date +%s.%N)
OUTPUT=$(npx tsc -p tsconfig.build.json 2>&1) || true
END=$(date +%s.%N)
INCREMENTAL=$(echo "$END - $START" | bc)

# Bundle size
BUNDLE_SIZE=$(du -sk dist/ 2>/dev/null | cut -f1 || echo "0")

# Output metrics
echo ""
echo "=== RESULTS ==="
echo "METRIC fresh_seconds=$FRESH"
echo "METRIC incremental_seconds=$INCREMENTAL"
echo "METRIC build_seconds=$INCREMENTAL"
echo "METRIC errors=$ERRORS"
echo "METRIC bundle_kb=$BUNDLE_SIZE"
