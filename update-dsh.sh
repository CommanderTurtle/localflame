#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  printf 'Refusing to update DSH from a Localflame checkout with tracked changes.\n' >&2
  exit 1
fi

command -v bun >/dev/null 2>&1 || {
  printf 'The DSH updater requires Bun or Sandwich.\n' >&2
  exit 1
}

package_spec="${DSH_PACKAGE_SPEC:-@deepseek-ai/dsh@latest}"
global_root="${BUN_INSTALL_GLOBAL_DIR:-${BUN_INSTALL:-$HOME/.bun}/install/global}"
[[ -f "$global_root/package.json" ]] || {
  printf 'Bun global package root is unavailable: %s\n' "$global_root" >&2
  exit 1
}

before="$(dsh --version 2>/dev/null || printf absent)"
bun add --global "$package_spec"

command -v dsh >/dev/null 2>&1 || {
  printf 'DSH is unavailable after installing %s.\n' "$package_spec" >&2
  exit 1
}
after="$(dsh --version)"

(
  cd "$global_root"
  bun -e '
    const yaml = require("js-yaml");
    if (typeof yaml.Type !== "function") {
      throw new Error("the global js-yaml export does not expose Type");
    }
  '
)

"$ROOT/install.sh" --target dsh --dsh-profile all
dsh --profile web --dump-config >/dev/null
"$ROOT/doctor.sh" --target dsh --dsh-profile all

printf 'DSH updated: %s -> %s; Localflame policy regenerated and verified.\n' \
  "$before" "$after"
