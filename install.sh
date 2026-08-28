#!/usr/bin/env bash
# ln -s? no — run this from the repo root (or any dir; it finds itself).
#
# localflame — one-shot installer that wires a self-hosted (zero-auth) Firecrawl
# into the DeepSeek Harness web seam (`dsh-web`) as a local web-search/fetch
# provider. Run it, then restart DSH.
#
# What it does:
#   1. Copies the provider package (@local/dsh-web-firecrawl) into the profile's
#      node_modules.
#   2. Appends a patch overlay to the profile's cordis.patch.yml:
#        - selects our provider (firecrawl-local) for web.search/fetch
#        - inserts the provider plugin entry
#        - disables the cloud-only deepseek search provider (not needed)
#   3. Enables the `web_fetch` tool in the agent presets you use (the shipped
#      Standard / PTC / Creator presets: standard, code, cordis) by flipping
#      their tool-web config from fetch:false to fetch:true. The per-session
#      `web_fetch` tool is mounted by the agent preset, NOT by the profile patch
#      (the web-app disables the host tool-web row), so this flip is the actual
#      lever that surfaces web_fetch.
#
# Idempotent: safe to run repeatedly; it will not create duplicate entries.
# Zero config: defaults to http://localhost:3002, no API key required.
# AGPL-3.0-or-later. See LICENSE.

set -euo pipefail

# --- self-locate (lets you run ./install.sh from anywhere) -------------------
SCRIPT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- defaults ----------------------------------------------------------------
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${DSH_PROFILE:-web}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PROFILE_PATCH="$PROFILE_DIR/cordis.patch.yml"
FIRE_BASE_URL="${LOCALFLAME_BASE_URL:-http://localhost:3002}"

# --- flags -------------------------------------------------------------------
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      echo "usage: ./install.sh [--dry-run]"
      echo "  --dry-run   show what would be written without touching files"
      echo "env: DSH_HOME, DSH_PROFILE, LOCALFLAME_BASE_URL"
      exit 0 ;;
  esac
done

say()  { printf '\033[1;34m[localflame]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[localflame]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[localflame]\033[0m %s\n' "$*" >&2; exit 1; }

# --- sanity ------------------------------------------------------------------
[ -d "$PROFILE_DIR" ] || die "profile '$PROFILE' not found at $PROFILE_DIR. Is DSH installed? (expected under $DSH_HOME/profiles)"

echo "localflame installer"
echo "  DSH home   : $DSH_HOME"
echo "  profile    : $PROFILE  ($PROFILE_DIR)"
echo "  firecrawl  : $FIRE_BASE_URL"

# 1) provider package into the profile's node_modules -------------------------
PKG="@local/dsh-web-firecrawl"
DEST="$PROFILE_DIR/node_modules/$PKG"
PKG_SRC="$SCRIPT_SRC/dsh-web-firecrawl"

[ -f "$PKG_SRC/package.json" ] || die "provider package missing at $PKG_SRC"

if [ "$DRY_RUN" = 1 ]; then
  say "would copy provider: $PKG_SRC -> $DEST"
else
  mkdir -p "$DEST/lib"
  cp "$PKG_SRC/package.json"  "$DEST/package.json"
  cp "$PKG_SRC/lib/index.js"  "$DEST/lib/index.js"
  say "installed provider package -> $DEST"
fi

# 2) profile patch overlay -----------------------------------------------------
# DSH's patch composer treats top-level rows as OVERRIDES of existing entries;
# a brand-new plugin entry must be added under `- insert:`. We keep this
# idempotent by keying on a marker comment. The provider's richer search/fetch
# flags (news, scrapeContent, domains, formats, ...) live as commented examples
# inside the patch — see README's feature matrix for the full list.
#
# NOTE: the `tool-web` row is deliberately NOT patched here. The host tool-web
# row is disabled by web-app and the real per-session tool is mounted by the
# agent preset; flipping fetch happens in step 3 on the preset files instead.

MARKER="# localflame: self-hosted firecrawl web provider"

make_patch() {
  cat <<EOF
$MARKER
- id: web
  config:
    searchProvider: firecrawl-local
    fetchProvider: firecrawl-local

# Disable the stock cloud-only search provider (needs DEEPSEEK_API_KEY; we use
# the local Firecrawl instance instead).
- id: web-search-deepseek
  disabled: true

- insert:
    - id: web-firecrawl-local
      name: '@local/dsh-web-firecrawl'
      config:
        baseURL: '$FIRE_BASE_URL'
        # Optional search flags (uncomment to use):
        # search:
        #   sources: [web, news]         # add news; the only source with publishedAt
        #   scrapeContent: true          # scrape each result for a richer snippet
        #   includeDomains: [example.com]
        #   excludeDomains: [ads.com]
        #   tbs: qdr:w                   # day/week/month/year freshness
        #   country: "US"
        # Optional fetch flags (uncomment to use):
        # fetch:
        #   format: markdown             # markdown | html
        #   onlyMainContent: true        # strip nav/header/footer chrome
        #   blockAds: true               # strip ads + cookie banners before return
        #   waitForMs: 0
        #   mobile: false
        #   maxBodyChars: 100000
EOF
}

if [ "$DRY_RUN" = 1 ]; then
  say "would append to $PROFILE_PATCH:"
  make_patch | sed 's/^/    /'
else
  # Idempotent: skip if the marker OR an existing web-firecrawl-local insert is
  # already present (covers a patch applied manually, without the marker).
  if [ -f "$PROFILE_PATCH" ] && (grep -qF "$MARKER" "$PROFILE_PATCH" || grep -qF "web-firecrawl-local" "$PROFILE_PATCH"); then
    say "patch already present in $PROFILE_PATCH (skipping; it is idempotent)"
  else
    # back up any existing user patch, then append our overlay
    if [ -f "$PROFILE_PATCH" ]; then
      cp "$PROFILE_PATCH" "$PROFILE_PATCH.localflame.bak"
      say "backed up existing patch -> $PROFILE_PATCH.localflame.bak"
    fi
    make_patch >> "$PROFILE_PATCH"
    say "appended provider overlay to $PROFILE_PATCH"
  fi
fi

# 3) enable `web_fetch` in the agent presets you use --------------------------
# Per-session tools come from the AGENT PRESET, not the profile patch. The
# shipped presets you use — Standard (`standard`), PTC (`code`), Creator
# (`cordis`) — each mount tool-web with `fetch: false`. Flip that one flag in
# each so `web_fetch` is exposed. Editing the shipped presets in place keeps it
# dependency-free (no clones); re-running after a dsh upgrade re-applies it.
#
# Resolve the shipped preset root from the profile's @deepseek-ai/dsh package.

resolve_shipped_presets_root() {
  local pkg
  pkg="$(cd "$PROFILE_DIR" && node -e "process.stdout.write(require('path').dirname(require.resolve('@deepseek-ai/dsh/package.json')))" 2>/dev/null)" || return 1
  [ -n "$pkg" ] || return 1
  [ -d "$pkg/config/agent-presets" ] || return 1
  printf '%s/config/agent-presets' "$pkg"
}

PRESETS=("standard" "code" "cordis")

if [ "$DRY_RUN" = 1 ]; then
  say "would enable web_fetch (fetch:true) in agent presets: ${PRESETS[*]}"
else
  PRESET_ROOT="$(resolve_shipped_presets_root)" || PRESET_ROOT=""
  if [ -z "$PRESET_ROOT" ]; then
    warn "could not locate shipped agent presets (install DSH and re-run); web_fetch may stay hidden in the active preset"
  else
    for pre in "${PRESETS[@]}"; do
      f="$PRESET_ROOT/$pre/agent.cordis.yml"
      [ -f "$f" ] || { warn "preset '$pre' not found (skipping)"; continue; }
      if grep -qE '^[[:space:]]*fetch: true' "$f"; then
        say "preset '$pre' already exposes web_fetch (skipping)"
      elif grep -qE '^[[:space:]]*fetch: false' "$f"; then
        cp "$f" "$f.localflame.bak"
        sed -i 's/^\([[:space:]]*\)fetch: false$/\1fetch: true/' "$f"
        say "enabled web_fetch in agent preset '$pre'"
      else
        warn "preset '$pre' has no tool-web fetch flag to flip (skipping)"
      fi
    done
  fi
fi

# 4) reminder -----------------------------------------------------------------
say "done."
cat <<'EOF'

Next steps:
  1. Ensure your self-hosted Firecrawl is running and reachable (default
     http://localhost:3002):  curl -s $FIRE_BASE_URL/   ->  {"message":"Firecrawl API",...}
  2. Restart DeepSeek Harness so it reloads the profile patch, plugin, and the
     agent-preset fetch flips:
         dsh --profile web                 (stop it first if already running)
  3. Verify: ask the agent to run web_search and web_fetch.

Notes:
  - Zero auth: no API key or Authorization header is used. Override the
    endpoint with $LOCALFLAME_BASE_URL at install time, or FIRECRAWL_API_URL at
    runtime (see .env.example).
  - web_fetch is exposed by flipping the agent preset's tool-web fetch:false to
    fetch:true (Standard/PTC/Creator). Backups are written as
    *.localflame.bak beside each preset file; a future dsh upgrade will restore
    fetch:false, so re-run ./install.sh after upgrading.
  - If DSH prunes the profile node_modules on a future install, add the package
    as a file: dependency instead:
        (edit $PROFILE_DIR/package.json)
          "dependencies": { "@local/dsh-web-firecrawl": "file:/absolute/path/to/dsh-web-firecrawl" }
        then run: pnpm install  (in $PROFILE_DIR)
  - Uninstall: rm -rf "$DEST", remove the $MARKER block from $PROFILE_PATCH,
    and restore each agent preset from its .localflame.bak.
EOF