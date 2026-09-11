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
profile already carrying the normal Retrieval/Camofox stack and installs a
small persistent routing skill. Empty auditor/scout profiles and Librarian's
private worker configuration remain untouched. A stateful one-time migration
uses `omp config reset` to undo only the native search/fetch values written by
the earlier Localflame release. Later runs preserve native provider choices.
It never replaces unrelated MCP servers or settings.

### Hermes

Hermes's checked-in configuration model and MCP loader accept the same stdio
fields plus connection, idle, and lifetime controls. The native `--profile`
path was checked against Diogenes's launcher and is used to apply the contract
to each ordinary Hermes profile as well as the default configuration. A profile
containing the private `librarian-okf` MCP is detected as an isolated worker and
is not broadened. Its request timeout does not use `0` as unlimited, so
Localflame configures 86,400 seconds while leaving idle and lifetime limits
disabled. A stateful one-time migration uses `hermes config` to remove the
`web` disable and Camofox `web_search` exclusion written by the earlier
release. Future runs preserve Hermes's provider choices. Every ordinary profile
receives a small persistent routing skill; the private Librarian worker
receives neither Localflame nor that skill.

### DeepSeek Harness

The complete installed preset roster, profile loader, `dsh-mcp-client`, and
permission model were inspected together. Localflame does not modify a shipped
package. It regenerates every shipped preset under a managed root, removes each
`tool-web` row, adds the official MCP bridge to each, and makes that root the
entire visible roster. Every selected boot profile disables the host web
registry, DeepSeek search, HTTP fetch, and `tool-web`. All seven MCP operations
carry `readOnlyHint`, so the DSH `read-only` permission preset retains the whole
Localflame surface. The finite timeout is DSH's largest safe JavaScript timer.

## Repository ownership

The repositories under `~/Hermes` were audited separately. Only repositories
that own an affected integration are changed:

- `persephone` owns its OMP/gateway integration and still has a duplicate
  in-process Firecrawl adapter. Its Localflame handoff is a separate pending
  commit after the public MCP contract is stable.
- `sandwich` owns the Hermes update wrapper. Reapplying Localflame, Retrieval,
  and Librarian after upstream updates is a separate pending commit; its
  Bun-backed compatibility commands are preserved.
- Firecrawl core/CLI/skills, Camofox, retrieval, librarian, leetcoder, context
  mode, and the remaining model repositories do not own this MCP wiring and are
  intentionally unchanged. Existing dirty worktrees are not touched.

Diogenes owns the runtime catalog and the repeatable `ompsettings.sh` baseline.
Its integration is recorded in that repository rather than copied here.

## Static verification policy

`scripts/doctor.mjs` parses installed files and checks paths, timeouts,
migration markers, routing skills, isolated profiles, the regenerated DSH
roster, strict DSH boot-profile rows, and read-only tool annotations. It does
not start a model, start a harness, connect to the MCP process, or call
Firecrawl. Live Firecrawl and model tests are deliberately outside this pass.
