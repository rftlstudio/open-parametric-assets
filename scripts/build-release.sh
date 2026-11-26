#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=${1:?usage: bash scripts/build-release.sh v0.4.0}
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Expected a tag such as v0.4.0" >&2; exit 2; }
[[ ! -e dist/release ]] || { echo "Move the previous dist/release before building." >&2; exit 1; }
mkdir -p dist
stage=$(mktemp -d dist/release-work.XXXXXX)
trap 'echo "Build workspace: $stage" >&2' ERR
samples=50
while true; do
  build="$stage/samples-$samples"
  npm run dataset -- --samples "$samples" --corners --renders --urdf --mjcf --out "$build"
  python scripts/verify-release.py "$build/data.jsonl"
  python sim/summarize_tasks.py "$build/data.jsonl"
  python sim/check_parity.py "$build/data.jsonl"
  node scripts/hf-card.js "$build" "$version"
  bytes=$(python -c 'from pathlib import Path; import sys; print(sum(p.stat().st_size for p in Path(sys.argv[1]).rglob("*") if p.is_file()))' "$build")
  echo "$samples samples per asset plus corners: $bytes bytes"
  if (( bytes < 500000000 )); then
    mv "$build" dist/release
    echo "Verified release ready in dist/release"
    break
  fi
  (( samples > 1 )) || { echo "Corner cases alone exceed the size budget." >&2; exit 1; }
  samples=$(( (samples + 1) / 2 ))
done
