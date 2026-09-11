# Localflame

Localflame is a Bun-native, Firecrawl-only MCP toolkit for OMP, Hermes Agent,
and DeepSeek Harness. It replaces the old DSH-private provider with one stdio
server and the same lossless, model-addressable result structure used by the
[`llm`](https://github.com/CommanderTurtle/llm) browser harness.

There is no model, browser backend, database, remote package runner, or second
agent loop. Search and scrape requests go only to the configured Firecrawl v2
service. A self-hosted endpoint at `http://127.0.0.1:3002` is the zero-auth
default; `FIRECRAWL_API_KEY` is optional for compatible authenticated hosts.

## Why it exists

A large scrape should not become one enormous tool message. Localflame cleans
the Markdown, splits it at natural boundaries, verifies that joining the
sections reproduces the stored document, and retains the result in memory. The
first call returns a compact outline and section 1. Later calls can search the
resource index or open exact sections.

The store is process-local and bounded by both resource count and UTF-8 bytes.
Restarting the MCP process clears it. No page content is written to disk.

## MCP tools

- `firecrawl_search` — Firecrawl v2 web/news/image search, with scraped Markdown
  enabled by default.
- `firecrawl_scrape` — Markdown-first scrape of a known public URL.
- `firecrawl_find` — exact-phrase-first search, falling back to intersection of
  normalized query words.
- `firecrawl_read` — exact one-based sections or a contiguous section range.
- `firecrawl_outline` — paged section metadata for very large resources.
- `firecrawl_images` — image URLs, alt text, source URL, and section location.
- `firecrawl_resources` — compact inventory of retained resources.

Sections receive at most two useful tags: `code`, `table`, and
`html_gibberish`. The final tag helps an agent avoid spending context on noisy
markup unless it is relevant.

## Install

Requirements are Bun and a configured client. On this workstation, Sandwich
provides Bun plus its `node`, `npm`, `npx`, and related compatibility shims;
`npx` therefore exists and resolves to `bun x --bun`.

```bash
git clone https://github.com/CommanderTurtle/localflame.git ~/Deepseek/localflame
cd ~/Deepseek/localflame
./install.sh
```

The installer is repeatable. It performs a frozen Bun install, adds the
`localflame` executable, merges client configuration, installs a small routing
skill in ordinary Hermes and OMP profiles, and runs a static doctor. It does
not call Firecrawl or a model. The fuller operating guide remains available to
Retrieval as a cold source; DSH receives its own full skill copy.

Select clients explicitly when needed:

```bash
./install.sh --target omp
./install.sh --target hermes
./install.sh --target dsh
./install.sh --target dsh --dsh-profile web
./install.sh --target omp --target hermes
./install.sh --dry-run --target all
```

Use a different self-hosted endpoint with either form:

```bash
LOCALFLAME_BASE_URL=http://127.0.0.1:3002 ./install.sh
./install.sh --firecrawl-url http://192.168.1.10:3002
```

### OMP

Localflame uses OMP's `config` command for registered settings and merges the
stdio server into the user `mcp.json`. It also updates existing OMP profiles
that already carry the ordinary `retrieval` or `camofox` external-tool stack.
Empty auditor/scout profiles and Librarian's private worker stay isolated. OMP
has an interactive `/mcp` command
but no standalone non-interactive `omp mcp` subcommand; the MCP file is
therefore its documented automation boundary. Existing MCP servers are
preserved. OMP receives a small `localflame` routing skill beside the existing
Retrieval and Librarian routers.

Localflame does not prescribe OMP's native `web_search` or `fetch` settings.
For installations touched by the earlier exclusive-provider release, the next
run resets only those two Localflame-owned settings through `omp config` once,
records the migration, and leaves subsequent user choices alone. Its MCP
timeout is `0`, the OMP no-timeout value.

### Hermes Agent

Localflame uses `hermes config set` for the default agent and every existing
ordinary named profile, producing the same MCP mappings shown by
`hermes mcp list`. A profile containing the private `librarian-okf` MCP remains
isolated and receives no general web tools.
`hermes mcp add` is intentionally not used
by unattended setup because it starts and probes the server, then asks an
interactive tool-selection question. Hermes receives the same small
Localflame routing skill while the complete guide remains a Retrieval source.

Hermes's native web toolset and configured providers are preserved. For
profiles touched by the earlier exclusive-provider release, the next run
removes only Localflame's added `web` disable and Camofox `web_search`
exclusion through `hermes config`, records that migration, and does not revisit
provider choices. The Localflame MCP request timeout is 86,400 seconds because
Hermes treats zero as immediate expiry; idle and process-lifetime limits remain
disabled.

### DeepSeek Harness

DSH is not patched in place. Every configure/update pass copies the complete
currently installed preset roster into
`~/.dsh/.localflame-agent-presets`, removes `tool-web` from every copy, and adds
the official `@deepseek-ai/dsh-mcp-client` to every copy. Each selected boot
profile is then restricted to that regenerated root and has the host `web`,
DeepSeek search, HTTP fetch, and `tool-web` rows disabled. Switching among
Standard, PTC, Minimal, and Cordis therefore cannot restore a second web path.
The default target is every installed DSH boot profile.

The skill is installed under `~/.dsh/skills`. Every Localflame MCP operation is
declared read-only, so all seven remain available under DSH's `read-only`
permission preset even while its filesystem and shell policies stay
restricted. The finite MCP timeout is DSH's largest safe JavaScript timer.

The DSH-only policy can also be regenerated directly:

```bash
bun run dsh:destroy-web
```

That command invokes the same checked-in configure path as the installer. It
does not edit the global DSH package and is safe to rerun after an upgrade.

## Update and repair

```bash
cd ~/Deepseek/localflame
./update.sh
```

The updater refuses tracked local changes, fast-forwards the current branch,
performs a frozen Bun install, and regenerates all selected integrations. Use
the same target flags accepted by `install.sh`.

After a harness upgrade, rerunning `./install.sh --target <client>` repairs only
Localflame-owned state. `~/Hermes/sandwich/scripts/update-hermes.sh` also
reapplies the Hermes target after a successful Hermes update when Localflame is
installed at its standard path.

Static inspection is available separately:

```bash
bun scripts/doctor.mjs --target all
bun scripts/doctor.mjs --target dsh --dsh-profile all --json
```

The doctor checks executable paths, configuration shape, provider-policy
migration state, persistent routing skills, the complete regenerated DSH
preset roster, and read-only tool annotations. It makes no network request.

## Uninstall owned entries

```bash
bun scripts/configure.mjs uninstall --target all
```

This removes the Localflame MCP entries, routing skills, DSH managed preset
root, strict DSH patch block, and unchanged DSH skill copy. Modified skill
copies are retained. It does not delete Firecrawl, other MCP servers, or
unrelated harness settings. Hermes and OMP provider choices are left alone;
removing the DSH block exposes whatever profile policy existed before it.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `FIRECRAWL_API_URL` | `http://127.0.0.1:3002` | Runtime Firecrawl base; `/v2` is normalized automatically. |
| `FIRECRAWL_API_KEY` | empty | Optional bearer token. |
| `LOCALFLAME_MAX_RESOURCES` | `64` | In-memory resource-count bound. |
| `LOCALFLAME_MAX_RESOURCE_BYTES` | `67108864` | In-memory UTF-8 content bound. |
| `OMP_HOME` | `~/.omp/agent` | OMP agent configuration directory. |
| `HERMES_HOME` | `~/.hermes` | Hermes configuration root. |
| `DSH_HOME` | `~/.dsh` | DSH configuration root. |
| `DSH_PROFILE` | `all` | DSH boot profile receiving the strict policy, or every profile. |

See [`docs/INTEGRATION-AUDIT.md`](docs/INTEGRATION-AUDIT.md) for the source and
client contracts checked during the MCP migration.

## License

AGPL-3.0-or-later. See [`ATTRIBUTION.md`](ATTRIBUTION.md) for adapted sources
and retained notices.
