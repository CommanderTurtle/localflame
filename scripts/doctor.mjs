#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const args = process.argv.slice(2);
const requested = [];
let dshProfile = process.env.DSH_PROFILE || "all";
let jsonOutput = false;
while (args.length) {
  const arg = args.shift();
  if (arg === "--target") requested.push(String(args.shift() || ""));
  else if (arg === "--dsh-profile") dshProfile = String(args.shift() || "");
  else if (arg === "--json") jsonOutput = true;
  else throw new Error(`Unknown option: ${arg}`);
}
const targets = !requested.length || requested.includes("all")
  ? ["omp", "hermes", "dsh"]
  : [...new Set(requested)];
const invalid = targets.filter((target) => !["omp", "hermes", "dsh"].includes(target));
if (invalid.length) throw new Error(`Unknown target: ${invalid.join(", ")}`);
if (dshProfile !== "all" && !/^[A-Za-z0-9_-]+$/.test(dshProfile)) throw new Error("Invalid DSH profile name.");
const checks = [];
const providerPolicyPath = path.join(home, ".local", "state", "localflame", "provider-policy.json");
const providerPolicy = existsSync(providerPolicyPath) ? json(providerPolicyPath) : {};

function check(target, name, pass, detail) {
  checks.push({ target, name, pass: Boolean(pass), detail });
}

function json(file) { return JSON.parse(readFileSync(file, "utf8")); }
function yaml(file) { return YAML.parse(readFileSync(file, "utf8")) || {}; }

function policyIncludes(client, directory) {
  return Array.isArray(providerPolicy[client])
    && providerPolicy[client].map((item) => path.resolve(String(item))).includes(path.resolve(directory));
}

function ompAgentDirectories() {
  const defaultDirectory = path.resolve(process.env.OMP_HOME || path.join(home, ".omp", "agent"));
  const result = [defaultDirectory];
  const ompRoot = path.basename(defaultDirectory) === "agent"
    ? path.dirname(defaultDirectory)
    : path.resolve(process.env.OMP_ROOT || path.join(home, ".omp"));
  const profilesRoot = path.join(ompRoot, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(profilesRoot, entry.name, "agent");
      const mcpPath = path.join(directory, "mcp.json");
      if (!existsSync(mcpPath)) continue;
      const servers = json(mcpPath).mcpServers;
      if (servers && typeof servers === "object"
          && (Object.hasOwn(servers, "retrieval")
              || Object.hasOwn(servers, "camofox")
              || Object.hasOwn(servers, "localflame"))) {
        result.push(directory);
      }
    }
  }
  return [...new Set(result.map((directory) => path.resolve(directory)))];
}

function ompIsolatedDirectories() {
  const defaultDirectory = path.resolve(process.env.OMP_HOME || path.join(home, ".omp", "agent"));
  const ompRoot = path.basename(defaultDirectory) === "agent"
    ? path.dirname(defaultDirectory)
    : path.resolve(process.env.OMP_ROOT || path.join(home, ".omp"));
  const profilesRoot = path.join(ompRoot, "profiles");
  if (!existsSync(profilesRoot)) return [];
  const ordinary = new Set(ompAgentDirectories());
  return readdirSync(profilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(profilesRoot, entry.name, "agent"))
    .filter((directory) => existsSync(path.join(directory, "mcp.json")) && !ordinary.has(directory));
}

function hermesProfiles() {
  const hermesHome = path.resolve(process.env.HERMES_HOME || path.join(home, ".hermes"));
  const result = [{ name: "default", directory: hermesHome, isolated: false }];
  const profilesRoot = path.join(hermesHome, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(profilesRoot, entry.name, "config.yaml"))) {
        const directory = path.join(profilesRoot, entry.name);
        const config = yaml(path.join(directory, "config.yaml"));
        result.push({
          name: entry.name,
          directory,
          isolated: Boolean(config.mcp_servers?.["librarian-okf"]),
        });
      }
    }
  }
  return result;
}

check("core", "entrypoint", existsSync(path.join(root, "bin", "localflame.js")), path.join(root, "bin", "localflame.js"));
check("core", "dependencies", existsSync(path.join(root, "node_modules", "@modelcontextprotocol", "server")), "official MCP server package installed");
check("core", "routing skill source", existsSync(path.join(root, "skills", "localflame", "SKILL.md")), "checked-in first-party router");

if (targets.includes("omp")) {
  for (const dir of ompAgentDirectories()) {
    const label = dir.endsWith(`${path.sep}.omp${path.sep}agent`)
      ? "default"
      : path.basename(path.dirname(dir));
    const mcpPath = path.join(dir, "mcp.json");
    const configPath = path.join(dir, "config.yml");
    const mcp = existsSync(mcpPath) ? json(mcpPath) : {};
    const entry = mcp.mcpServers?.localflame;
    check("omp", `${label} MCP entry`, Boolean(entry), mcpPath);
    check("omp", `${label} no timeout`, entry?.timeout === 0, `timeout=${entry?.timeout}`);
    check("omp", `${label} routing skill`, existsSync(path.join(dir, "skills", "localflame", "SKILL.md")), "persistent Localflame routing skill");
    check("omp", `${label} provider policy migrated`, policyIncludes("omp", dir), providerPolicyPath);
  }
  for (const dir of ompIsolatedDirectories()) {
    const label = path.basename(path.dirname(dir));
    const mcp = json(path.join(dir, "mcp.json"));
    check("omp", `${label} isolated MCP`, !mcp.mcpServers?.localflame, "profile outside ordinary external-tool stack");
    check("omp", `${label} isolated skill`, !existsSync(path.join(dir, "skills", "localflame", "SKILL.md")), "no Localflame routing skill");
  }
}

if (targets.includes("hermes")) {
  for (const profile of hermesProfiles()) {
    const configPath = path.join(profile.directory, "config.yaml");
    const config = existsSync(configPath) ? yaml(configPath) : {};
    const entry = config.mcp_servers?.localflame;
    if (profile.isolated) {
      check("hermes", `${profile.name} private profile preserved`, !entry, "librarian-okf profile has no Localflame MCP");
      check("hermes", `${profile.name} private skill preserved`, !existsSync(path.join(profile.directory, "skills", "web", "localflame", "SKILL.md")), "librarian-okf profile has no Localflame router");
      continue;
    }
    check("hermes", `${profile.name} MCP entry`, Boolean(entry), configPath);
    check("hermes", `${profile.name} long timeout`, Number(entry?.timeout) >= 86400, `timeout=${entry?.timeout}`);
    check("hermes", `${profile.name} unlimited process lifetime`, Number(entry?.idle_timeout_seconds) === 0 && Number(entry?.max_lifetime_seconds) === 0, `idle=${entry?.idle_timeout_seconds}; lifetime=${entry?.max_lifetime_seconds}`);
    check("hermes", `${profile.name} routing skill`, existsSync(path.join(profile.directory, "skills", "web", "localflame", "SKILL.md")), "persistent Localflame routing skill");
    check("hermes", `${profile.name} provider policy migrated`, policyIncludes("hermes", profile.directory), providerPolicyPath);
  }
}

if (targets.includes("dsh")) {
  const dshHome = path.resolve(process.env.DSH_HOME || path.join(home, ".dsh"));
  const managedRoot = path.join(dshHome, ".localflame-agent-presets");
  const installedRoot = path.resolve(process.env.DSH_PRESET_ROOT
    || path.join(home, ".bun", "install", "global", "node_modules", "@deepseek-ai", "dsh-agent-presets", "presets"));
  const presetIds = (directory) => existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(directory, entry.name, "agent.cordis.yml")))
      .map((entry) => entry.name).sort()
    : [];
  const installedIds = presetIds(installedRoot);
  const managedIds = presetIds(managedRoot);
  check("dsh", "managed preset roster", managedIds.length > 0, managedRoot);
  check("dsh", "complete preset roster", JSON.stringify(managedIds) === JSON.stringify(installedIds), `installed=${installedIds.join(",")}; managed=${managedIds.join(",")}`);
  for (const presetId of managedIds) {
    const composition = path.join(managedRoot, presetId, "agent.cordis.yml");
    const source = readFileSync(composition, "utf8");
    check("dsh", `${presetId} MCP entry`, /@deepseek-ai\/dsh-mcp-client/.test(source), composition);
    check("dsh", `${presetId} native tool-web absent`, !/^- id:\s*tool-web\s*$/m.test(source), composition);
  }
  const profilesRoot = path.join(dshHome, "profiles");
  const profileDirs = dshProfile === "all"
    ? (existsSync(profilesRoot) ? readdirSync(profilesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(profilesRoot, entry.name))
      .filter((directory) => existsSync(path.join(directory, "cordis.yml"))
        || existsSync(path.join(directory, "package.json"))
        || existsSync(path.join(directory, "cordis.patch.yml"))) : [])
    : [path.join(profilesRoot, dshProfile)];
  for (const profileDir of profileDirs) {
    const label = path.basename(profileDir);
    const patchPath = path.join(profileDir, "cordis.patch.yml");
    const patch = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
    check("dsh", `${label} managed policy`, patch.includes("# >>> localflame managed >>>") && patch.includes("# <<< localflame managed <<<"), patchPath);
    for (const id of ["web", "web-search-deepseek", "web-fetch-http", "tool-web"]) {
      check("dsh", `${label} ${id} disabled`, new RegExp(`- id: ${id}\\n\\s+disabled: true`).test(patch), patchPath);
    }
    check("dsh", `${label} strict preset root`, patch.includes(managedRoot) && /includeShippedRoot:\s*false/.test(patch) && /includeUserRoot:\s*false/.test(patch), patchPath);
    const legacy = path.join(profileDir, "node_modules", "@local", "dsh-web-firecrawl");
    check("dsh", `${label} legacy provider absent`, !existsSync(legacy), legacy);
  }
  const settingsPath = path.join(dshHome, "settings.yaml");
  const settings = existsSync(settingsPath) ? yaml(settingsPath) : {};
  check("dsh", "user default available", managedIds.includes(settings["agent-presets"]?.default), `${settingsPath}: ${settings["agent-presets"]?.default}`);
  check("dsh", "legacy single preset absent", !existsSync(path.join(dshHome, ".agent-presets", "localflame")), "old one-preset copy removed");
  check("dsh", "skill installed", existsSync(path.join(dshHome, "skills", "localflame", "SKILL.md")), "managed localflame skill");
  const serverSource = readFileSync(path.join(root, "src", "server.js"), "utf8");
  for (const tool of ["firecrawl_search", "firecrawl_scrape", "firecrawl_read", "firecrawl_find", "firecrawl_outline", "firecrawl_images", "firecrawl_resources"]) {
    const start = serverSource.indexOf(`registerTool("${tool}"`);
    const next = serverSource.indexOf("registerTool(\"", start + 1);
    const block = start >= 0 ? serverSource.slice(start, next >= 0 ? next : undefined) : "";
    check("dsh", `${tool} read-only`, /readOnlyHint:\s*true/.test(block), "available under DSH read-only permission preset");
  }
}

if (jsonOutput) {
  console.log(JSON.stringify({ ok: checks.every((item) => item.pass), checks }, null, 2));
} else {
  for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.target.padEnd(7)} ${item.name} — ${item.detail}`);
  console.log(`\n${checks.filter((item) => item.pass).length}/${checks.length} checks passed; no network requests were made.`);
}
if (checks.some((item) => !item.pass)) process.exitCode = 1;
