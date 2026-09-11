# Integration audit

This record identifies the local contracts used by Localflame. It is maintained
with the installer so upgrades can be checked without rediscovering ownership.

## Firecrawl and context behavior

- Request shapes were compared with `CommanderTurtle/llm/src/firecrawl.js` and
  the checked-out self-hosted Firecrawl v2 search/scrape handlers.
- The Markdown cleanup, 12,000-character lossless sectioning, two-tag limit,
  image extraction, and lazy phrase/word index are adapted from the browser
  harness. `sections.join("") === content` is asserted when a resource is made.
- No Localflame timer wraps `fetch`. Cancellation comes only from the MCP client
  signal. Complete content remains in the bounded in-memory resource store.

## Client contracts

### OMP

The installed OMP MCP schema and loader accept a stdio `command`, `args`, `cwd`,
`env`, `enabled`, and `timeout`. OMP defines timeout `0` as no timeout. The
installer merges `localflame` into the default `mcp.json` and each existing
profile already carrying the normal Retrieval/Camofox stack, disables native
search/fetch in each corresponding `config.yml`, and removes obsolete native
Localflame skill copies. Empty auditor/scout profiles and Librarian's private
worker configuration remain untouched.
The complete skill is a cold Retrieval source, leaving only Retrieval's routing
skill in OMP's user tree. It never replaces unrelated MCP servers or settings.

### Hermes

Hermes's checked-in configuration model and MCP loader accept the same stdio
fields plus connection, idle, and lifetime controls. The native `--profile`
path was checked against Diogenes's launcher and is used to apply the contract
to each ordinary Hermes profile as well as the default configuration. A profile
containing the private `librarian-okf` MCP is detected as an isolated worker and
is not broadened. Its request timeout does
not use `0` as unlimited, so Localflame configures 86,400 seconds while leaving
idle and lifetime limits disabled. The native `web` toolset is disabled and all
other toolsets remain unchanged. Obsolete native Localflame skill copies are
removed; the complete skill is indexed cold by Retrieval, leaving only
Retrieval's routing skill in Hermes's user tree.
When Camofox exists, its per-server Hermes filter excludes only `web_search`;
all browser and transcript tools remain enabled.

### DeepSeek Harness

The installed Standard preset, profile loader, `dsh-mcp-client`, and
`dsh-skill-filesystem` were inspected together. Localflame does not modify a
shipped package. It regenerates a user-owned preset from the installed Standard
preset, removes its `tool-web` row, adds the official MCP bridge, selects that
preset in the requested profile and user settings, and installs the skill in
`~/.dsh/skills`. The finite timeout is DSH's largest safe JavaScript timer.

## Repository ownership

The repositories under `~/Hermes` were audited separately. Only repositories
that own an affected integration are changed:

- `persephone` owns the OMP integration and previously registered a second
  Firecrawl `web_search`; it now delegates web search/scrape setup to
  Localflame while retaining its Camofox browser work.
- `sandwich` owns the Hermes update wrapper; it reapplies Localflame after a
  successful upstream Hermes update so regenerated settings remain current.
- Firecrawl core/CLI/skills, Camofox, retrieval, librarian, leetcoder, context
  mode, and the remaining model repositories do not own this MCP wiring and are
  intentionally unchanged. Existing dirty worktrees are not touched.

Diogenes owns the runtime catalog and the repeatable `ompsettings.sh` baseline.
Its integration is recorded in that repository rather than copied here.

## Static verification policy

`scripts/doctor.mjs` parses installed files and checks paths, selected presets,
timeouts, disabled native web surfaces, and clean skill baselines. It does not start a
model, start a harness, connect to the MCP process, or call Firecrawl. Live
Firecrawl and model tests are deliberately outside this integration pass.
