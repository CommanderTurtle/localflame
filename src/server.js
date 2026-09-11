import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import {
  FirecrawlError,
  normalizeFirecrawlUrl,
  normalizeScrapePayload,
  normalizeSearchPayload,
  scrapeFirecrawl,
  searchFirecrawl,
} from "./firecrawl.js";
import {
  ResourceStore,
  createResource,
  findInResource,
  readResource,
  resourceOutline,
  resourceSummary,
} from "./resources.js";

const VERSION = "1.0.0";

function envPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function payloadResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function errorResult(error) {
  const value = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...(error instanceof FirecrawlError && error.status !== null ? { status: error.status } : {}),
    ...(error instanceof FirecrawlError && error.detail ? { detail: error.detail } : {}),
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function guarded(handler) {
  return async (args, context) => {
    try {
      return await handler(args, context);
    } catch (error) {
      return errorResult(error);
    }
  };
}

function getResource(store, id) {
  const resource = store.get(id);
  if (!resource) throw new Error(`Resource ${JSON.stringify(String(id))} is not available in this MCP process.`);
  return resource;
}

function sectionSelection(args, count) {
  if (Array.isArray(args.sections) && args.sections.length) return args.sections;
  const start = Math.trunc(Number(args.start_section || args.section || 1));
  const end = Math.trunc(Number(args.end_section || start));
  if (start < 1 || end < start || end > count) throw new Error(`Section range must be between 1 and ${count}.`);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function buildServer(options = {}) {
  const baseUrl = normalizeFirecrawlUrl(options.baseUrl ?? process.env.FIRECRAWL_API_URL);
  const apiKey = options.apiKey ?? process.env.FIRECRAWL_API_KEY;
  const store = options.store ?? new ResourceStore({
    maxResources: envPositiveInt("LOCALFLAME_MAX_RESOURCES", 64),
    maxBytes: envPositiveInt("LOCALFLAME_MAX_RESOURCE_BYTES", 64 * 1024 * 1024),
  });
  const server = new McpServer(
    { name: "localflame", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool("firecrawl_search", {
    title: "Firecrawl search",
    description: "Search only through the configured Firecrawl v2 service. Full scraped results stay losslessly sectioned in memory; this call returns a compact index and section 1. Use firecrawl_read for later sections and firecrawl_find for exact or word-intersection lookup.",
    inputSchema: z.object({
      query: z.string().min(1).max(500).describe("Search query."),
      limit: z.number().int().min(1).max(100).default(5),
      sources: z.array(z.enum(["web", "images", "news"])).optional(),
      categories: z.array(z.enum(["github", "research", "pdf"])).optional(),
      include_domains: z.array(z.string().min(1)).optional(),
      exclude_domains: z.array(z.string().min(1)).optional(),
      tbs: z.string().optional().describe("Firecrawl time filter such as qdr:d, qdr:w, qdr:m, or qdr:y."),
      location: z.string().optional(),
      country: z.string().optional(),
      ignore_invalid_urls: z.boolean().optional(),
      scrape_content: z.boolean().default(true).describe("Include cleaned Markdown from each result. Enabled by default."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guarded(async (args, context) => {
    const raw = await searchFirecrawl(baseUrl, args, { apiKey, signal: context.signal });
    const normalized = normalizeSearchPayload(raw, args.query);
    const resource = store.set(createResource(normalized.content, {
      kind: "search",
      name: `Search: ${args.query}`,
      sourceTool: "firecrawl_search",
      metadata: { query: args.query, counts: normalized.counts },
    }));
    return payloadResult({ ok: true, resource: resourceSummary(resource, true) });
  }));

  server.registerTool("firecrawl_scrape", {
    title: "Firecrawl scrape",
    description: "Scrape a public URL only through the configured Firecrawl v2 service. The complete result is stored losslessly in ordered sections; this call returns its compact index and section 1.",
    inputSchema: z.object({
      url: z.url(),
      formats: z.array(z.enum(["markdown", "html", "rawHtml", "links", "images", "screenshot"])).optional(),
      only_main_content: z.boolean().default(true),
      include_tags: z.array(z.string().min(1)).optional(),
      exclude_tags: z.array(z.string().min(1)).optional(),
      wait_for: z.number().int().min(0).optional().describe("Firecrawl render wait in milliseconds."),
      max_age: z.number().int().min(0).optional().describe("Firecrawl cache maximum age in milliseconds."),
      mobile: z.boolean().optional(),
      block_ads: z.boolean().optional(),
      remove_base64_images: z.boolean().optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guarded(async (args, context) => {
    const raw = await scrapeFirecrawl(baseUrl, args, { apiKey, signal: context.signal });
    const normalized = normalizeScrapePayload(raw, args.url);
    const resource = store.set(createResource(normalized.content, {
      kind: "scrape",
      name: normalized.metadata.title || `Scrape: ${normalized.sourceUrl}`,
      sourceUrl: normalized.sourceUrl,
      sourceTool: "firecrawl_scrape",
      metadata: normalized.metadata,
    }));
    return payloadResult({ ok: true, resource: resourceSummary(resource, true) });
  }));

  server.registerTool("firecrawl_read", {
    title: "Read Firecrawl sections",
    description: "Open exact, one-based sections from a prior Firecrawl resource. Content is returned byte-for-byte relative to localflame's documented newline cleanup. Use sections, or a contiguous start_section/end_section range.",
    inputSchema: z.object({
      resource_id: z.string().min(1),
      sections: z.array(z.number().int().min(1)).max(64).optional(),
      section: z.number().int().min(1).optional(),
      start_section: z.number().int().min(1).optional(),
      end_section: z.number().int().min(1).optional(),
    }),
    annotations: { readOnlyHint: true },
  }, guarded(async (args) => {
    const resource = getResource(store, args.resource_id);
    const selected = sectionSelection(args, resource.sections.length);
    return payloadResult({
      ok: true,
      resource_id: resource.id,
      name: resource.name,
      sections: readResource(resource, selected),
    });
  }));

  server.registerTool("firecrawl_find", {
    title: "Search Firecrawl resources",
    description: "Search indexed sections from prior Firecrawl results. Exact normalized phrase matches are preferred; otherwise every normalized query word must occur in a section. Returns section numbers and excerpts without reopening entire documents.",
    inputSchema: z.object({
      query: z.string().min(1),
      resource_id: z.string().min(1).optional().describe("Omit to search every in-memory Firecrawl resource."),
      limit: z.number().int().min(1).max(100).default(12),
    }),
    annotations: { readOnlyHint: true },
  }, guarded(async (args) => {
    const resources = args.resource_id ? [getResource(store, args.resource_id)] : store.list();
    const matches = [];
    for (const resource of resources) {
      const remaining = args.limit - matches.length;
      if (remaining <= 0) break;
      for (const match of findInResource(resource, args.query, remaining)) {
        matches.push({ resource_id: resource.id, resource_name: resource.name, ...match });
      }
    }
    return payloadResult({ ok: true, query: args.query, matches });
  }));

  server.registerTool("firecrawl_outline", {
    title: "Page through a Firecrawl resource outline",
    description: "Return compact section metadata for a prior Firecrawl resource. Use this for exceptionally large results whose initial outline is intentionally paged rather than injected wholesale.",
    inputSchema: z.object({
      resource_id: z.string().min(1),
      start_section: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(512).default(64),
    }),
    annotations: { readOnlyHint: true },
  }, guarded(async (args) => {
    const resource = getResource(store, args.resource_id);
    if (args.start_section > resource.sections.length) {
      throw new Error(`start_section must be between 1 and ${resource.sections.length}.`);
    }
    const outline = resourceOutline(resource, args.start_section, args.limit);
    const last = outline.at(-1)?.section ?? args.start_section;
    return payloadResult({
      ok: true,
      resource_id: resource.id,
      section_count: resource.sections.length,
      outline,
      ...(last < resource.sections.length ? { next_outline_section: last + 1 } : {}),
    });
  }));

  server.registerTool("firecrawl_images", {
    title: "List scraped image references",
    description: "List image URLs, alt text, source URL, and section location already discovered in a Firecrawl resource. This does not contact a second web backend or download image bytes.",
    inputSchema: z.object({
      resource_id: z.string().min(1),
      section: z.number().int().min(1).optional(),
    }),
    annotations: { readOnlyHint: true },
  }, guarded(async (args) => {
    const resource = getResource(store, args.resource_id);
    const indexes = args.section
      ? [args.section - 1]
      : resource.sections.map((_, index) => index);
    if (indexes.some((index) => index < 0 || index >= resource.sections.length)) {
      throw new Error(`Section must be between 1 and ${resource.sections.length}.`);
    }
    const images = indexes.flatMap((index) => resource.section_meta[index].images.map((image) => ({
      section: index + 1,
      ...image,
    })));
    return payloadResult({ ok: true, resource_id: resource.id, images });
  }));

  server.registerTool("firecrawl_resources", {
    title: "List Firecrawl resources",
    description: "List compact metadata for Firecrawl results retained by this ephemeral MCP process.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, guarded(async () => payloadResult({
    ok: true,
    endpoint: baseUrl,
    resources: store.list().map((resource) => ({
      ...resourceSummary(resource, false),
      read_sections: resource.read_sections,
    })),
  })));

  return server;
}
