import { createHash } from "node:crypto";

export const RESOURCE_SECTION_CHARS = 12_000;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const searchIndexes = new WeakMap();

function asText(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

export function cleanToolMarkdown(value) {
  return asText(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function segmentMarkdown(value, maxChars = RESOURCE_SECTION_CHARS) {
  const source = asText(value);
  if (!source) return [""];
  const width = Math.max(64, Math.trunc(Number(maxChars) || RESOURCE_SECTION_CHARS));
  if (source.length <= width) return [source];
  const sections = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (source.length - cursor <= width) {
      sections.push(source.slice(cursor));
      break;
    }
    const target = cursor + width;
    const minimum = cursor + Math.floor(width * 0.55);
    let cut = source.lastIndexOf("\n\n", target);
    if (cut >= minimum) cut += 2;
    else {
      cut = source.lastIndexOf("\n", target);
      if (cut >= minimum) cut += 1;
      else {
        cut = source.lastIndexOf(" ", target);
        cut = cut >= minimum ? cut + 1 : target;
      }
    }
    sections.push(source.slice(cursor, cut));
    cursor = cut;
  }
  return sections;
}

function httpUrl(value, base = "") {
  const candidate = String(value || "").trim().replace(/^<|>$/g, "").replace(/&amp;/g, "&");
  if (!candidate || /^data:/i.test(candidate)) return "";
  try {
    const parsed = base ? new URL(candidate, base) : new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function sectionHeading(section) {
  return section.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim().replace(/\s+#+$/, "") || "";
}

function looksLikeHtmlGibberish(section) {
  if (section.length < 240) return false;
  const markupCount = section.match(/[\\/><^]/g)?.length ?? 0;
  if (markupCount < 64) return false;
  const ratio = markupCount / section.length;
  const noisyRuns = section.match(/(?:[\\/><^][\s]*){6,}/g)?.length ?? 0;
  const tagCount = section.match(/<\/?[A-Za-z][^>]*>/g)?.length ?? 0;
  return ratio >= 0.16 || noisyRuns >= 3 || (tagCount >= 24 && ratio >= 0.08);
}

export function sectionTags(value) {
  const section = asText(value);
  const tags = [];
  if (looksLikeHtmlGibberish(section)) tags.push("html_gibberish");
  if (/(?:^|\n)[ \t]*(?:```|~~~)|<pre\b|<code\b/i.test(section)) tags.push("code");
  if (/(?:^|\n)\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(section) || /<table\b/i.test(section)) tags.push("table");
  return [...new Set(tags)].slice(0, 2);
}

function addImage(images, seen, candidate, alt, sourceUrl, baseUrl) {
  const url = httpUrl(candidate, baseUrl || sourceUrl);
  if (!url || seen.has(url)) return;
  seen.add(url);
  images.push({ url, alt: String(alt || "").trim().slice(0, 240), source_url: httpUrl(sourceUrl) });
}

export function sectionImages(value, options = {}) {
  const section = asText(value);
  const images = [];
  const seen = new Set();
  let currentSource = httpUrl(options.sourceUrl);
  for (const line of section.split("\n")) {
    const standalone = line.trim();
    if (/^https?:\/\/\S+$/i.test(standalone) && !IMAGE_EXTENSION.test(standalone)) {
      currentSource = httpUrl(standalone) || currentSource;
    }
    for (const match of line.matchAll(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g)) {
      addImage(images, seen, match[2], match[1], currentSource, currentSource || options.sourceUrl);
    }
    for (const match of line.matchAll(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi)) {
      const alt = match[0].match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      addImage(images, seen, match[1] || match[2] || match[3], alt?.[1] || alt?.[2] || alt?.[3], currentSource, currentSource || options.sourceUrl);
    }
    for (const match of line.matchAll(/https?:\/\/[^\s<>"'\])]+\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:\?[^\s<>"'\])]+)?/gi)) {
      addImage(images, seen, match[0], "", currentSource, currentSource || options.sourceUrl);
    }
  }
  return images;
}

export function analyzeSections(sections, options = {}) {
  let sourceUrl = httpUrl(options.sourceUrl);
  return sections.map((section) => {
    const images = sectionImages(section, { sourceUrl });
    const standaloneSources = section.split("\n")
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\/\S+$/i.test(line) && !IMAGE_EXTENSION.test(line))
      .map((line) => httpUrl(line))
      .filter(Boolean);
    if (standaloneSources.length) sourceUrl = standaloneSources.at(-1);
    return {
      heading: sectionHeading(section),
      tags: sectionTags(section),
      images,
      source_url: images.find((image) => image.source_url)?.source_url || sourceUrl,
    };
  });
}

function searchableText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase();
}

function searchWords(value) {
  return searchableText(value).match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
}

function buildSearchIndex(resource) {
  const cached = searchIndexes.get(resource);
  if (cached) return cached;
  const sections = resource.sections.map(searchableText);
  const words = new Map();
  sections.forEach((section, index) => {
    for (const word of new Set(searchWords(section))) {
      if (!words.has(word)) words.set(word, new Set());
      words.get(word).add(index);
    }
  });
  const created = { sections, words };
  searchIndexes.set(resource, created);
  return created;
}

function excerpt(section, query) {
  const flattened = section.replace(/\s+/g, " ").trim();
  const position = searchableText(flattened).indexOf(searchableText(query));
  const start = Math.max(0, (position < 0 ? 0 : position) - 90);
  const text = flattened.slice(start, start + 260);
  return `${start ? "…" : ""}${text}${start + 260 < flattened.length ? "…" : ""}`;
}

export function findInResource(resource, queryValue, limit = 12) {
  const query = String(queryValue || "").trim();
  if (!query) throw new Error("firecrawl_find requires a non-empty query.");
  const index = buildSearchIndex(resource);
  const normalizedQuery = searchableText(query);
  const queryWords = [...new Set(searchWords(query))];
  let candidates = null;
  for (const word of queryWords) {
    const matches = index.words.get(word) ?? new Set();
    candidates = candidates === null
      ? new Set(matches)
      : new Set([...candidates].filter((section) => matches.has(section)));
  }
  const pool = candidates === null ? index.sections.map((_, section) => section) : [...candidates];
  const phrase = pool.filter((section) => index.sections[section].includes(normalizedQuery));
  const matches = phrase.length ? phrase : queryWords.length ? pool : [];
  return matches.slice(0, Math.max(1, Math.min(100, Math.trunc(Number(limit) || 12)))).map((section) => ({
    section: section + 1,
    heading: resource.section_meta[section].heading,
    tags: resource.section_meta[section].tags,
    excerpt: excerpt(resource.sections[section], query),
  }));
}

export function createResource(contentValue, additions = {}) {
  const content = cleanToolMarkdown(contentValue);
  const sections = segmentMarkdown(content, additions.maxChars);
  if (sections.join("") !== content) throw new Error("Internal sectioning error: content was not preserved.");
  const hash = createHash("sha256")
    .update(String(additions.kind || "document"))
    .update("\0")
    .update(String(additions.sourceUrl || ""))
    .update("\0")
    .update(content)
    .digest("hex")
    .slice(0, 20);
  const sourceUrl = httpUrl(additions.sourceUrl);
  return {
    id: `fc_${hash}`,
    kind: additions.kind || "document",
    name: additions.name || "Firecrawl result",
    source_url: sourceUrl,
    source_tool: additions.sourceTool || "",
    content,
    sections,
    section_meta: analyzeSections(sections, { sourceUrl }),
    read_sections: [],
    created_at: new Date().toISOString(),
    metadata: additions.metadata && typeof additions.metadata === "object" ? additions.metadata : {},
  };
}

export function resourceOutline(resource, start = 1, limit = 64) {
  const first = Math.max(1, Math.trunc(Number(start) || 1));
  const size = Math.max(1, Math.min(512, Math.trunc(Number(limit) || 64)));
  return resource.sections.slice(first - 1, first - 1 + size).map((section, offset) => {
    const index = first - 1 + offset;
    return {
    section: index + 1,
    characters: section.length,
    heading: resource.section_meta[index].heading,
    tags: resource.section_meta[index].tags,
    images: resource.section_meta[index].images.length,
    };
  });
}

export function resourceSummary(resource, includeFirst = true) {
  const tags = [...new Set(resource.section_meta.flatMap((meta) => meta.tags))];
  const imageCount = resource.section_meta.reduce((sum, meta) => sum + meta.images.length, 0);
  const outline = resourceOutline(resource);
  const summary = {
    id: resource.id,
    kind: resource.kind,
    name: resource.name,
    source_url: resource.source_url,
    characters: resource.content.length,
    section_count: resource.sections.length,
    tags,
    image_count: imageCount,
    outline,
    outline_truncated: outline.length < resource.sections.length,
    ...(outline.length < resource.sections.length ? { next_outline_section: outline.length + 1 } : {}),
    metadata: resource.metadata,
  };
  if (includeFirst) summary.opened = readResource(resource, [1]);
  return summary;
}

export function readResource(resource, sectionNumbers) {
  const requested = [...new Set(sectionNumbers.map((value) => Math.trunc(Number(value))))];
  if (!requested.length || requested.some((value) => value < 1 || value > resource.sections.length)) {
    throw new Error(`Sections must be between 1 and ${resource.sections.length}.`);
  }
  const read = new Set(resource.read_sections);
  const sections = requested.map((number) => {
    const index = number - 1;
    read.add(number);
    return {
      section: number,
      of: resource.sections.length,
      heading: resource.section_meta[index].heading,
      tags: resource.section_meta[index].tags,
      images: resource.section_meta[index].images,
      source_url: resource.section_meta[index].source_url || resource.source_url,
      content: resource.sections[index],
    };
  });
  resource.read_sections = [...read].sort((a, b) => a - b);
  return sections;
}

export class ResourceStore {
  constructor(options = {}) {
    this.maxResources = Math.max(1, Math.trunc(Number(options.maxResources) || 64));
    this.maxBytes = Math.max(1_000_000, Math.trunc(Number(options.maxBytes) || 64 * 1024 * 1024));
    this.resources = new Map();
    this.bytes = 0;
  }

  set(resource) {
    const existing = this.resources.get(resource.id);
    if (existing) {
      this.bytes -= Buffer.byteLength(existing.content, "utf8");
      this.resources.delete(resource.id);
    }
    this.resources.set(resource.id, resource);
    this.bytes += Buffer.byteLength(resource.content, "utf8");
    this.#evict();
    return resource;
  }

  get(id) {
    const resource = this.resources.get(String(id));
    if (!resource) return null;
    this.resources.delete(resource.id);
    this.resources.set(resource.id, resource);
    return resource;
  }

  list() {
    return [...this.resources.values()].reverse();
  }

  #evict() {
    while (this.resources.size > 1 && (this.resources.size > this.maxResources || this.bytes > this.maxBytes)) {
      const oldestId = this.resources.keys().next().value;
      const oldest = this.resources.get(oldestId);
      this.resources.delete(oldestId);
      this.bytes -= Buffer.byteLength(oldest.content, "utf8");
    }
  }
}
