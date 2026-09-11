# localflame implementation ledger

This file is the durable build checklist and audit record. It is intentionally
kept in the repository so update work can resume without relying on chat
history.

## Current execution state (2026-09-11)

The checkboxes in this file describe real repository and installed state. A
checked item has source, a commit where required, and static verification. Work
that exists only in a staging tree remains unchecked until it is committed and
its generated configuration has been inspected. No Firecrawl request or model
generation is part of this pass.

### Completed and installed

- [x] Localflame is committed in `~/Deepseek/localflame` at `211fda7`. Its Bun
  MCP exposes `firecrawl_search`, `firecrawl_scrape`, `firecrawl_read`,
  `firecrawl_find`, `firecrawl_outline`, `firecrawl_images`, and
  `firecrawl_resources`.
- [x] The Localflame installer completed twice. The second pass was
  semantically idempotent and the static doctor reported 80/80 checks after
  the DSH-only provider policy and ordinary-profile provider preservation were
  installed.
- [x] Retrieval is committed in `~/Hermes/retrieval` at `1b055be`. IWE's
  ranking behavior is internal, its external checkout and binaries are gone,
  the schema-5 catalog is isolated from older running processes, and its
  structured catalog currently reports 1,000 entries, 3,405 graph nodes,
  15,132 graph edges, 30 roots, and 15 byte-identical duplicate exclusions.
- [x] Retrieval's setup completed twice. The first pass consolidated 522 Hermes
  package occurrences and removed 521 redundant installed copies; the second
  pass consolidated and removed zero. The durable copies remain under
  `~/Hermes/skill-library`.
- [x] The Hermes gateway was restarted once after the first Localflame and
  Retrieval integration. A final restart remains required after all routing
  skills and backends converge.
- [x] Librarian's public/private integration is committed in
  `~/Hermes/librarian` at `84f5e0e`; its Bun build succeeded and the exact
  committed integration entrypoint completed twice. It registered the five
  public tools in six ordinary Hermes profiles and three ordinary OMP profiles
  while leaving the selected private worker with only `librarian-okf`.
- [x] Persephone's Firecrawl handoff is committed in `~/Hermes/persephone` at
  `52362d0`. Its direct `web_search` implementation was removed, its existing
  Camofox browser adapter was retained, and its integration now delegates
  Firecrawl registration to Localflame's checked-in installer. Static checks,
  nine unit tests, two integration passes, and the configuration-only doctor
  all completed without making a Firecrawl or model request.

### Current source and configuration facts

- OMP's ordinary profiles are default, `leetcoder`, and `persephone`.
  `librarian`, `leetcoder-auditor`, and `retrieval-scout` are isolated and must
  not receive blanket web, Retrieval, or Librarian capabilities.
- Hermes's ordinary profiles are default, `advisor`, `builder`, `orchestrator`,
  `researcher`, and `reviewer`. The `librarian` profile is a private delegated
  worker and must expose only `librarian-okf`.
- DSH currently has one boot profile, `web`. Its `read-only` choice is a
  permission preset inside that profile, not a second profile directory.
  Localflame's seven MCP operations are all read-only and must remain available
  under that permission preset.
- Librarian contains the fetched `understory/main` tip. The pre-existing
  `package.json` and `bun.lock` security overrides were preserved in its
  integration commit rather than reverted.
- Native source and command output classify Camofox, Localflame, Context Mode,
  Retrieval, Librarian, and Leetcoder as MCP servers. Context Mode also owns
  its Hermes Python hook bridge; Retrieval owns its session-close hook.
  Persephone remains a gateway/network process backed by OMP RPC rather than
  being reclassified as an MCP server.
- Diogenes still exposes Retrieval as a flat Skills Auditor and Librarian,
  Persephone, and RoboOMP mainly as service controls. The richer Diogenes-only
  workspaces in section 10 remain pending.
- Sandwich's Bun-backed `node`, `npm`, `npx`, `pnpm`, and `yarn` shims are
  intact; `npx` resolves to `bun x --bun`. Its Hermes updater still needs a
  post-update reconciliation path for the independently committed Localflame,
  Retrieval, Librarian, and Persephone integrations.

### Superseding web-provider policy

- [x] Add a checked-in DSH destroy/rebuild entrypoint. It must regenerate a
  strict preset root from the currently installed DSH presets, remove every
  native `tool-web` row, disable all host search/fetch providers in every DSH
  boot profile, and expose only Localflame's seven Firecrawl tools. It must not
  edit shipped packages in place.
- [x] Make the strict DSH preset root the complete visible roster so switching
  Standard/PTC/Cordis/Minimal cannot restore DeepSeek search. Regenerate it on
  every install/update and retain an uninstall path back to the shipped roster.
- [x] Verify DSH `read-only` retains the entire Localflame MCP surface while
  filesystem and shell permissions remain read-only.
- [x] Reverse the earlier Localflame-owned OMP settings change by resetting
  `web_search.enabled` and `fetch.enabled` through `omp config`; future
  Localflame runs must preserve OMP's existing web providers.
- [x] Reverse the earlier Localflame-owned Hermes change by removing the added
  `web` disable and Camofox `web_search` exclusion through Hermes's native
  configuration command; future runs must preserve Hermes's web providers.
- [x] Record that migration in Localflame-owned state so later reruns never
  overwrite a user's deliberate provider choices.

### Persistent routing skills

- [x] Keep exactly three small first-party routing skills beside each ordinary
  Hermes/OMP baseline: `retrieve-knowledge`, `localflame`, and `librarian`.
- [x] Localflame's router must make Firecrawl search/scrape the strongly
  preferred indexed web path while acknowledging that Hermes and OMP retain
  their other providers.
- [x] Librarian's router must advertise the five public `memory_*` tools and
  never expose the private `librarian-okf` operations.
- [x] Retrieval's session-close cleanup must preserve those exact managed
  router paths, consolidate every other non-stock skill, and keep all three out
  of the private Librarian and read-only scout/auditor profiles.
- [x] Run each owning installer twice after these changes and verify router
  presence in the filesystem, MCP presence in native config output, and
  private-profile absence from a second independent source.

## Verbatim steering record

This appendix is copied from the task transcript rather than reconstructed from
memory. Ordinals are the local transcript records. Keep this section intact
when summarizing the work.

<details><summary>200417 — Initial Localflame/MCP and integration request</summary>

`````text
I noticed that omp & deepseek both fail to have firecrawl scrape and search set as defaults. I tried making a small repo \~/Deepseek/localflame that tries its hardest to completely set in stone firecrawl as the only web tool available. Solely. But I don't think it works perfect. Hermes likewise has hermes commands that choose the web backends, and allows firecrawl for search but camofox for the browsing, with no way (i think) to expose firecrawl as a separate thing. Thuswise what I want to do is actually canonicalize the standard via MCP. Zero frills, and it will be basically what is used to make use of everything all-in-all. Remember our 'llm' javascript project?

What I wouldn't mind is taking from the standards used and basically designing our own lightweight MCP toolkit around it, and replacing localflame's ideology with that. Something that doesn't have to be its own standalone plugin, rather, a full fledged toolkit that compacts and jsonizes firecrawl outputs. Thus models can search through the tags, everything, basically the same way we have 'llm' set up. We can also standardize the SKILL.md standard for said repo. It would be very neat if all that JS wizardry happening on the backend could become a CLI standardized MCP toolkit that models could reach, but also that omp/hermes/Deepseek namely all can use it. Check all of them. No tests needed (at all) because I know we can 100% do it by inferring from the layout of our llm repo. You can also temporarily clone it beside it in the Deepseek folder (git clone for CommanderTurtle/llm) if there is a way to improve it.

As well, due to recent patches in omp, I notice that a lot of things likewise change (especially for the way we typically patched it with our omp-config setup that's available within Diogenes)

Set up a deep todo of things to do, and thoroughly take your time. There is no rush, at all, and I want things done the *right* way. So feel free to actually take forever on anything you need, fully researching, cross referencing, and actually spending time and depth throughout these tasks. If you want, at that rate, you can do some verification of \~/Hermes and actually verify things are working as intended. Intentional starts. Integration scripts that always work. Diogenes contracts. Existence of easy update scripts that just "do everything" with zero knowledge. Etcetera. Instead of me consistently spending time when "update season" comes and sandwich's checkExpr just blitzes through a whole directory and updates tons of things. Lol. So yeah, take a deep breath because this is a long project with no time limit, and things must always be verified in at least two or more places - zero rush needed.
`````

</details>

<details><summary>200749 — Large exported JSON handling</summary>

`````text
Yeah, lmao. Last time I handed the raw json output from an 'llm' conversation to Hermes and said "lol just beware of the size, don't grep the whole thing into context history, it's 100MB"(sic) it basically handled it with 'import json' and a ton of python wizardry I didn't quite understand. It was godly at handling that raw json
`````

</details>

<details><summary>200858 — Integration means executing repeatable integration paths</summary>

`````text
And believe me, when I said handling the verifications of integration, I also meant—integrating. With the very same integration handlers. Each individual folder on all accords should not just be integrated, they should be verified for existence of all the existing scripts. If differing from remote, they should be committed. If not updated as the (new or existing) update script performs, that should be run too. As well, everything should be spammable. Including Diogenes' usage of said scripts where applicable. Its UI uses a lot of those accords. As well, speaking on behalf of the omp-config script that exists as well. Omp frequently updates. It frequently implements breaking changes. As does Hermes. As does Deepseek. They're all highly volatile harnesses. JSYK (note)
`````

</details>

<details><summary>200910 — Initial request remains the scope</summary>

`````text
No. I explicitly was referring to the initial prompt. Which I hope you did not forget
`````

</details>

<details><summary>200924 — Verbatim restatement of the initial request</summary>

`````text
```vbnet
I noticed that omp & deepseek both fail to have firecrawl scrape and search set as defaults. I tried making a small repo \~/Deepseek/localflame that tries its hardest to completely set in stone firecrawl as the only web tool available. Solely. But I don't think it works perfect. Hermes likewise has hermes commands that choose the web backends, and allows firecrawl for search but camofox for the browsing, with no way (i think) to expose firecrawl as a separate thing. Thuswise what I want to do is actually canonicalize the standard via MCP. Zero frills, and it will be basically what is used to make use of everything all-in-all. Remember our 'llm' javascript project?

What I wouldn't mind is taking from the standards used and basically designing our own lightweight MCP toolkit around it, and replacing localflame's ideology with that. Something that doesn't have to be its own standalone plugin, rather, a full fledged toolkit that compacts and jsonizes firecrawl outputs. Thus models can search through the tags, everything, basically the same way we have 'llm' set up. We can also standardize the SKILL.md standard for said repo. It would be very neat if all that JS wizardry happening on the backend could become a CLI standardized MCP toolkit that models could reach, but also that omp/hermes/Deepseek namely all can use it. Check all of them. No tests needed (at all) because I know we can 100% do it by inferring from the layout of our llm repo. You can also temporarily clone it beside it in the Deepseek folder (git clone for CommanderTurtle/llm) if there is a way to improve it.

As well, due to recent patches in omp, I notice that a lot of things likewise change (especially for the way we typically patched it with our omp-config setup that's available within Diogenes)

Set up a deep todo of things to do, and thoroughly take your time. There is no rush, at all, and I want things done the *right* way. So feel free to actually take forever on anything you need, fully researching, cross referencing, and actually spending time and depth throughout these tasks. If you want, at that rate, you can do some verification of \~/Hermes and actually verify things are working as intended. Intentional starts. Integration scripts that always work. Diogenes contracts. Existence of easy update scripts that just "do everything" with zero knowledge. Etcetera. Instead of me consistently spending time when "update season" comes and sandwich's checkExpr just blitzes through a whole directory and updates tons of things. Lol. So yeah, take a deep breath because this is a long project with no time limit, and things must always be verified in at least two or more places - zero rush needed.
```
`````

</details>

<details><summary>200980 — Repository and install ownership</summary>

`````text
Yep. So I'd likewise expect commits in nearly every item in \~/Hermes that applies. Each has their own history and background. It's the project dir. \~/Deepseek is a one-off where I initially built localflame. All model things belong solely in said \~/Hermes folder and existing nowhere else on disk. \~/.hermes is the only hermes install. \~/.omp and \~/.dsh exist, too.
`````

</details>

<details><summary>201025 — Diogenes commit and ompconfig contract</summary>

`````text
And so I'd expect a commit on \~/Odysseus/Diogenes too solely after verifying every single UI contract that exists. Specifically naming the changes we'd also be making to the ompconfig script, which is also a one-off.
`````

</details>

<details><summary>201233 — Sandwich npx behavior</summary>

`````text
Once again, literally sandwich silently replaces npx. 
`````

</details>

<details><summary>201235 — Sandwich npx is Bun</summary>

`````text
Don't know how you'd not remember this. npx exists. It's bun.
`````

</details>

<details><summary>201609 — Native harness commands, Retrieval, IWE, and Librarian</summary>

`````text
Also noted, hermes, omp, and deepseek, all have their own native shell commands for configuring. They all return `--help` when asked. Thuswise, it's important to make use of their shells' existence. Like. Camofox's mcp as well as context-mode usually use the direct integration paths through their own respective native commands in each harness. Zero issues usually. `hermes mcp --help` is literally a thing. As well, there's settings commands, etcetera etcetera. I don't believe retreival is working as intended, because once I asked hermes something about it, and it was completely unaware of the existence of being able to call a parallel session to do a particular thing. Zero header passed to the agent via skill that tells it that there is anything like "search through skills" Which is crazy. It should be using iwe's technology for this. And iwe should only exist inside retreival. There is no such thing as indepenedent IWE's existence on the machine. Same deal goes for librarian. They should "just work". And both show up in both native shells (omp and hermes).

Likewise, librarian is undercommitted from the fork that it is. The fork
`````

</details>

<details><summary>201622 — Librarian must sync to Understory</summary>

`````text
's latest commit should be syncing to understory
`````

</details>

<details><summary>201896 — Retrieval-backed Diogenes interface; no external IWE</summary>

`````text
Yeah lol. Even diogenes' skill auditor just has a plaintext grepping of skills. Like. Zero usage for retreival. Zero visibility via unique gui that actually allows walking the IWE visually. Again, IWE does not and should not exist on the machine. What was needed from it was forked directly into retrieval. And integrated directly within.
`````

</details>

<details><summary>202018 — Clean skill baselines and session-close indexing</summary>

`````text
And the problem at hand was the fact that hermes is so polluted with skills, that it actually isn't a clean baseline from checkout. Things should undergo duplicate merges, and then furthermore always be indexed upon every session close. With the only thing existing is hermes basically seeing via it's native skill "hey yo, search for skills btw" and they should all just pull instantly with zero frills based on what it wants. In a single turn. That's the whole scheme. Every session close does the same clearing after indexing. Leaving only hermes at clean install's baseline. Leaving only omp at clean install's baseline (from upstream).
`````

</details>

<details><summary>202805 — Localflame registration, DSH exclusivity, scripted operations</summary>

`````text
Is the firecrawl mcp integrated with hermes yet? You can run hermes gateway restart once it is. `hermes mcp --list` will show you if it works. I'd also be sure to check `hermes setup --help` for further help if you run into noticing things like "what web tools even exist???" cause yeah. Camofox is currently the web browser for it, and meanwhile firecrawl is the search backend that should be preserved. Our firecrawl mcp should follow standards like the third party camofox-mcp does, which I do believe it exists inside \~/Hermes (project folder), which also has contracts with Diogenes. We can follow a similar robustness layout as camofox mcp. And yeah, make sure both harnesses use it. Firecrawl's mcp should still preserve the nameschema "localflame" and as well, it should be the only web tool available in Deepseek. Any action or thing you take should be a script that can be run by any user, robustly and easily. Zero knowlege needed available. So, instead of configuring, always perform the programmable route. Then run the programmable. Rather than just doing something that isn't repeatable
`````

</details>

<details><summary>202930 — Scripts perform mutations; audit duplicate and stale state</summary>

`````text
Again, you won't technically be "doing" anything. The script(s) will be "doing". Meanwhile, you're writing programmable routes to do said things. I need not repeat the initial prompt, because I'm sure you're aware what you're doing auditing all these repos at once and the repeatable update/integrate contracts they have within Diogenes, as well as making sure they're natively available as independent scripts in said directories. A full auditing of making sure no duplicates or stales exist. Again, one by one you'd take your time. Absolutely zero rushing on any particular thing. And every change or modification verified in at least 2 or more places.
`````

</details>

<details><summary>203275 — Diogenes-only rich Retrieval, Librarian, Persephone, and RoboOMP workspaces</summary>

`````text
A total rewrite for beautification of the "library" a total rewrite of beautification for the "retrieval" interfaces. The standalone interfaces can totally 100% follow "llm" 's standalone js webui contracts where applicable, since it preserves a great starting point for realizing standalone static webuis that actually do real things. Especially with the fact that both are json rpc mechanisms for hermes, they both should be really complex, beautiful webuis available in diogenes, not standalone runnable things tbh. Could be a worthwhile thing. I believe librarians' is ultra limited right now to being a really barebones dreaming interface that was never quite uses. and yet, it's an mcp. Same deal goes for retreival, which as of the last remote Diogenes commit, was just a small Skills Auditor static popup that legit showed plaintext searchable results with no options. Since they're fully fledged CLI mcps, the webui's in diogenes should just be interacting with said things. And as well, the librarian mcp is just sorta rather bloat. I do believe persephone should deserve improvements from how hermes natively works, cause it's like missing all the things you'd imagine are important. Like hermes' TUI simply will not work without the gateway up. Meanwhile persephone really feels like it's own rediculous standalone. As well, has no explicit control similarly like Hermes does auto-generating entirely complex discord/slack/signal configs with "all the right settings" for the user (like when running `hermes setup gateway` in terminal, which provides entire copy-pastables to said connectors). So yeah, persephone will be a project in itself, as well as figuring out how fully fledged the webui is for roboomp, which should literally be confined solely to connection with the \~/.omp install, as well as being its own webui being available directly from Diogenes that basically, at that point, looks like an identical git webUI "ai connected" like as fully fledged as MyAppDesk/gitcito's GIT webui. And this is the standard set. Again, this should be a diogenes webui only, solely interacting with the CLI backend that exists. And, again, probably deserving a commit. Update the TODO with what actually exists, and what *actually* was performed so far, as we likely still have *a lot* ahead of us, and I wanted specifically to make sure this TODO was deatailed, and actually preserved compaction with great depth and bredth
`````

</details>

<details><summary>204258 — DSH-only web destruction; preserve Hermes/OMP providers and routing skills</summary>

`````text
Noted that with DSH it should have it's own destroy script which destroys the paths for any web tools available except solely the localflame scrape and search tools. Lol. Because there should be no situation where deepseek's search is used. I.e. disable all profile's searching abilities. Make sure also that read-only profile has total access to localflame and everything it entails. Again, specifically for deepseek. Hermes should still preserve its web providers, as should pi (which btw is configured via our omp-config post auditing), and there should be utmost prioritization of localflames' existence being acknowleged. Same deal I suppose for librarian/retrieval (since we're working on that) the Skills should persist in such a way that any open session knows explicitly it can call said mcps.
`````

</details>

<details><summary>204423 — Durable checkbox TODO requirement</summary>

`````text
I do still hope you're maintaining a consistent todo. Because instead of a checkbox-able todo list, I just see one goal. Because I made sure I wanted these prompts to persist. Every steer in this conversation is important. Every one. Notice, the last steer I made was specifically ending with:

Update the TODO with what actually exists, and what *actually* was performed so far, as we likely still have *a lot* ahead of us, and I wanted specifically to make sure this TODO was deatailed, and actually preserved compaction with great depth and bredth  
`````

</details>

<details><summary>204484 — Verbatim steering and checklist verification requirement</summary>

`````text
Well it should actually include verbatim everything I mentioned in steers as well, including the persephone stuff, the update contract stuff, the "you're not doing, you're making durable programmable routes for doing, then executing said things" stuff. Grep out all the prompts from the steers, and then verify they exist against the durable todo
`````

</details>

<details><summary>205375 — Hermes hook/tool/MCP contracts and Diogenes backend classification</summary>

`````text
Don't forget, hermes being reliant on hooks, usually it does take a decent look at the actual `hermes tools --help` and `hermes mcp --help` standards, because prior when activating context mode I had to enable hooks and tools likewise that mattered. Probably indepodent for camofox's mcp, context-mode's mcp, and any other mcps we might need. I'd presume actually that leetcoder/librarian/retreival all are actually mcps, but I might be wrong. Since they do in fact call out to specific json rpc backends and yet—are in fact callable's. mcp would indeed make sense. As well, would probably make it easier when designing the webuis for all of them lol. Persephone on the other hand is indeed a native networking thing. So like. Shouldn't be hard there making the gitcito styled allinone webui once we get to the diogenes part.
`````

</details>

### Steering-to-checklist verification

| Transcript steer | Durable coverage | State |
| --- | --- | --- |
| 200417 / 200924 | Sections 1-8 and 11: Localflame MCP, llm-style indexing, all three harnesses, deep audit, no live requests, two-source verification | Backend committed; cross-repo audit active |
| 200749 | Sections 2 and 10.2: bounded indexed JSON/resource handling rather than whole-file prompt injection | Backend complete; Diogenes UI pending |
| 200858 | Sections 6, 7, and 11: inspect, repair, run, rerun, and commit each repository's native integration/update scripts | Active |
| 200910 | This record plus sections 1-11 retain the initial request as the governing scope | Recorded |
| 200980 | Current-state ownership plus section 7: model projects under ~/Hermes; Localflame alone under ~/Deepseek; installed homes remain config targets | Recorded and observed |
| 201025 | Sections 3, 7, 10, and 11: Diogenes and one-off ompconfig only after every UI/backend contract is traced | Pending by design |
| 201233 / 201235 | Sections 7 and 11: preserve Sandwich's Bun-backed npx and all compatibility shims | Recorded; no shim change made |
| 201609 / 201622 | Sections 4, 7, and 9: native CLIs, internalized IWE ranking, one-turn Retrieval, Librarian in both harnesses, Understory sync | Retrieval and Librarian backends complete; Diogenes interfaces pending |
| 201896 | Sections 9 and 10.2: no external IWE; replace flat Diogenes grep with graph/tree Retrieval UI | Backend complete; UI pending |
| 202018 | Section 9: session-close deduplication/indexing and clean upstream skill baselines | Complete; expanding exact router allowlist |
| 202805 | Sections 3-6 and 11: Localflame name, both harnesses, DSH exclusivity, native listing, gateway restart, zero-knowledge scripts | First pass complete; strict DSH revision active |
| 202930 | Sections 6, 7, 10.1, and 11: scripts make mutations, are independently runnable and repeatable, remove stale/duplicate state, and receive two-source verification | Active |
| 203275 | Section 10: rich Diogenes-only Retrieval/Librarian/Persephone/RoboOMP workspaces using their CLI/MCP backends | Fully enumerated; pending |
| 204258 | Superseding web-provider policy and Persistent routing skills above | Active |
| 204423 / 204484 | Current execution state, this verbatim record, and this mapping | Complete and maintained from the local transcript |
| 205375 | Sections 4, 7, 9, and 10: audit Hermes hook/tool/MCP standards, classify callable backends from source, and keep Persephone on its gateway/network contract | Native help, config, and source classification complete; Diogenes interfaces pending |

### Exact transcript audit

- [x] Read the task JSONL directly and selected the 20 user-message records
  by transcript ordinal rather than reconstructing them from memory.
- [x] Found 20 expected transcript records, 20 fenced verbatim TODO bodies,
  and 20 exact body matches after normalizing only CRLF/LF line endings.
- [x] Found no missing record, extra record, or mismatched body.
- [x] Mapped every recorded steer to one or more executable checklist sections
  in the table above; the verbatim blocks remain the authority if a summary
  ever becomes ambiguous.

The 2026-09-11 audit fingerprints are the first 12 hexadecimal characters of
SHA-256 over each normalized transcript body:

| Ordinal | SHA-256/12 | Ordinal | SHA-256/12 |
| --- | --- | --- | --- |
| 200417 | `dde207d64237` | 200749 | `05508b2b63ab` |
| 200858 | `2c4ec8ed4658` | 200910 | `5a2dae1a88e0` |
| 200924 | `b43aaca856d8` | 200980 | `76efcbc5524a` |
| 201025 | `58184a88be1b` | 201233 | `86084777dcee` |
| 201235 | `31f4b3776f09` | 201609 | `0d89c14c2686` |
| 201622 | `bdaadad9754b` | 201896 | `80ff9790aff9` |
| 202018 | `49ac8f2d93f7` | 202805 | `674e3c0a8af6` |
| 202930 | `9e357874fa3f` | 203275 | `d0fc7afd44ac` |
| 204258 | `917ec30aef20` | 204423 | `c43a78e6d067` |
| 204484 | `ed5542f306c3` | 205375 | `169b9282bfda` |

## 1. Server core

- [x] Replace the DSH-private provider with one stdio MCP executable.
- [x] Normalize a configured Firecrawl endpoint to one `/v2` base URL.
- [x] Keep self-hosted, zero-auth Firecrawl as the default while supporting an
  optional API key for compatible hosted endpoints.
- [x] Add `firecrawl_search` with Firecrawl v2 search filters and Markdown
  scraping enabled by default.
- [x] Add `firecrawl_scrape` with Markdown-first, main-content defaults.
- [x] Do not impose a client-side timeout or destructively truncate content.
- [x] Return errors as concise MCP tool errors with Firecrawl status/details.
- [x] Return both JSON text and `structuredContent` for broad client support.

## 2. Lossless context layer

- [x] Port the proven `llm` cleanup and 12,000-character section boundaries.
- [x] Preserve joined sections exactly as the cleaned stored document by
  construction; verify the invariant in source without a live test run.
- [x] Tag at most two traits per section: `code`, `table`, or
  `html_gibberish`.
- [x] Index headings, normalized words, exact phrases, source URLs, and image
  references.
- [x] Expose a compact resource index plus only the first section initially.
- [x] Add exact section reads, fast resource search, image-reference listing,
  and resource inventory tools.
- [x] Keep an in-memory bounded LRU; never persist browsing data.

## 3. OMP integration

- [x] Merge a stdio server into `~/.omp/agent/mcp.json` without replacing
  existing servers.
- [x] Set the OMP MCP timeout to `0` (its documented no-timeout value).
- [x] Preserve OMP's built-in web search/fetch settings. Remove the obsolete
  Localflame policy that disabled them and perform the one-time repair through
  the checked-in migration described above.
- [ ] Update Diogenes's tracked `ompsettings.sh` so its repeatable OMP baseline
  reapplies Localflame through the toolkit's own installer.
- [x] Verify the adapter against both OMP's JSON schema and loader source.

## 4. Hermes integration

- [x] Merge the stdio server into `~/.hermes/config.yaml` without replacing
  unrelated settings or MCP servers.
- [x] Preserve Hermes's built-in `web` toolset and every configured provider;
  remove the obsolete disable/filter migration described above.
- [x] Use a deliberately generous per-server timeout because Hermes interprets
  zero as immediate expiry rather than unlimited.
- [x] Verify against Hermes's current configuration docs and implementation.
- [x] Read and record the installed `hermes tools --help` and
  `hermes mcp --help` contracts, then verify each required hook, toolset, and
  MCP registration against both native command output and installed config.
- [x] Use Camofox and Context Mode as concrete integration precedents; classify
  Leetcoder, Librarian, and Retrieval from their source and native callable
  transport rather than assuming that every JSON-RPC service is registered the
  same way.
- [ ] Audit `~/Hermes` start/update/status scripts for a repeatable update path.

## 5. DeepSeek Harness integration

- [x] Stop modifying shipped DSH packages and presets in place.
- [x] Generate a strict managed roster from every currently installed DSH
  preset on every configure/update pass.
- [x] Remove native `tool-web` from every managed copy, add DSH's official MCP
  client row to each, and hide the unsanitized shipped/user roots.
- [x] Apply the managed roster and host web-provider disables to every DSH boot
  profile without disturbing unrelated profile rows.
- [x] Use a generous finite MCP timeout because DSH interprets zero as an
  immediate timeout.
- [x] Migrate the legacy provider block/package only when it is positively
  identified as localflame-managed.
- [x] Verify the first managed-preset design against both the installed MCP
  bridge and preset/profile loader; repeat after the strict-roster revision.

## 6. Operations and documentation

- [x] Provide one idempotent `install.sh` for `omp`, `hermes`, `dsh`, or `all`.
- [x] Provide `--dry-run`, timestamped semantic backups, and an `uninstall`
  path that removes only localflame-owned entries.
- [x] Provide `update.sh` that updates dependencies and regenerates managed
  integration state after client upgrades.
- [x] Provide a read-only `doctor` that validates executable/config/preset
  wiring without calling Firecrawl or a model.
- [x] Add example configs plus a complete `SKILL.md` for agents.
- [x] Rewrite README around the MCP architecture and migration path.
- [x] Keep AGPL licensing and upstream attribution accurate.

## 7. Live harness integration and update-season audit

- [x] Inventory the canonical repositories, remotes, branches, dirty state,
  installed versions, launchers, updaters, status checks, and integration
  scripts for `~/Deepseek`, `~/Hermes`, and Diogenes/OMP before changing them.
- [ ] Fast-forward each clean, behind repository through its own intended
  updater; do not hide local changes or replace a project-specific update
  contract with a generic `git pull`.
- [x] Install the first Localflame policy into the real OMP, Hermes, and DSH
  configurations and
  verify that every configured command/path exists.
- [x] Run the first Localflame installer/configurator repeatedly and prove the second
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
- [ ] For every applicable Hermes integration, trace native tool enablement,
  lifecycle hooks, MCP registration, and profile-specific exclusions as four
  separate contracts before calling the integration complete.
- [x] Keep all model-project integration under `~/Hermes`; do not create a
  second model-project tree under `~/Deepseek` or an installation directory.
- [x] Treat `~/.hermes`, `~/.omp`, and `~/.dsh` strictly as installed runtime
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
| MCP server API | official TypeScript SDK server docs | installed package types/examples | passed for `3c97a84` |
| Firecrawl request/response | official v2 API reference | `CommanderTurtle/llm` implementation | passed for `3c97a84` |
| Section/index behavior | `llm/src/context.js` | static invariant and call-site audit | passed for `3c97a84` |
| OMP config | installed `mcp-schema.json` | installed MCP loader/config source | MCP and provider preservation passed |
| Hermes config | native `hermes tools`/`hermes mcp` output | installed profile config and hooks | MCP and provider preservation passed; deeper integration audit active |
| DSH config | installed `dsh-mcp-client` | installed profile/preset loader | strict four-preset roster and read-only Localflame access passed |
| Update resilience | installer source audit | current and prior client config contracts | pending |
| Live OMP/Diogenes | installed schema/config loader | Diogenes scripts and rerun state | pending |
| Live Hermes | current repo docs/source | real launcher/updater/config state | first integration passed; final convergence pending |
| Live DSH | installed packages/presets | real profile and regenerated preset | first integration passed; strict roster pending |
| Repository contents | unit/static checks | `git diff --check` and tracked-file audit | Localflame/Retrieval passed; later repos pending |

## 9. Retrieval, skill lifecycle, and Librarian integration

- [x] Remove IWE as a checkout, executable, Cargo install, configuration value,
  and runtime dependency. Port only the required fuzzy/BM25 ranking and graph
  walking behavior directly into Retrieval's Python package, with attribution.
- [x] Make the internal catalog expose a stable structured browse/tree result
  for human interfaces as well as its model-facing search/read flow.
- [x] Preserve lossless source metadata while merging duplicate skills by
  canonical path and normalized identity during each catalog synchronization.
- [x] Install Retrieval's routing skill for both Hermes and OMP, including
  already-existing Hermes profiles, so the agent-facing catalog describes
  `retrieve_skill` and the parallel read-only scout before a call is needed.
- [x] Add an idempotent session-close operation that synchronizes the catalog
  and removes only manifest-owned projections for the closing harness.
- [x] Attach that operation to current Hermes and OMP session lifecycle hooks,
  then audit installed skill trees against each upstream baseline so retrieved
  skills do not permanently pollute either harness.
- [x] Route supported OMP/Hermes configuration changes through their native
  `config` commands and use their documented MCP configuration boundary where
  no non-interactive command exists.
- [ ] Replace Diogenes's flat skill-file audit source with Retrieval's structured
  catalog API and add a source/category/skill graph browser to the existing
  operator window; retain edit actions only for canonical editable files.
- [x] Verify Retrieval and Librarian appear in both Hermes's native MCP listing
  and OMP's native `/mcp` configuration source without starting either server.
- [x] Confirm Librarian contains the fetched `understory/main` tip before adding
  any integration commit; preserve its existing dependency updates.
- [x] Give Librarian the same repeatable dual-harness routing skill and registration
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

- [x] Audit Persephone separately as a gateway project; do not treat it as a
  small addendum to Localflame or the Retrieval/Librarian interfaces.
- [x] Replace its duplicate in-process Firecrawl search adapter with the
  versioned Localflame MCP while retaining the Camofox browser adapter.
- [ ] Add a Diogenes setup flow comparable in completeness to
  `hermes setup gateway`: Signal, Discord, and Slack steps; exact provider-side
  settings; copy-ready values; allowlists; secrets/environment targets; and
  validation state.
- [ ] Expose gateway lifecycle, connector health, logs, routes, sessions,
  schedules, approvals, queued messages, retry state, and worker/profile state
  through Persephone's existing CLI/control API.
- [x] Ensure Persephone can operate from its own OMP RPC service contract and
  does not depend on the Hermes TUI or Hermes gateway being active.
- [x] Give install, integrate, doctor, update, restart-if-active, and uninstall
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

- [x] Commit and statically verify Localflame's stable MCP/server contract first
  (`3c97a84`). Commit the provider-policy/routing revision before downstream
  update scripts are finalized.
- [x] Commit Retrieval next, run its IWE removal and clean-baseline lifecycle
  scripts, then verify its catalog/tree output and installed routing skill in
  both harness families.
- [x] Commit Librarian's dual-harness integration while preserving its existing
  dependency changes and isolated worker profiles.
- [x] Commit Persephone's Localflame handoff and repeatable integration changes
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
