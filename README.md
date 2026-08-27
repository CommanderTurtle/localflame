# localflame

A tiny, self-hosted [Firecrawl](https://firecrawl.dev) web **search + fetch**
provider for the **DeepSeek Harness** (a.k.a. `dsh`, the `dsh-web` GUI served
by `@deepseek-ai/dsh-web-app`). It routes the harness's native `web_search` /
`web_fetch` tools at your own unauthenticated Firecrawl instance instead of the
cloud-only provider DSH ships with.

```
~/Deepseek/localflame
├── dsh-web-firecrawl/          # the provider plugin (npm module)
│   ├── package.json
│   └── lib/index.js
├── install.sh                  # one-shot, idempotent installer
├── LICENSE                     # GNU AGPL v3 (canonical)
└── README.md
```

**What you get:** after `./install.sh` + a DSH restart, the agent can actually
`web_search` and `web_fetch` against `http://localhost:3002` (or wherever your
Firecrawl lives) with **zero auth**.

---

## Quick start

```bash
# 1. Make sure a self-hosted Firecrawl is running; the default target is http://localhost:3002
curl -s http://localhost:3002/     # -> {"message":"Firecrawl API", ...}

# 2. Run the installer (idempotent; safe to re-run)
cd ~/Deepseek/localflame
./install.sh
#    --dry-run  → preview without touching anything
#    env: DSH_HOME, DSH_PROFILE, LOCALFLAME_BASE_URL

# 3. Restart DeepSeek Harness
dsh --profile web                 # (stop the old one first)

# 4. Verify with the agent: run web_search and web_fetch
```

The installer does exactly two things:

1. Copies `dsh-web-firecrawl/` → `$DSH_HOME/profiles/web/node_modules/@local/dsh-web-firecrawl/`.
2. Appends a patch overlay to `$DSH_HOME/profiles/web/cordis.patch.yml` that:
   - sets `web.searchProvider` / `web.fetchProvider` to `firecrawl-local`,
   - inserts the `@local/dsh-web-firecrawl` plugin row (under `- insert:`),
   - turns on `tool-web.fetch: true`.

## Installer detail

```bash
./install.sh [--dry-run]
# env:
#   DSH_HOME             default ~/.dsh
#   DSH_PROFILE          default web
#   LOCALFLAME_BASE_URL  default http://localhost:3002
```

It is **idempotent**: a marker comment (`# localflame: self-hosted firecrawl web
provider`) keeps it from appending the overlay twice, and it backs up any
existing `cordis.patch.yml` to `cordis.patch.yml.localflame.bak` before
touching it.

> If DSH ever prunes the profile's `node_modules` (e.g. a `pnpm install`), add
> the package as a `file:` dependency instead, then `pnpm install` in the
> profile dir:
> ```json
> "dependencies": { "@local/dsh-web-firecrawl": "file:/abs/path/to/dsh-web-firecrawl" }
> ```

## Uninstall

```bash
# restore the pre-localflame patch
cd "$HOME/.dsh/profiles/web"        # or $DSH_PROFILE
git checkout cordis.patch.yml       # if the profile is itself versioned
# otherwise: cp cordis.patch.yml.localflame.bak cordis.patch.yml
rm -rf "$HOME/.dsh/profiles/web/node_modules/@local/dsh-web-firecrawl"
dsh --profile web                    # restart
```

---

## Why this exists (background)

Stock DeepSeek Harness ships **only one** web-search provider:
`@deepseek-ai/dsh-web-search-deepseek` (id `deepseek-official`), which is
**cloud-only** — it calls DeepSeek's Anthropic-compatible `/messages` endpoint
with `DEEPSEEK_API_KEY` and a native `web_search` server tool. There is **no**
shipped Firecrawl search provider, and no fetch backend (`dsh-web-fetch-http`
isn't even installed). So unless you happen to run a paid cloud key, the web
tools were effectively disabled: `tool-web` ships with `fetch: false`, and the
search provider needs a key.

If you run your own Firecrawl (`~/.config/firecrawl-cli`, a Docker container, a
self-hosted build on `:3002`, etc.), it accepts requests with **no
`Authorization` header**. localflame surfaces that self-hosted instance as a
proper DSH web provider.

---

## How DSH plugins / web providers work (the low-level model)

This is the part we reverse-engineered by reading the installed code
(`@deepseek-ai/*` under `/home/alienl/.bun/install/global/node_modules/`) and
comparing against how **Hermes** (`~/.hermes`) and **OMP/pi-coding-agent**
(`~/.omp`, `@oh-my-pi/pi-coding-agent`) wire Firecrawl on this same machine.

### 1. The `ctx.web` seam

DSH exposes web access as a **service seam** (`ctx.web`), not a hardcoded
function. Two kinds of backend register into it:

- **Search** → `ctx.web.registerSearchProvider(provider)`
- **Fetch** → `ctx.web.registerFetchProvider(provider)`

A provider is any object with:

```ts
interface WebSearchProvider {
  id: string;
  available(): boolean;                       // cheap local check; MUST NOT hit the network
  search(req: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
// WebSearchResult = { content?, sources: WebSearchSource[], truncated: boolean }
interface WebFetchProvider {
  id: string;
  available(): boolean;
  fetch(req: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
// WebFetchResult = { url, statusCode, body: {kind:'html'|'text', content}, truncated }
```

### 2. Provider selection

Which provider runs is chosen by config `web.searchProvider` / `web.fetchProvider`
(or env `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER`). If unset, the
seam auto-selects the single registered usable provider. Failures map to typed
`WebError` codes (`WEB_PROVIDER_CONFIGURED_MISSING`, `WEB_PROVIDER_AMBIGUOUS`,
etc.). The model-facing tools `web_search` / `web_fetch` live in
`dsh-tool-web`, which just formats the seam's result — it never owns provider
selection or network access.

### 3. Plugins register providers

New backends are shipped as **Cordis plugins**: an npm module that exports the
same contract as `dsh-web-search-deepseek`:

```js
export const name = "web-firecrawl-local";
export const inject = ["web"];
export function apply(ctx, config) {
  ctx.web.registerSearchProvider({ id: "firecrawl-local", available: ..., search: ... });
  ctx.web.registerFetchProvider({ id: "firecrawl-local", available: ..., fetch: ... });
}
```

### 4. Profiles and patch overlays

A `dsh` **profile** is a directory (`~/.dsh/profiles/<name>`, e.g. `web`) with a
`package.json` listing `dsh.profile.bundles` (here `@deepseek-ai/dsh-base` +
`@deepseek-ai/dsh-web-app`). The loader composes a config entry tree from:

1. each bundle's `cordis.patch.yml` (the shipped default rows), then
2. the profile's own `cordis.patch.yml`, then
3. any `--patch` overlays.

The patch files are **top-level YAML arrays** of loader entries. Key rule
(relevant to the debugging below): **a top-level row is an *override*** — the
composer looks up that row's `id` in the existing tree and skips it (warn
"entry % not found") if it isn't already there. To *add a brand-new* entry you
must use `- insert:`.

This is why the stock bundle patches use `- insert:` for all their new rows
(`code-runtime`, `webserver`, `web-startup`, …) and only plain `- id:` rows to
override existing base entries.

### 5. How bare package names resolve

The loader imports each row's `name` from `node_modules` using the profile
directory as its resolution anchor (`ctx.baseUrl`), with a flat fallback at
`$DSH_HOME/profiles/node_modules`. So a local package placed under
`$DSH_HOME/profiles/<name>/node_modules/@local/dsh-web-firecrawl` is resolved
the same way an in-box `@deepseek-ai/...` plugin is. (That's what `install.sh`
does.)

### 6. Reference: how Hermes & OMP did it

- **Hermes** (`~/.hermes/hermes-agent/plugins/web/firecrawl/provider.py`):
  a `FirecrawlWebSearchProvider` with a `_KeylessFirecrawlClient` that POSTs to
  `/v2/search` and `/v2/scrape` with **no** `Authorization` header. Config reads
  `FIRECRAWL_API_KEY` / `FIRECRAWL_API_URL`, and `web.use_gateway` selects a
  managed gateway when both are present.
- **OMP / pi-coding-agent**
  (`@oh-my-pi/pi-coding-agent/src/web/search/providers/firecrawl.ts`):
  `FirecrawlProvider` resolves the endpoint from `FIRECRAWL_BASE_URL` /
  `FIRECRAWL_API_URL`, and in **keyless mode** omits the header entirely.

localflame follows the same pattern but as a native DSH provider.

---

## Debugging tear-down (how we found the path)

For the record — the exact journey, including the two gotchas that could
silently fail.

### Symptom

`web_search` returned:

```
Error: Firecrawl search failed (HTTP 401): Unauthorized: Invalid token
```

The before-state was a hand-added, **cloud-only** Firecrawl provider pointing at
`api.firecrawl.dev` with a bad key — while a healthy **zero-auth** local
instance already sat on `:3002`:

```bash
curl -s http://127.0.0.1:3002/          # {"message":"Firecrawl API",...}
curl -s -X POST http://127.0.0.1:3002/v2/search  -H 'Content-Type: application/json' -d '{"query":"github","limit":1}'   # real results, no auth
curl -s -X POST http://127.0.0.1:3002/v2/scrape -H 'Content-Type: application/json' -d '{"url":"https://example.com","formats":["markdown"]}'   # real markdown
```

### What we discovered reading the installed sources

1. **Only the DeepSeek cloud search provider ships.** `ls @deepseek-ai/dsh-web-*`
   → only `dsh-web-search-deepseek` (`id deepseek-official`, cloud-only). No
   Firecrawl provider, no fetch backend.
2. **`dsh-base/cordis.patch.yml` sets the defaults:**
   ```yaml
   - id: web                  # searchProvider: deepseek-official
   - id: web-search-deepseek  # apiKeyEnv: DEEPSEEK_API_KEY
   - id: tool-web             # fetch: false  <-- fetch is OFF by default
   ```
3. **`web-fetch-http` isn't even installed** → fetch had no provider at all.

So the real work was: add a Firecrawl search *and* fetch provider, select it,
and turn on `tool-web.fetch`.

### Gotcha #1 — the patch shape (the big one)

First attempt put the plugin as a plain top-level row:

```yaml
- id: web-firecrawl-local        # ❌ WRONG for a brand-new entry
  name: '@local/dsh-web-firecrawl'
```

After a restart, `web_search` returned:

```
Error: configured web provider "firecrawl-local" is not registered
```

Which is the *smoking gun*: the `web` override **had** applied (the seam learned
`searchProvider: firecrawl-local`) but the plugin row **never mounted** — so no
provider registered under that id.

Reading `applyEntryPatches` in
`@deepseek-ai/dsh-app-boot/lib/index.js`:

```js
const target = entryMap.get(id);
if (!target) { warn("patch: entry % not found", id); continue; }  // <-- skipped!
```

So **top-level rows only override existing entries**; a new id is silently
dropped. The fix is `- insert:`:

```yaml
- insert:
    - id: web-firecrawl-local
      name: '@local/dsh-web-firecrawl'
      config:
        baseURL: 'http://localhost:3002'
```

Additionally, the final overlay's `web` / `tool-web` rows stay top-level
(they *are* overrides of existing ids).

### Gotcha #2 — provider package resolves/imports but wasn't mounted

We confirmed the plugin resolved as a bare module from the profile dir and
imported cleanly (exporting `{ apply, inject, name }`):

```bash
cd ~/.dsh/profiles/web
node --input-type=module -e "import('@local/dsh-web-firecrawl').then(m=>console.log(Object.keys(m)))"  # [ 'apply', 'inject', 'name' ]
```

That was necessary but not sufficient — the code was right, the wiring was the
problem (see Gotcha #1).

### The working end state

- `~/.dsh/profiles/web/node_modules/@local/dsh-web-firecrawl/{package.json,lib/index.js}`
- `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: firecrawl-local
    fetchProvider: firecrawl-local

- insert:
    - id: web-firecrawl-local
      name: '@local/dsh-web-firecrawl'
      config:
        baseURL: 'http://localhost:3002'

- id: tool-web
  config:
    fetch: true
    searchTimeoutMs: 60000
```

After a restart, both tools worked against `:3002` end-to-end.

---

## Verifying it works

After installing and restarting, ask the agent (or run the tool directly) to:

1. `web_search` for something — you should get real sources with URLs.
2. `web_fetch` a URL — you should get markdown back.

Sanity-check the underlying backend anytime:

```bash
curl -s http://127.0.0.1:3002/        # is Firecrawl up?
curl -s -X POST http://127.0.0.1:3002/v2/search -H 'Content-Type: application/json' -d '{"query":"ds","limit":2}'
```

---

## Requirements & limitations

- DSH (`@deepseek-ai/dsh`) installed with a `web` profile.
- A self-hosted, network-reachable Firecrawl accepting unauthenticated requests
  (default `http://localhost:3002`).
- AGPL-3.0 — see [`LICENSE`](./LICENSE).

## Where the numbers come from

- DSH packages read: `/home/alienl/.bun/install/global/node_modules/@deepseek-ai/`
- Hermes plugin: `~/.hermes/hermes-agent/plugins/web/firecrawl/provider.py`
- OMP provider: `@oh-my-pi/pi-coding-agent/src/web/search/providers/firecrawl.ts`
- Docs: [firecrawl.dev](https://firecrawl.dev)

---

## License

GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE).