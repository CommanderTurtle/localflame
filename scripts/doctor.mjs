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
let dshProfile = process.env.DSH_PROFILE || "web";
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
if (!/^[A-Za-z0-9_-]+$/.test(dshProfile)) throw new Error("Invalid DSH profile name.");
const checks = [];

function check(target, name, pass, detail) {
  checks.push({ target, name, pass: Boolean(pass), detail });
}

function json(file) { return JSON.parse(readFileSync(file, "utf8")); }
function yaml(file) { return YAML.parse(readFileSync(file, "utf8")) || {}; }

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
    const config = existsSync(configPath) ? yaml(configPath) : {};
    check("omp", `${label} native search disabled`, config.web_search?.enabled === false, configPath);
    check("omp", `${label} native fetch disabled`, config.fetch?.enabled === false, configPath);
    check("omp", `${label} native skill absent`, !existsSync(path.join(dir, "skills", "localflame", "SKILL.md")), "Localflame is indexed cold by Retrieval");
  }
}

if (targets.includes("hermes")) {
  for (const profile of hermesProfiles()) {
    const configPath = path.join(profile.directory, "config.yaml");
    const config = existsSync(configPath) ? yaml(configPath) : {};
    const entry = config.mcp_servers?.localflame;
    if (profile.isolated) {
      check("hermes", `${profile.name} private profile preserved`, !entry, "librarian-okf profile has no Localflame MCP");
      continue;
    }
    check("hermes", `${profile.name} MCP entry`, Boolean(entry), configPath);
    check("hermes", `${profile.name} native web disabled`, config.agent?.disabled_toolsets?.includes("web"), "agent.disabled_toolsets includes web");
    check("hermes", `${profile.name} long timeout`, Number(entry?.timeout) >= 86400, `timeout=${entry?.timeout}`);
    check("hermes", `${profile.name} unlimited process lifetime`, Number(entry?.idle_timeout_seconds) === 0 && Number(entry?.max_lifetime_seconds) === 0, `idle=${entry?.idle_timeout_seconds}; lifetime=${entry?.max_lifetime_seconds}`);
    check("hermes", `${profile.name} native skill absent`, !existsSync(path.join(profile.directory, "skills", "web", "localflame", "SKILL.md")), "Localflame is indexed cold by Retrieval");
    for (const name of ["camofox-mcp", "camofox"]) {
      const camofox = config.mcp_servers?.[name];
      if (!camofox || typeof camofox !== "object") continue;
      const tools = camofox.tools && typeof camofox.tools === "object" ? camofox.tools : {};
      const searchHidden = Array.isArray(tools.include)
        ? !tools.include.includes("web_search")
        : Array.isArray(tools.exclude) && tools.exclude.includes("web_search");
      check("hermes", `${profile.name} Camofox search hidden`, searchHidden, `${name} keeps browser tools`);
    }
  }
}

if (targets.includes("dsh")) {
  const dshHome = path.resolve(process.env.DSH_HOME || path.join(home, ".dsh"));
  const composition = path.join(dshHome, ".agent-presets", "localflame", "agent.cordis.yml");
  const source = existsSync(composition) ? readFileSync(composition, "utf8") : "";
  check("dsh", "managed preset", Boolean(source), composition);
  check("dsh", "MCP entry", /@deepseek-ai\/dsh-mcp-client/.test(source), "managed preset uses official bridge");
  check("dsh", "native tool-web absent", !/^- id:\s*tool-web\s*$/m.test(source), "managed preset has no native web tool");
  const patchPath = path.join(dshHome, "profiles", dshProfile, "cordis.patch.yml");
  const patch = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
  check("dsh", "default selected", /default:\s*localflame/.test(patch), patchPath);
  const settingsPath = path.join(dshHome, "settings.yaml");
  const settings = existsSync(settingsPath) ? yaml(settingsPath) : {};
  check("dsh", "user default selected", settings["agent-presets"]?.default === "localflame", settingsPath);
  const legacy = path.join(dshHome, "profiles", dshProfile, "node_modules", "@local", "dsh-web-firecrawl");
  check("dsh", "legacy provider absent", !existsSync(legacy), "old private provider removed");
  check("dsh", "skill installed", existsSync(path.join(dshHome, "skills", "localflame", "SKILL.md")), "managed localflame skill");
}

if (jsonOutput) {
  console.log(JSON.stringify({ ok: checks.every((item) => item.pass), checks }, null, 2));
} else {
  for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.target.padEnd(7)} ${item.name} — ${item.detail}`);
  console.log(`\n${checks.filter((item) => item.pass).length}/${checks.length} checks passed; no network requests were made.`);
}
if (checks.some((item) => !item.pass)) process.exitCode = 1;
