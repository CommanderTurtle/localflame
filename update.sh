#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "localflame has tracked local changes; commit or stash them before updating." >&2
  exit 1
fi

git pull --ff-only
exec "$ROOT/install.sh" "$@"
