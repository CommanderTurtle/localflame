# ATTRIBUTION

`localflame` is licensed **AGPL-3.0-or-later** (see `LICENSE`).

Parts of the provider's search/fetch feature set, response mapping, and error
vocabulary are ported (modified) from:

> **`firecrawl/dsh-firecrawl`** — "Firecrawl-backed `web_search` and `web_fetch`
> providers for the DeepSeek Harness web capability seam (`ctx.web`)"
> https://github.com/firecrawl/dsh-firecrawl
>
> Copyright (c) 2026 Firecrawl — **MIT License** (verbatim text below).

Per the MIT License, this notice is included with all copies or substantial
portions of the ported code. The MIT license is permissive and AGPL-compatible:
reuse, modification, and redistribution under `localflame`'s outbound
**AGPL-3.0-or-later** license is permitted, provided (a) the upstream copyright
and permission notices are retained (as they are here), and (b) modifications
are documented. This is a *derivative work* added to the AGPL'd codebase; it is
not a re-licensing of the MIT component distributed on its own.

## What was ported (and how it was modified for localflame)

- **Multi-source search**: `sources: [web, news]`, mapping `data.news[]` (with
  `publishedAt` from Firecrawl's `date`) alongside `data.web[]`.
- **Search controls**: `includeDomains` / `excludeDomains`, `tbs` (time filter),
  `country` / `location` (geo), `scrapeContent` + `maxCharsPerResult`
  (scrape-as-snippet), `limit`, configurable `timeoutMs`.
- **Fetch controls**: `format` (`markdown` | `html`), `onlyMainContent`,
  `waitForMs`, `mobile`, `blockAds`, `maxBodyChars` (truncation reporting a real
  `truncated: true`), `maxUrlLength`, configurable `timeoutMs`.
- **Fetch URL safety** (`assertFetchableUrl`): rejects `file://`, non-http(s)
  schemes, embedded credentials, and over-long URLs before any request is sent.
- **Real page status**: fetch returns the page's `metadata.statusCode` (so 404s
  are results, not errors) instead of the transport's own status.
- **Typed `WebError` codes**: `WEB_ABORTED`, `WEB_INVALID_URL`,
  `WEB_PROVIDER_ERROR`, and the `success:false`-on-200 detection.

### Intentional differences from upstream (modifications)

- **Zero-auth by default.** localflame is built for a **self-hosted** Firecrawl
  that accepts unauthenticated requests. It sends **no `Authorization` header**
  and is **not** gated on a non-empty API key. Upstream always sends
  `Bearer <apiKey>` and its `available()` fails with an empty key.
- **Endpoint is env-driven.** `baseURL` defaults to `http://localhost:3002` and
  falls back from config `baseURL` to `$FIRECRAWL_API_URL`. Upstream defaults to
  `https://api.firecrawl.dev` and has **no env-var path** for `baseURL`.
- **One plugin, both capabilities.** localflame registers search and fetch under
  a single plugin/id. Upstream ships two plugins (`@firecrawl/dsh-firecrawl` and
  `.../fetch`).
- **Cloud-only knobs de-emphasized.** `proxy` (stealth/basic tiers) is
  accepted-and-forwarded but only meaningful if your self-hosted instance
  supports it; upstream's CDN cache (`maxAgeMs`) is not exposed because a local
  instance has no such CDN slab. `blockAds` / `onlyMainContent` are kept because
  they are cheap server-side content hygiene for any Firecrawl.
- **Released under AGPL-3.0-or-later** (upstream is MIT).

---

## The MIT License (Firecrawl)

```
MIT License

Copyright (c) 2026 Firecrawl

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```