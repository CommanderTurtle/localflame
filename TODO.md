# localflame implementation ledger

This file is the durable build checklist and audit record. It is intentionally
kept in the repository so update work can resume without relying on chat
history.

## Audited state at the start of the integration pass

The checkboxes below describe delivered, committed, and installed state. Work
that exists only in the local integration tree remains unchecked until its
own repository commit is made and the generated configuration is inspected.

- Localflame's Bun MCP implementation, lossless resource index, installer,
  updater, doctor, server metadata, and documentation exist in the current
  working tree. They have not yet replaced the installed legacy Localflame.
- Retrieval's internal BM25/fuzzy/RRF graph, bundle-aware skill catalog,
  lifecycle cleanup, OMP extension, native harness configuration, and IWE
  removal script exist in its integration tree. The external IWE checkout and
  binary remain installed until that script is committed and run.
- OMP's default, `leetcoder`, and `persephone` profiles carry the normal MCP
  stack. `librarian`, `leetcoder-auditor`, and `retrieval-scout` are isolated
  profiles and must not be broadened by a blanket installer.
- Hermes has six named profiles in addition to the default profile. Its native
  MCP configuration supports per-server tool filters; Camofox can therefore
  retain browsing while only its duplicate `web_search` tool is hidden. The
  private `librarian-okf` profile remains outside blanket web integration.
- Hermes currently exposes Camofox, Retrieval, Librarian, Context Mode,
  Codebase Memory, and LeetCoder. Localflame is not yet registered.
- Librarian already contains the fetched `understory/main` tip. Its current
  `package.json` and `bun.lock` security-version changes are user work and will
  be preserved in the Librarian integration commit.
- Persephone currently registers its own Firecrawl-backed `web_search`. That
  duplicate must be removed in favor of Localflame while retaining its
  Camofox browser adapter and every gateway contract.
- Diogenes currently exposes the Retrieval data through a small Skills Auditor
  window, and Librarian chiefly through its existing service/dream controls.
  Neither is the final operator interface described in section 10.
- Diogenes currently exposes RoboOMP and Persephone as service-oriented
  controls. Their final workspaces described below are not implemented yet.
- Sandwich's Hermes update route updates the upstream harness but does not yet
  rerun the versioned Localflame, Retrieval, or Librarian integration scripts.

## 1. Server core

- [ ] Replace the DSH-private provider with one stdio MCP executable.
- [ ] Normalize a configured Firecrawl endpoint to one `/v2` base URL.
- [ ] Keep self-hosted, zero-auth Firecrawl as the default while supporting an
  optional API key for compatible hosted endpoints.
- [ ] Add `firecrawl_search` with Firecrawl v2 search filters and Markdown
  scraping enabled by default.
- [ ] Add `firecrawl_scrape` with Markdown-first, main-content defaults.
- [ ] Do not impose a client-side timeout or destructively truncate content.
- [ ] Return errors as concise MCP tool errors with Firecrawl status/details.
- [ ] Return both JSON text and `structuredContent` for broad client support.

## 2. Lossless context layer

- [ ] Port the proven `llm` cleanup and 12,000-character section boundaries.
- [ ] Preserve joined sections exactly as the cleaned stored document by
  construction; verify the invariant in source without a live test run.
- [ ] Tag at most two traits per section: `code`, `table`, or
  `html_gibberish`.
- [ ] Index headings, normalized words, exact phrases, source URLs, and image
  references.
- [ ] Expose a compact resource index plus only the first section initially.
- [ ] Add exact section reads, fast resource search, image-reference listing,
  and resource inventory tools.
- [ ] Keep an in-memory bounded LRU; never persist browsing data.

## 3. OMP integration

- [ ] Merge a stdio server into `~/.omp/agent/mcp.json` without replacing
  existing servers.
- [ ] Set the OMP MCP timeout to `0` (its documented no-timeout value).
- [ ] Disable OMP's built-in web search/fetch surfaces so Firecrawl MCP is the
  single web family exposed by this install mode.
- [ ] Update Diogenes's tracked `ompsettings.sh` so its repeatable OMP baseline
  reapplies Localflame through the toolkit's own installer.
- [ ] Verify the adapter against both OMP's JSON schema and loader source.

## 4. Hermes integration

- [ ] Merge the stdio server into `~/.hermes/config.yaml` without replacing
  unrelated settings or MCP servers.
- [ ] Disable only Hermes's built-in `web` toolset; retain MCP toolsets.
- [ ] Use a deliberately generous per-server timeout because Hermes interprets
  zero as immediate expiry rather than unlimited.
- [ ] Verify against Hermes's current configuration docs and implementation.
- [ ] Audit `~/Hermes` start/update/status scripts for a repeatable update path.

## 5. DeepSeek Harness integration

- [ ] Stop modifying shipped DSH packages and presets in place.
- [ ] Generate a managed custom preset from the currently installed Standard
  preset on every configure/update pass.
- [ ] Remove native `tool-web` from that managed copy and add DSH's official MCP
  client row instead.
- [ ] Select the managed preset through the profile patch without disturbing
  unrelated profile rows.
- [ ] Use a generous finite MCP timeout because DSH interprets zero as an
  immediate timeout.
- [ ] Migrate the legacy provider block/package only when it is positively
  identified as localflame-managed.
- [ ] Verify against both the installed MCP bridge and preset/profile loader.

## 6. Operations and documentation

- [ ] Provide one idempotent `install.sh` for `omp`, `hermes`, `dsh`, or `all`.
- [ ] Provide `--dry-run`, timestamped semantic backups, and an `uninstall`
  path that removes only localflame-owned entries.
- [ ] Provide `update.sh` that updates dependencies and regenerates managed
  integration state after client upgrades.
- [ ] Provide a read-only `doctor` that validates executable/config/preset
  wiring without calling Firecrawl or a model.
- [ ] Add example configs plus a complete `SKILL.md` for agents.
- [ ] Rewrite README around the MCP architecture and migration path.
- [ ] Keep AGPL licensing and upstream attribution accurate.

## 7. Live harness integration and update-season audit

- [ ] Inventory the canonical repositories, remotes, branches, dirty state,
  installed versions, launchers, updaters, status checks, and integration
  scripts for `~/Deepseek`, `~/Hermes`, and Diogenes/OMP before changing them.
- [ ] Fast-forward each clean, behind repository through its own intended
  updater; do not hide local changes or replace a project-specific update
  contract with a generic `git pull`.
- [ ] Install localflame into the real OMP, Hermes, and DSH configurations and
  verify that every configured command/path exists.
- [ ] Run the localflame installer/configurator repeatedly and prove the second
  and later passes are semantic no-ops.
- [ ] Audit OMP's volatile config keys against the newest installed schema and
  update Diogenes's one-off OMP configuration script where its tracked baseline
  or localflame wiring is stale.
- [ ] Audit Diogenes launch/service code that consumes OMP or external services;
  trace every affected UI, controller, process, status, persistence, and script
  contract before changing it, then commit the integration on Diogenes's
  existing branch.
- [ ] Audit `~/Hermes` start, stop, status, install, and update entrypoints;
  treat each applicable child repository as an independent project, repair
  missing or stale tracked scripts, and make an independent commit in every
  affected repository.
- [ ] Keep all model-project integration under `~/Hermes`; do not create a
  second model-project tree under `~/Deepseek` or an installation directory.
- [ ] Treat `~/.hermes`, `~/.omp`, and `~/.dsh` strictly as installed runtime
  and configuration targets, while retaining `~/Deepseek/localflame` as the
  one-off source repository for this MCP toolkit.
- [ ] Audit `~/Deepseek`/DSH start, profile, update, and localflame entrypoints;
  make post-upgrade preset regeneration a one-command path.
- [ ] Compare every touched repository with its remote before committing, and
  leave each with a clean, intentional commit on its existing branch.
- [ ] Verify integration state after the update paths are run, without making a
  live Firecrawl request or starting a model.

## 8. Verification ledger

No Firecrawl, model, or integration test run is part of this pass. Each claim
below must instead be checked against at least two independent local sources
or one local source plus official documentation.

| Area | Evidence A | Evidence B | Result |
| --- | --- | --- | --- |
| MCP server API | official TypeScript SDK server docs | installed package types/examples | pending |
| Firecrawl request/response | official v2 API reference | `CommanderTurtle/llm` implementation | pending |
| Section/index behavior | `llm/src/context.js` | static invariant and call-site audit | pending |
| OMP config | installed `mcp-schema.json` | installed MCP loader/config source | pending |
| Hermes config | repository MCP/config docs | installed Hermes config/MCP source | pending |
| DSH config | installed `dsh-mcp-client` | installed profile/preset loader | pending |
| Update resilience | installer source audit | current and prior client config contracts | pending |
| Live OMP/Diogenes | installed schema/config loader | Diogenes scripts and rerun state | pending |
| Live Hermes | current repo docs/source | real launcher/updater/config state | pending |
| Live DSH | installed packages/presets | real profile and regenerated preset | pending |
| Repository contents | unit/static checks | `git diff --check` and tracked-file audit | pending |

## 9. Retrieval, skill lifecycle, and Librarian integration

- [ ] Remove IWE as a checkout, executable, Cargo install, configuration value,
  and runtime dependency. Port only the required fuzzy/BM25 ranking and graph
  walking behavior directly into Retrieval's Python package, with attribution.
- [ ] Make the internal catalog expose a stable structured browse/tree result
  for human interfaces as well as its model-facing search/read flow.
- [ ] Preserve lossless source metadata while merging duplicate skills by
  canonical path and normalized identity during each catalog synchronization.
- [ ] Install Retrieval's routing skill for both Hermes and OMP, including
  already-existing Hermes profiles, so the agent-facing catalog describes
  `retrieve_skill` and the parallel read-only scout before a call is needed.
- [ ] Add an idempotent session-close operation that synchronizes the catalog
  and removes only manifest-owned projections for the closing harness.
- [ ] Attach that operation to current Hermes and OMP session lifecycle hooks,
  then audit installed skill trees against each upstream baseline so retrieved
  skills do not permanently pollute either harness.
- [ ] Route supported OMP/Hermes configuration changes through their native
  `config` commands and use their documented MCP configuration boundary where
  no non-interactive command exists.
- [ ] Replace Diogenes's flat skill-file audit source with Retrieval's structured
  catalog API and add a source/category/skill graph browser to the existing
  operator window; retain edit actions only for canonical editable files.
- [ ] Verify Retrieval and Librarian appear in both Hermes's native MCP listing
  and OMP's native `/mcp` configuration source without starting either server.
- [ ] Confirm Librarian contains the fetched `understory/main` tip before adding
  any integration commit; preserve its existing dependency updates.
- [ ] Give Librarian the same repeatable dual-harness skill and registration
  behavior without changing its deterministic OKF or agent-loop contracts.

## 10. Diogenes-native operator interfaces

These interfaces belong in Diogenes. Retrieval, Librarian, Persephone, and
RoboOMP remain independent CLI/MCP backends with no second standalone web UI
added by this work. Diogenes should invoke their versioned commands or
documented local APIs and should not duplicate their storage or agent loops.

### 10.1 Shared interface contract

- [ ] Reuse the compact interaction language proven in the static `llm`
  project where it fits: resizable panes, searchable lists, expandable rich
  Markdown, copy actions, visible JSON details, deterministic status, and
  responsive/mobile layouts.
- [ ] Keep backend calls demand-driven. Opening an interface may load an index;
  expensive searches, graph walks, queries, mutations, and exports run only
  after the corresponding user action.
- [ ] Give every mutation a preview/plan result, explicit confirmation, visible
  command/API provenance, terminal status, and an error state that retains its
  output.
- [ ] Persist only Diogenes window/layout preferences. Backend-owned data stays
  in Retrieval, Librarian, Persephone, OMP, or RoboOMP.
- [ ] Trace every new control through HTML, JavaScript, route model, Python
  controller, runtime job/status persistence, service descriptor, diagnostics,
  and the owning repository's command/API before committing Diogenes.
- [ ] Verify each action against both the backend CLI/API implementation and
  the Diogenes route/controller call site without starting a model or making a
  live Firecrawl request.

### 10.2 Retrieval workspace

- [ ] Replace the flat Skills Auditor result list with a full Retrieval
  workspace backed by `retrieval catalog browse --json` and the structured
  source/category/skill graph.
- [ ] Provide source, category, package, duplicate-group, and skill views with
  counts, provenance, digest, active/cold state, canonical path, and last-index
  information.
- [ ] Provide instant fuzzy/exact search, tag/category/source filters, graph and
  tree navigation, rich `SKILL.md` preview, and a raw JSON inspector.
- [ ] Make byte-identical duplicate merges visible as one package with all
  source locations. Preserve same-name packages whose bundle digests differ.
- [ ] Surface one-turn retrieval, read-only scout, projection, synchronize,
  and session-close actions through Retrieval's CLI rather than filesystem
  grepping.
- [ ] Show which Hermes and OMP profiles have the routing skill and Retrieval
  MCP, which projections are manifest-owned, and what a cleanup run would
  remove.
- [ ] Retain edit/delete actions only when Retrieval reports a canonical,
  editable source. Cold indexes and upstream/baseline packages remain read-only.

### 10.3 Librarian workspace

- [ ] Replace the thin dream-oriented surface with a complete knowledge
  workspace backed by Librarian's public `memory_*` MCP and existing local HTTP
  API where applicable.
- [ ] Provide OKF tree, concept/document reader, full-text query, relationship
  graph, trace history, cache/hot-set status, and raw bundle metadata views.
- [ ] Provide guided add, update, maintain, import, and export flows that retain
  required frontmatter and show exact file diffs before approval.
- [ ] Keep dream proposal, apply, reject, and rollback controls, but integrate
  them into the same document/diff/history interface rather than making dreams
  the primary identity of the workspace.
- [ ] Show selected delegated backend/profile, public-versus-private MCP
  boundary, worker state, query timing, and errors without exposing the private
  `librarian-okf` tools to an interactive profile.
- [ ] Preserve Librarian's deterministic bundle writer, human approval rules,
  compensation behavior, query cache, and ephemeral delegated sessions.

### 10.4 Persephone workspace and integration contract

- [ ] Audit Persephone separately as a gateway project; do not treat it as a
  small addendum to Localflame or the Retrieval/Librarian interfaces.
- [ ] Replace its duplicate in-process Firecrawl search adapter with the
  versioned Localflame MCP while retaining the Camofox browser adapter.
- [ ] Add a Diogenes setup flow comparable in completeness to
  `hermes setup gateway`: Signal, Discord, and Slack steps; exact provider-side
  settings; copy-ready values; allowlists; secrets/environment targets; and
  validation state.
- [ ] Expose gateway lifecycle, connector health, logs, routes, sessions,
  schedules, approvals, queued messages, retry state, and worker/profile state
  through Persephone's existing CLI/control API.
- [ ] Ensure Persephone can operate from its own OMP RPC service contract and
  does not depend on the Hermes TUI or Hermes gateway being active.
- [ ] Give install, integrate, doctor, update, restart-if-active, and uninstall
  one idempotent script path each; all Diogenes buttons call those paths.
- [ ] Compare connector generation and validation with Hermes's current native
  gateway setup implementation and help output, then document intentional
  differences rather than guessing configuration values.

### 10.5 RoboOMP Git workspace

- [ ] Treat RoboOMP as an OMP-owned Git automation backend and expose it only
  through Diogenes, connected to the existing `~/.omp` installation and its
  native service/CLI contracts.
- [ ] Build a repository-first interface with repository, branch, issue, pull
  request, worktree, run queue, session, proposal, review, log, and artifact
  views comparable in breadth to a dedicated Git desktop interface.
- [ ] Provide explicit connect/configure, build, start/stop, doctor, triage,
  review, scheduled proposal, and handoff actions without creating another Git
  agent implementation.
- [ ] Show permission/proxy status, webhook health, isolation paths, current
  OMP profile/model role, pending approvals, and exact command/output for each
  operation.
- [ ] Preserve the existing credential proxy, webhook verification, SQLite
  queue, isolated issue worktrees, and proposal-only scheduled audit behavior.

## 11. Cross-repository delivery order

- [ ] Commit and statically verify Localflame first so every downstream script
  points at a stable executable and metadata contract.
- [ ] Commit Retrieval next, run its IWE removal and clean-baseline lifecycle
  scripts, then verify its catalog/tree output and installed routing skill in
  both harness families.
- [ ] Commit Librarian's dual-harness integration while preserving its existing
  dependency changes and isolated worker profiles.
- [ ] Commit Persephone's Localflame handoff and repeatable integration changes
  before adding or revising its Diogenes workspace.
- [ ] Commit Sandwich update orchestration without changing its Bun-backed
  `node`, `npm`, `npx`, `pnpm`, or `yarn` compatibility behavior.
- [ ] Commit Diogenes only after all backend commands and runtime/service/UI
  contracts above have stable, independently committed sources.
- [ ] Run each owning repository's update/integrate script twice, compare
  semantic state after both runs, and run each read-only doctor.
- [ ] Confirm `hermes mcp list`, all intended Hermes profile configs, OMP's
  intended normal profile configs, and DSH's regenerated managed preset contain
  the expected entries while isolated profiles remain isolated.
- [ ] Restart the Hermes gateway through its native command after configuration
  convergence, without starting a model or issuing a Firecrawl request.
