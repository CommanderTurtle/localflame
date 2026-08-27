#!/usr/bin/env bash
# ln -s? no — run this from the repo root (or any dir; it finds itself).
#
# localflame — one-shot installer that wires a self-hosted (zero-auth) Firecrawl
# into the DeepSeek Harness web seam (`dsh-web`) as a local web-search/fetch
# provider. Run it, then restart DSH. Emits exactly the two artifacts the manual
# setup produces: the provider package in the profile's node_modules, and a
# patch overlay on the profile's cordis.patch.yml.
#
# Idempotent: safe to run repeatedly; it will not create duplicate entries.
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
# a brand-new plugin entry must be added under `- insert:`. We also flip the two
# stock rows (web provider selection, and tool-web.fetch) and keep it idempotent
# by keying on a marker comment.

MARKER="# localflame: self-hosted firecrawl web provider"

make_patch() {
  cat <<EOF
$MARKER
- id: web
  config:
    searchProvider: firecrawl-local
    fetchProvider: firecrawl-local

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

- id: tool-web
  config:
    search: true
    fetch: true
    searchTimeoutMs: 60000
    fetchTimeoutMs: 60000

# The per-session `web_fetch` tool is mounted by the AGENT PRESET, not this
# profile row (the web-app disables the host tool-web; only the preset's row
# reaches a session, and the shipped presets force `fetch: false`). So we flip
# the active preset from shipped `standard` to a local `standard-fetch` copy.
- id: agent-presets
  config:
    default: standard-fetch
EOF
}

if [ "$DRY_RUN" = 1 ]; then
  say "would append to $PROFILE_PATCH:"
  make_patch | sed 's/^/    /'
else
  # Idempotent: skip if the marker OR an existing web-firecrawl-local insert is
  # already present (covers a patch applied manually, without the marker).
  if [ -f "$PROFILE_PATCH" ] && (grep -qF "$MARKER" "$PROFILE_PATCH" || grep -qF "web-firecrawl-local" "$PROFILE_PATCH"); then
    warn "patch already present in $PROFILE_PATCH (skipping; it is idempotent)"
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

# 3) agent preset: authoritative `web_fetch` exposure --------------------------
# The DSH installs ship `standard` (fetch:false). Author a persistent user
# preset `standard-fetch` = a copy of shipped `standard` with fetch:true, so
# web_fetch is exposed and survives dsh upgrades (shipped presets are copies).
# Idempotent: skip when our preset already exists with fetch enabled.

PKG_DIR="$PROFILE_DIR/node_modules/@deepseek-ai/dsh/config/agent-presets"
USER_PRESET_DIR="$DSH_HOME/.agent-presets"
PRESET_ID="standard-fetch"
PRESET_DEST="$USER_PRESET_DIR/$PRESET_ID"

resolve_shipped_standard() {
  # The shipped `standard` preset lives beside the installed @deepseek-ai/dsh.
  # Resolve that package from the profile (host base) so we copy its real tree.
  local pkg
  pkg="$(cd "$PROFILE_DIR" && node -e "process.stdout.write(require('path').dirname(require.resolve('@deepseek-ai/dsh/package.json')))" 2>/dev/null)" || return 1
  [ -n "$pkg" ] || return 1
  [ -f "$pkg/config/agent-presets/standard/agent.cordis.yml" ] || return 1
  printf '%s/config/agent-presets/standard' "$pkg"
}

SHIPPED_STANDARD="$(resolve_shipped_standard)"

if [ -z "$SHIPPED_STANDARD" ]; then
  warn "could not resolve shipped 'standard' agent preset (install DSH and re-run); web_fetch may stay hidden in the active preset"
else
  if [ -f "$PRESET_DEST/agent.cordis.yml" ] && grep -qF "fetch: true" "$PRESET_DEST/agent.cordis.yml"; then
    say "agent preset '$PRESET_ID' already present with fetch enabled (skipping)"
  else
    mkdir -p "$PRESET_DEST"
    cp "$SHIPPED_STANDARD/agent.cordis.yml" "$PRESET_DEST/agent.cordis.yml"
    # flip ONLY the tool-web fetch line (there is exactly one `fetch:` in the
    # shipped standard composition); keep everything else identical.
    sed -i 's/^\([[:space:]]*\)fetch: false$/\1fetch: true/' "$PRESET_DEST/agent.cordis.yml"
    cat > "$PRESET_DEST/preset.yml" <<EOF
name: Standard + web_fetch
description: Localflame-enabled copy of the shipped 'standard' agent preset. Identical except the model-facing web tool exposes web_fetch (fetch: true) alongside web_search.
EOF
    say "authored agent preset '$PRESET_ID' (fetch: true) -> $PRESET_DEST"
  fi
fi

# 4) reminder -----------------------------------------------------------------
say "done."
cat <<'EOF'

Next steps:
  1. Ensure your self-hosted Firecrawl is running and reachable (default
     http://localhost:3002):  curl -s $FIRE_BASE_URL/   ->  {"message":"Firecrawl API",...}
  2. Restart DeepSeek Harness so it reloads the profile patch + plugin:
        dsh --profile web                 (stop it first if already running)
  3. Verify: ask the agent to run web_search and web_fetch.

Notes:
  - The 'standard-fetch' agent preset under $DSH_HOME/.agent-presets is what
    exposes web_fetch in a session (shipped presets force fetch:false). It is a
    copy of the shipped 'standard' preset with only the tool-web fetch flag on;
    the profile patch flips agent-presets.default to it. Delete it to revert.
  - If DSH prunes the profile node_modules on a future install, add the package
    as a file: dependency instead:
        (edit $PROFILE_DIR/package.json)
          "dependencies": { "@local/dsh-web-firecrawl": "file:/absolute/path/to/dsh-web-firecrawl" }
        then run: pnpm install  (in $PROFILE_DIR)
  - Uninstall: git checkout the .localflame.bak file to restore the patch,
    rm -rf "$DEST", and rm -rf "$PRESET_DEST" (then flip agent-presets.default
    back to standard or delete the row).
EOF