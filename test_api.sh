#!/usr/bin/env bash
set -e

BASE="http://localhost:8000"

echo "=== RippleTrace Smoke Test ==="

echo -e "\n[1] Health check..."
curl -s "$BASE/api/health" | python -m json.tool

echo -e "\n[2] Run full demo pipeline..."
curl -s -X POST "$BASE/api/demo/run" | python -m json.tool

echo -e "\n[3] List documents..."
curl -s "$BASE/api/documents/" | python -m json.tool

echo -e "\n[4] Graph overview..."
curl -s "$BASE/api/graph/overview" | python -m json.tool

echo -e "\n[5] Dashboard metrics..."
curl -s "$BASE/api/dashboard/metrics" | python -m json.tool

echo -e "\n=== Done ==="
