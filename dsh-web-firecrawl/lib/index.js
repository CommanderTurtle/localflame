/**
 * `@local/dsh-web-firecrawl` — a self-hosted (zero-auth) Firecrawl web provider
 * for the DeepSeek Harness web seam (`ctx.web`).
 *
 * Registers a search provider and a fetch provider that POST to the local,
 * unauthenticated Firecrawl instance (default `http://localhost:3002`, from
 * `FIRECRAWL_API_URL`). No `Authorization` header is sent — this targets a
 * self-hosted Firecrawl that accepts unauthenticated requests.
 *
 * Contract mirrors `@deepseek-ai/dsh-web-search-deepseek`: an npm module
 * exporting `{ name, inject: ['web'], apply(ctx, config) }`. `apply` calls
 * `ctx.web.registerSearchProvider` / `ctx.web.registerFetchProvider`.
 */

const name = "web-firecrawl-local";

const inject = ["web"];

function resolveBaseUrl(configUrl) {
	const url = (configUrl ?? process.env.FIRECRAWL_API_URL ?? "http://localhost:3002").trim().replace(/\/+$/, "");
	if (!/^https?:\/\//i.test(url)) {
		throw new Error(`@local/dsh-web-firecrawl: invalid baseURL ${JSON.stringify(url)}; expected http(s)://...`);
	}
	return url;
}

function decodeFirecrawlError(res, body) {
	const detail = body?.error || body?.message || (body?.success === false ? "Firecrawl request failed" : "");
	return new Error(`Firecrawl search failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
}

async function searchProvider(baseUrl, request, signal) {
	const res = await fetch(`${baseUrl}/v2/search`, {
		method: "POST",
		headers: { "Content-Type": "application/json" }, // deliberately no Authorization
		body: JSON.stringify({
			query: request.query,
			limit: request.maxResults ?? 8,
			sources: [{ type: "web" }],
		}),
		signal,
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw decodeFirecrawlError(res, json);
	const data = Array.isArray(json.data) ? json.data : (json.data?.web ?? []);
	const sources = (data ?? [])
		.filter((r) => r.url)
		.map((r) => ({
			url: r.url,
			title: r.title ?? r.url,
			snippet: r.description ?? r.snippet ?? r.markdown,
		}));
	return { sources, truncated: false };
}

async function fetchProvider(baseUrl, request, signal) {
	const res = await fetch(`${baseUrl}/v2/scrape`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url: request.url, formats: ["markdown"] }),
		signal,
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw decodeFirecrawlError(res, json);
	const data = json.data ?? {};
	return {
		url: data.metadata?.sourceURL ?? request.url,
		statusCode: res.status,
		body: { kind: "text", content: data.markdown ?? "" },
		truncated: false,
	};
}

function apply(ctx, config) {
	const baseUrl = resolveBaseUrl(config?.baseURL);
	ctx.web.registerSearchProvider({
		id: "firecrawl-local",
		available: () => true,
		search: (request, signal) => searchProvider(baseUrl, request, signal),
	});
	ctx.web.registerFetchProvider({
		id: "firecrawl-local",
		available: () => true,
		fetch: (request, signal) => fetchProvider(baseUrl, request, signal),
	});
}

export { apply, inject, name };