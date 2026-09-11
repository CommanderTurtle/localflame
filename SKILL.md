---
name: localflame
description: Use the local Firecrawl-only MCP for web search and scraping when large results should remain losslessly sectioned and searchable instead of being injected wholesale.
---

# Localflame

Use `firecrawl_search` for discovery and `firecrawl_scrape` for a known URL. Both
store the complete cleaned Markdown in the current MCP process and initially
return only a compact outline plus section 1.

For retained results:

- Use `firecrawl_find` before reading a large resource. It finds exact phrases
  first, then sections containing every normalized query word.
- Use `firecrawl_read` for only the relevant one-based sections. Adjacent ranges
  can be requested with `start_section` and `end_section`.
- Use `firecrawl_outline` to page through section metadata when the first
  outline is incomplete.
- Use `firecrawl_images` to enumerate image URLs, alt text, source URLs, and
  section locations already found in a result.
- Treat `html_gibberish` as a hint to skip a noisy section unless raw markup is
  relevant. `code` and `table` tags identify sections with those structures.

Resources are ephemeral and belong to one Localflame process. If a resource ID
is unavailable after a client restart, repeat the original search or scrape.
The server contacts only the configured Firecrawl `/v2` endpoint; do not assume
another search backend is available. When Camofox is installed, use it for
interactive browser navigation and Localflame for search and scrape.
