#!/usr/bin/env bash
# Runs bench/render.bench.tsx under `claude plugin test`, which only picks up *.test.tsx,
# and prints its tables. The copy is removed on exit.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
run="$root/bench/render.run.test.tsx"

cp "$root/bench/render.bench.tsx" "$run"
trap 'rm -f "$run"' EXIT

claude plugin test "$root" 2>&1 | sed -n '/^BENCH-START$/,/^BENCH-END$/p' | sed '1d;$d'
