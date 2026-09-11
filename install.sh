#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DRY=0
DOCTOR_ARGS=()
DSH_PROFILE_VALUE="${DSH_PROFILE:-web}"
PENDING_TARGET=0
PENDING_PROFILE=0
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY=1
  if [[ "$PENDING_TARGET" == 1 ]]; then
    DOCTOR_ARGS+=(--target "$arg")
    PENDING_TARGET=0
  elif [[ "$PENDING_PROFILE" == 1 ]]; then
    DSH_PROFILE_VALUE="$arg"
    PENDING_PROFILE=0
  elif [[ "$arg" == "--target" ]]; then
    PENDING_TARGET=1
  elif [[ "$arg" == "--dsh-profile" ]]; then
    PENDING_PROFILE=1
  fi
done
[[ "${#DOCTOR_ARGS[@]}" == 0 ]] && DOCTOR_ARGS=(--target all)

command -v bun >/dev/null 2>&1 || { echo "localflame requires Bun" >&2; exit 1; }

if [[ "$DRY" == 0 ]]; then
  cd "$ROOT"
  bun install --frozen-lockfile
  chmod +x "$ROOT/bin/localflame.js" "$ROOT/scripts/configure.mjs" "$ROOT/scripts/doctor.mjs"
  mkdir -p "$HOME/.local/bin"
  ln -sfn "$ROOT/bin/localflame.js" "$HOME/.local/bin/localflame"
fi

bun "$ROOT/scripts/configure.mjs" install "$@"

if [[ "$DRY" == 0 ]]; then
  bun "$ROOT/scripts/doctor.mjs" "${DOCTOR_ARGS[@]}" --dsh-profile "$DSH_PROFILE_VALUE"
  printf '\nRestart each running client so it reloads MCP configuration. Firecrawl itself was not contacted.\n'
fi
