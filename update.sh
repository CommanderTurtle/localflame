#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "localflame has tracked local changes; commit or stash them before updating." >&2
  exit 1
fi

branch="$(git branch --show-current)"
[[ -n "$branch" ]] || {
  echo "localflame update requires a checked-out branch." >&2
  exit 1
}

remote="${LOCALFLAME_GIT_REMOTE:-origin}"
git remote get-url "$remote" >/dev/null 2>&1 || {
  printf 'localflame Git remote is unavailable: %s\n' "$remote" >&2
  exit 1
}
git fetch --prune "$remote"

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
if [[ "$upstream" == "$remote/"* ]]; then
  target="${upstream#"$remote/"}"
elif git show-ref --verify --quiet "refs/remotes/$remote/$branch"; then
  target="$branch"
else
  target="$(git symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null || true)"
  target="${target#"$remote/"}"
  if [[ -z "$target" ]]; then
    for candidate in main master; do
      if git show-ref --verify --quiet "refs/remotes/$remote/$candidate"; then
        target="$candidate"
        break
      fi
    done
  fi
fi
[[ -n "$target" ]] || {
  printf 'localflame could not resolve a branch from remote %s.\n' "$remote" >&2
  exit 1
}

remote_ref="refs/remotes/$remote/$target"
if git merge-base --is-ancestor "$remote_ref" HEAD; then
  printf 'localflame already contains %s/%s.\n' "$remote" "$target"
elif git merge-base --is-ancestor HEAD "$remote_ref"; then
  git merge --ff-only "$remote_ref"
else
  printf 'localflame and %s/%s have diverged; review them before updating.\n' \
    "$remote" "$target" >&2
  exit 1
fi
exec "$ROOT/install.sh" "$@"
