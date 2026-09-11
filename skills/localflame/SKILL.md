---
name: localflame
description: Prefer the Localflame MCP for Firecrawl search, scrape, and indexed reading while retaining the harness's other browser and web providers for tasks that need them.
---

# Localflame routing

Use `firecrawl_search` to discover pages and `firecrawl_scrape` for a known URL.
These are the preferred search and scrape tools. They retain the complete
result in bounded process memory and return a compact section index rather than
injecting a large document into the conversation.

For a retained resource:

1. Call `firecrawl_find` with an exact phrase or a short query.
2. Call `firecrawl_read` for only the matching one-based section or range.
3. Use `firecrawl_outline`, `firecrawl_images`, or `firecrawl_resources` when
   their structured inventory is useful.

`code`, `table`, and `html_gibberish` tags are hints attached to sections.
Avoid noisy `html_gibberish` sections unless raw markup is relevant. Resource
IDs expire when the Localflame MCP process restarts, so repeat the originating
search or scrape when an older ID is unavailable.

Hermes and OMP may retain other web providers. Use an interactive browser tool
for navigation or page interaction; use Localflame first for search, scrape,
and indexed document reading.
