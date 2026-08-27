/**
 * `@local/dsh-web-firecrawl` — a self-hosted (zero-auth) Firecrawl web provider
 * for the DeepSeek Harness web seam (`ctx.web`).
 *
 * A single plugin that registers BOTH a search provider and a fetch provider
 * under the id `firecrawl-local`:
 *
 *   - `web_search`  → `POST {baseURL}/v2/search`   (search provider)
 *   - `web_fetch`   → `POST {baseURL}/v2/scrape`   (fetch provider)
 *
 * The default and intended target is a self-hosted Firecrawl that accepts
 * unauthenticated requests (default `http://localhost:3002`, overridable via
 * `FIRECRAWL_API_URL` or config `baseURL`). No `Authorization` header is ever
 * sent — this is a *zero-auth* provider, unlike the cloud-facing Firecrawl
 * plugin (which always sends a bearer key and is gated on a non-empty key).
 *
 * Feature set and safety model are ported (MIT contributions, see ATTRIBUTION)
 * from `firecrawl/dsh-firecrawl` (MIT): multi-source search (web/news), domain
 * allow/deny, time/geo filters, scrape-as-snippet, HTML/markdown fetch, content
 * chrome stripping, body truncation with a real `truncated` flag, URL safety
 * validation, and the seam's typed `WebError` vocabulary. Because this targets
 * a self-hosted instance, genuinely cloud-only knobs (proxy tiers, Firecrawl
 * CDN cache slabs) are accepted-and-ignored or gated to what self-hosted
 * Firecrawl honors.
 *
 * Contract mirrors `@deepseek-ai/dsh-web-search-deepseek`: an npm module
 * exporting `{ name, inject: ['web'], apply(ctx, config) }`.
 */

import { WebError } from '@deepseek-ai/dsh-web'

const name = 'web-firecrawl-local'
const inject = ['web']

const PROVIDER_ID = 'firecrawl-local'
const DEFAULT_BASE_URL = 'http://localhost:3002'
const DEFAULT_SEARCH_TIMEOUT_MS = 60_000
const DEFAULT_FETCH_TIMEOUT_MS = 60_000
const DEFAULT_MAX_BODY_CHARS = 100_000
const DEFAULT_MAX_URL_LENGTH = 2048
const USER_AGENT = '@local/dsh-web-firecrawl/0.2.0 (self-hosted; AGPL-3.0)'

// ── config resolution -------------------------------------------------------

function resolveBaseUrl(configUrl) {
	const url = (configUrl ?? process.env.FIRECRAWL_API_URL ?? DEFAULT_BASE_URL)
		.trim().replace(/\/+$/, '')
	if (!/^https?:\/\//i.test(url)) {
		throw new Error(`@local/dsh-web-firecrawl: invalid baseURL ${JSON.stringify(url)}; expected http(s)://...`)
	}
	return url
}

function pick(sec, key, fallback, envName) {
	if (sec && sec[key] !== undefined && sec[key] !== null) return sec[key]
	if (envName && process.env[envName] !== undefined && process.env[envName] !== '') return process.env[envName]
	return fallback
}

function bool(value, fallback) {
	return value === undefined ? fallback : Boolean(value)
}

function seq(value) {
	return Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.length > 0) : []
}

function isPosInt(value) {
	return Number.isInteger(value) && value > 0
}

// ── error taxonomy (typed WebError, same codes as the seam + upstream) ------

const isAbort = (e) => e instanceof DOMException && e.name === 'AbortError'

function aborted(label, cause) {
	return new WebError(`${label} aborted`, 'WEB_ABORTED', cause === undefined ? {} : { cause })
}

function providerError(message, cause) {
	return new WebError(message, 'WEB_PROVIDER_ERROR', cause === undefined ? {} : { cause })
}

function invalidUrl(message, cause) {
	return new WebError(message, 'WEB_INVALID_URL', cause === undefined ? {} : { cause })
}

function describeFailure(label, status, payload) {
	const detail = typeof payload?.error === 'string' && payload.error.length > 0 ? payload.error : undefined
	const code = typeof payload?.code === 'string' && payload.code.length > 0 ? payload.code : undefined
	const prefix = status >= 400 ? `${label} failed (HTTP ${status})` : `${label} failed`
	const suffix = [code, detail].filter(Boolean).join(': ')
	return suffix.length > 0 ? `${prefix}: ${suffix}` : prefix
}

// ── shared transport (zero-auth) ---------------------------------------------

/**
 * Zero-auth POST. Built from the upstream transport but with the `Bearer`
 * header deliberately removed, `redirect: 'error'` kept (a keyless provider
 * never chases redirects), and the `success:false`-on-200 check preserved.
 */
async function postFirecrawl(endpoint, body, label, signal) {
	let res
	try {
		res = await fetch(endpoint, {
			method: 'POST',
			redirect: 'error',
			headers: {
				'content-type': 'application/json',
				'accept': 'application/json',
				'user-agent': USER_AGENT,
			},
			body: JSON.stringify(body),
			...signal !== undefined ? { signal } : {},
		})
	} catch (error) {
		if (isAbort(error)) throw aborted(label, error)
		throw providerError(`${label} request failed: ${String(error)}`, error)
	}

	let payload
	try {
		payload = await res.json()
	} catch (error) {
		if (isAbort(error)) throw aborted(label, error)
		if (!res.ok) throw providerError(`${label} failed (HTTP ${res.status})`, error)
		throw providerError(`${label} returned an unprocessable response body: ${String(error)}`, error)
	}

	if (!res.ok || payload?.success === false) {
		throw providerError(describeFailure(label, res.status, payload))
	}
	return payload
}

// ── search provider ----------------------------------------------------------

function buildSearchBody(request, s) {
	const limit = request.maxResults ?? s.limit
	const body = {
		query: request.query,
		sources: s.sources.length > 0 ? s.sources : ['web'],
		timeout: s.timeoutMs,
		...limit !== undefined ? { limit } : {},
		...s.includeDomains.length ? { includeDomains: s.includeDomains } : {},
		...s.excludeDomains.length ? { excludeDomains: s.excludeDomains } : {},
		...s.tbs ? { tbs: s.tbs } : {},
		...s.country ? { country: s.country } : {},
		...s.location ? { location: s.location } : {},
		...s.scrapeContent ? { scrapeOptions: { formats: ['markdown'], onlyMainContent: true } } : {},
	}
	return body
}

function clip(value, max) {
	if (value === undefined || max === undefined || value.length <= max) return value
	return value.slice(0, max)
}

function firstNonblank(...values) {
	for (const v of values) if (typeof v === 'string' && v.trim().length > 0) return v
	return undefined
}

function mapWebResult(r, maxChars) {
	if (!firstNonblank(r.url)) return undefined
	const snippet = clip(firstNonblank(r.markdown, r.description), maxChars)
	const source = { url: r.url }
	if (firstNonblank(r.title)) source.title = r.title
	if (snippet !== undefined) source.snippet = snippet
	return source
}

function mapNewsResult(r, maxChars) {
	if (!firstNonblank(r.url)) return undefined
	const snippet = clip(firstNonblank(r.markdown, r.snippet), maxChars)
	const source = { url: r.url }
	if (firstNonblank(r.title)) source.title = r.title
	if (snippet !== undefined) source.snippet = snippet
	if (firstNonblank(r.date)) source.publishedAt = r.date
	return source
}

function mapSearchResponse(payload, maxCharsPerResult) {
	const web = (payload?.data?.web ?? []).map((r) => mapWebResult(r, maxCharsPerResult))
	const news = (payload?.data?.news ?? []).map((r) => mapNewsResult(r, maxCharsPerResult))
	const sources = [...web, ...news].filter((x) => x !== undefined)
	return { sources, truncated: false }
}

async function searchProvider(baseUrl, request, s, signal) {
	const endpoint = `${baseUrl}/v2/search`
	const payload = await postFirecrawl(endpoint, buildSearchBody(request, s), 'Firecrawl search', signal)
	try {
		return mapSearchResponse(payload, s.maxCharsPerResult)
	} catch (error) {
		throw providerError(`Firecrawl search returned an unprocessable response body: ${String(error)}`, error)
	}
}

// ── fetch provider -----------------------------------------------------------

/** Reject unsupported/unsafe fetch targets locally before any request goes out. */
function assertFetchableUrl(url, maxUrlLength) {
	if (url.length > maxUrlLength) {
		throw invalidUrl(`URL exceeds the ${maxUrlLength}-character limit`)
	}
	let parsed
	try {
		parsed = new URL(url)
	} catch (error) {
		throw invalidUrl(`invalid URL: ${url}`, error)
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw invalidUrl(`unsupported URL scheme "${parsed.protocol}"; only http and https are fetchable`)
	}
	if (parsed.username.length > 0 || parsed.password.length > 0) {
		throw invalidUrl('URL must not carry embedded credentials')
	}
}

function buildScrapeBody(request, f) {
	return {
		url: request.url,
		formats: [f.format],
		onlyMainContent: f.onlyMainContent,
		...f.waitForMs > 0 ? { waitFor: f.waitForMs } : {},
		...f.mobile ? { mobile: true } : {},
		blockAds: f.blockAds,
		...f.proxy ? { proxy: f.proxy } : {},
		timeout: f.timeoutMs,
	}
}

function mapScrapeResponse(payload, requestedUrl, f) {
	const data = payload?.data
	if (data === undefined || data === null) throw new TypeError('response.data is missing')

	const raw = f.format === 'html' ? data.html : data.markdown
	const content = typeof raw === 'string' ? raw : ''
	const truncated = content.length > f.maxBodyChars
	const sliced = truncated ? content.slice(0, f.maxBodyChars) : content
	const body = f.format === 'html'
		? { kind: 'html', content: sliced }
		: { kind: 'text', content: sliced }

	const meta = data.metadata ?? {}
	const statusCode = Number.isInteger(meta.statusCode) && meta.statusCode >= 0
		? meta.statusCode
		: 200

	return {
		url: firstNonblank(meta.url, meta.sourceURL) ?? requestedUrl,
		statusCode,
		body,
		truncated,
	}
}

async function fetchProvider(baseUrl, request, f, signal) {
	assertFetchableUrl(request.url, f.maxUrlLength)
	const endpoint = `${baseUrl}/v2/scrape`
	const payload = await postFirecrawl(endpoint, buildScrapeBody(request, f), 'Firecrawl fetch', signal)
	try {
		return mapScrapeResponse(payload, request.url, f)
	} catch (error) {
		throw providerError(`Firecrawl fetch returned an unprocessable response body: ${String(error)}`, error)
	}
}

// ── plugin apply ---------------------------------------------------------------

function apply(ctx, config = {}) {
	const baseUrl = resolveBaseUrl(config.baseURL)
	const s = config.search ?? {}
	const f = config.fetch ?? {}

	const searchOpts = {
		sources: (s.sources && s.sources.length ? [...s.sources] : ['web']),
		limit: pick(s, 'limit', undefined),
		scrapeContent: bool(s.scrapeContent, false),
		maxCharsPerResult: pick(s, 'maxCharsPerResult', undefined),
		includeDomains: seq(s.includeDomains),
		excludeDomains: seq(s.excludeDomains),
		tbs: pick(s, 'tbs', undefined),
		country: pick(s, 'country', undefined),
		location: pick(s, 'location', undefined),
		timeoutMs: isPosInt(s.timeoutMs) ? s.timeoutMs : DEFAULT_SEARCH_TIMEOUT_MS,
	}

	const fetchOpts = {
		format: f.format === 'html' ? 'html' : 'markdown',
		onlyMainContent: bool(f.onlyMainContent, true),
		waitForMs: isPosInt(f.waitForMs) ? f.waitForMs : 0,
		mobile: bool(f.mobile, false),
		blockAds: bool(f.blockAds, true),
		proxy: pick(f, 'proxy', undefined),
		timeoutMs: isPosInt(f.timeoutMs) ? f.timeoutMs : DEFAULT_FETCH_TIMEOUT_MS,
		maxBodyChars: isPosInt(f.maxBodyChars) ? f.maxBodyChars : DEFAULT_MAX_BODY_CHARS,
		maxUrlLength: isPosInt(f.maxUrlLength) ? f.maxUrlLength : DEFAULT_MAX_URL_LENGTH,
	}

	ctx.web.registerSearchProvider({
		id: PROVIDER_ID,
		available: () => true,
		search: (request, signal) => searchProvider(baseUrl, request, searchOpts, signal),
	})

	ctx.web.registerFetchProvider({
		id: PROVIDER_ID,
		available: () => true,
		fetch: (request, signal) => fetchProvider(baseUrl, request, fetchOpts, signal),
	})
}

export { apply, inject, name }