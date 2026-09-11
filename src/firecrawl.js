const DEFAULT_FIRECRAWL_URL = "http://127.0.0.1:3002";

export class FirecrawlError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "FirecrawlError";
    this.status = Number.isInteger(options.status) ? options.status : null;
    this.detail = typeof options.detail === "string" ? options.detail : "";
  }
}

export function normalizeFirecrawlUrl(input = process.env.FIRECRAWL_API_URL || DEFAULT_FIRECRAWL_URL) {
  const candidate = String(input || "").trim();
  if (!candidate) throw new FirecrawlError("FIRECRAWL_API_URL is empty.");
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (cause) {
    throw new FirecrawlError(`Invalid Firecrawl URL: ${candidate}`, { cause });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FirecrawlError("Firecrawl must use an http:// or https:// URL.");
  }
  parsed.search = "";
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/+$/, "").replace(/\/v[12]$/i, "");
  parsed.pathname = `${path}/v2`.replace(/\/{2,}/g, "/");
  return parsed.href.replace(/\/$/, "");
}

function apiUrl(baseUrl, endpoint) {
  return `${normalizeFirecrawlUrl(baseUrl)}/${String(endpoint).replace(/^\/+/, "")}`;
}

function describePayload(payload, fallback) {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  return fallback;
}

export async function requestFirecrawl(baseUrl, endpoint, body, options = {}) {
  const url = apiUrl(baseUrl, endpoint);
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "@commanderturtle/localflame/1.0.0",
  };
  const apiKey = String(options.apiKey ?? process.env.FIRECRAWL_API_KEY ?? "").trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (cause) {
    if (cause?.name === "AbortError") {
      throw new FirecrawlError(`Firecrawl ${endpoint} was cancelled by the MCP client.`, { cause });
    }
    throw new FirecrawlError(`Could not reach Firecrawl at ${url}.`, { cause });
  }

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (cause) {
    throw new FirecrawlError(`Firecrawl returned HTTP ${response.status} with invalid JSON.`, {
      cause,
      status: response.status,
      detail: raw.slice(0, 8_000),
    });
  }
  if (!response.ok || payload?.success === false) {
    throw new FirecrawlError(describePayload(payload, `Firecrawl returned HTTP ${response.status}.`), {
      status: response.status,
      detail: raw.slice(0, 16_000),
    });
  }
  return payload;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export function buildSearchRequest(args = {}) {
  const query = String(args.query || "").trim();
  if (!query) throw new FirecrawlError("firecrawl_search requires a non-empty query.");
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(args.limit) || 5)));
  const sources = stringList(args.sources);
  const categories = stringList(args.categories);
  const includeDomains = stringList(args.include_domains);
  const excludeDomains = stringList(args.exclude_domains);
  if (includeDomains.length && excludeDomains.length) {
    throw new FirecrawlError("Use include_domains or exclude_domains, not both.");
  }
  const body = {
    query,
    limit,
    sources: sources.length ? sources : ["web"],
    ...(args.scrape_content === false
      ? {}
      : { scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true } }),
  };
  if (categories.length) body.categories = categories;
  if (includeDomains.length) body.includeDomains = includeDomains;
  if (excludeDomains.length) body.excludeDomains = excludeDomains;
  if (args.tbs) body.tbs = String(args.tbs);
  if (args.location) body.location = String(args.location);
  if (args.country) body.country = String(args.country);
  if (typeof args.ignore_invalid_urls === "boolean") body.ignoreInvalidURLs = args.ignore_invalid_urls;
  return body;
}

export function buildScrapeRequest(args = {}) {
  const url = String(args.url || "").trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new FirecrawlError("firecrawl_scrape requires a valid URL.", { cause });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FirecrawlError("firecrawl_scrape accepts only http:// and https:// URLs.");
  }
  const formats = stringList(args.formats);
  const body = {
    url: parsed.href,
    formats: (formats.length ? formats : ["markdown"]).map((type) => ({ type })),
    onlyMainContent: args.only_main_content !== false,
  };
  const includeTags = stringList(args.include_tags);
  const excludeTags = stringList(args.exclude_tags);
  if (includeTags.length) body.includeTags = includeTags;
  if (excludeTags.length) body.excludeTags = excludeTags;
  if (Number.isFinite(Number(args.wait_for)) && Number(args.wait_for) >= 0) body.waitFor = Math.trunc(Number(args.wait_for));
  if (Number.isFinite(Number(args.max_age)) && Number(args.max_age) >= 0) body.maxAge = Math.trunc(Number(args.max_age));
  if (typeof args.mobile === "boolean") body.mobile = args.mobile;
  if (typeof args.block_ads === "boolean") body.blockAds = args.block_ads;
  if (typeof args.remove_base64_images === "boolean") body.removeBase64Images = args.remove_base64_images;
  return body;
}

export async function searchFirecrawl(baseUrl, args, options = {}) {
  return requestFirecrawl(baseUrl, "search", buildSearchRequest(args), options);
}

export async function scrapeFirecrawl(baseUrl, args, options = {}) {
  return requestFirecrawl(baseUrl, "scrape", buildScrapeRequest(args), options);
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function metadataLines(item) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const candidates = {
    author: firstString(item?.author, metadata.author),
    published: firstString(item?.publishedAt, item?.date, metadata.publishedTime, metadata.publishedAt),
    language: firstString(item?.language, metadata.language),
    status: Number.isInteger(metadata.statusCode) ? String(metadata.statusCode) : "",
  };
  const rendered = Object.entries(candidates).filter(([, value]) => value);
  return rendered.length ? rendered.map(([key, value]) => `${key}: ${value}`).join(" · ") : "";
}

function resultMarkdown(item, index, kind) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const title = firstString(item?.title, metadata.title, `${kind} result ${index + 1}`);
  const url = firstString(item?.url, metadata.sourceURL, metadata.url);
  const description = firstString(item?.description, item?.snippet, metadata.description);
  const markdown = firstString(item?.markdown, item?.content);
  return [
    `## ${index + 1}. ${title}`,
    url,
    metadataLines(item),
    description,
    markdown,
  ].filter(Boolean).join("\n\n");
}

export function normalizeSearchPayload(payload, query = "") {
  const data = payload?.data;
  const web = Array.isArray(data) ? data : Array.isArray(data?.web) ? data.web : [];
  const news = Array.isArray(data?.news) ? data.news : [];
  const images = Array.isArray(data?.images) ? data.images : [];
  const blocks = [];
  if (query) blocks.push(`# Firecrawl search: ${query}`);
  if (web.length) blocks.push(web.map((item, index) => resultMarkdown(item, index, "web")).join("\n\n---\n\n"));
  if (news.length) blocks.push("# News", news.map((item, index) => resultMarkdown(item, index, "news")).join("\n\n---\n\n"));
  if (images.length) {
    blocks.push("# Images", images.map((item, index) => {
      const url = firstString(item?.imageUrl, item?.image_url, item?.url, item?.src);
      const title = firstString(item?.title, item?.alt, `Image ${index + 1}`);
      return url ? `![${title}](${url})` : "";
    }).filter(Boolean).join("\n"));
  }
  return {
    content: blocks.filter(Boolean).join("\n\n"),
    counts: { web: web.length, news: news.length, images: images.length },
  };
}

export function normalizeScrapePayload(payload, requestedUrl = "") {
  const data = payload?.data ?? payload ?? {};
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const sourceUrl = firstString(metadata.sourceURL, metadata.url, requestedUrl);
  const content = firstString(data.markdown, data.html, data.rawHtml, data.content, JSON.stringify(data, null, 2));
  return {
    content,
    sourceUrl,
    metadata: {
      title: firstString(metadata.title, data.title),
      description: firstString(metadata.description, data.description),
      language: firstString(metadata.language),
      statusCode: Number.isInteger(metadata.statusCode) ? metadata.statusCode : null,
    },
  };
}
