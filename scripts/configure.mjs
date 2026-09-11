#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { normalizeFirecrawlUrl } from "../src/firecrawl.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANAGED_START = "# >>> localflame managed >>>";
const MANAGED_END = "# <<< localflame managed <<<";
const MAX_TIMER_MS = 2_147_483_647;
const PROVIDER_POLICY_SCHEMA = 1;

function usage() {
  return `Usage: bun scripts/configure.mjs [install|uninstall] [options]

  --target omp|hermes|dsh|all   target client; repeatable (default: all)
  --firecrawl-url URL           base URL (default: http://127.0.0.1:3002)
  --dsh-profile NAME|all        DSH boot profile (default: all)
  --dry-run                     show changes without writing
  --help                        show help

Environment: OMP_HOME, HERMES_HOME, DSH_HOME, DSH_PROFILE, DSH_PRESET_ROOT`;
}

function parseArgs(argv) {
  const out = {
    action: "install", targets: [], dryRun: false,
    firecrawlUrl: process.env.LOCALFLAME_BASE_URL || process.env.FIRECRAWL_API_URL || "http://127.0.0.1:3002",
    dshProfile: process.env.DSH_PROFILE || "all",
  };
  const args = [...argv];
  if (["install", "uninstall"].includes(args[0])) out.action = args.shift();
  while (args.length) {
    const arg = args.shift();
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--target") out.targets.push(String(args.shift() || ""));
    else if (arg === "--firecrawl-url") out.firecrawlUrl = String(args.shift() || "");
    else if (arg === "--dsh-profile") out.dshProfile = String(args.shift() || "");
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!out.targets.length || out.targets.includes("all")) out.targets = ["omp", "hermes", "dsh"];
  out.targets = [...new Set(out.targets)];
  const invalid = out.targets.filter((value) => !["omp", "hermes", "dsh"].includes(value));
  if (invalid.length) throw new Error(`Unknown target: ${invalid.join(", ")}`);
  if (out.dshProfile !== "all" && !/^[A-Za-z0-9_-]+$/.test(out.dshProfile)) {
    throw new Error("Invalid DSH profile name.");
  }
  out.firecrawlUrl = normalizeFirecrawlUrl(out.firecrawlUrl).replace(/\/v2$/, "");
  return out;
}

const options = parseArgs(process.argv.slice(2));
const home = os.homedir();
const ompHome = path.resolve(process.env.OMP_HOME || path.join(home, ".omp", "agent"));
const hermesHome = path.resolve(process.env.HERMES_HOME || path.join(home, ".hermes"));
const dshHome = path.resolve(process.env.DSH_HOME || path.join(home, ".dsh"));
const runtimeCommand = process.execPath;
const serverEntry = path.join(REPO_ROOT, "bin", "localflame.js");
const dshSkillSource = path.join(REPO_ROOT, "SKILL.md");
const routingSkillSource = path.join(REPO_ROOT, "skills", "localflame", "SKILL.md");
const backupRoot = path.join(home, ".local", "state", "localflame", "backups");
const providerPolicyStatePath = path.join(home, ".local", "state", "localflame", "provider-policy.json");
const dshManagedPresetRoot = path.join(dshHome, ".localflame-agent-presets");
let backupStamp = "";

function log(message) {
  process.stdout.write(`${options.dryRun ? "[dry-run] " : ""}${message}\n`);
}

function ensureDirectory(dir) {
  if (!options.dryRun) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function backup(file) {
  if (!existsSync(file) || options.dryRun) return;
  if (!backupStamp) backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = file.replace(/^[/\\]+/, "").replace(/:/g, "");
  const destination = path.join(backupRoot, backupStamp, relative);
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(file, destination);
}

function atomicWrite(file, content, mode = 0o600) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (existing === normalized) {
    log(`unchanged ${file}`);
    return false;
  }
  log(`${existing === null ? "create" : "update"} ${file}`);
  if (options.dryRun) return true;
  ensureDirectory(path.dirname(file));
  backup(file);
  const temporary = `${file}.localflame-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(temporary, normalized, { mode });
  renameSync(temporary, file);
  chmodSync(file, mode);
  return true;
}

function readJson(file, fallback = {}) {
  if (!existsSync(file)) return structuredClone(fallback);
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (cause) { throw new Error(`Cannot parse JSON ${file}: ${cause.message}`); }
}

function readYamlDocument(file) {
  const source = existsSync(file) ? readFileSync(file, "utf8") : "{}\n";
  const document = YAML.parseDocument(source);
  if (document.errors.length) {
    throw new Error(`Cannot parse YAML ${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  if (document.contents === null) document.contents = document.createNode({});
  return document;
}

function writeYamlDocument(file, document) {
  return atomicWrite(file, document.toString({ lineWidth: 0 }));
}

function runClient(command, args, environment = {}) {
  log(`run ${[command, ...args].map((value) => JSON.stringify(value)).join(" ")}`);
  if (options.dryRun) return;
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
}

function installSkill(source, file) {
  if (!existsSync(source)) throw new Error(`Skill source is missing: ${source}`);
  atomicWrite(file, readFileSync(source, "utf8"), 0o644);
}

function uninstallSkill(source, file) {
  if (!existsSync(file)) return;
  if (!existsSync(source) || readFileSync(file, "utf8") !== readFileSync(source, "utf8")) {
    log(`retain modified skill ${file}`);
    return;
  }
  log(`remove managed skill ${file}`);
  if (!options.dryRun) rmSync(file, { force: true });
}

function hermesSkillFiles() {
  const files = [path.join(hermesHome, "skills", "web", "localflame", "SKILL.md")];
  const profiles = path.join(hermesHome, "profiles");
  if (existsSync(profiles)) {
    for (const entry of readdirSync(profiles, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        files.push(path.join(profiles, entry.name, "skills", "web", "localflame", "SKILL.md"));
      }
    }
  }
  return files;
}

function providerPolicyState() {
  const state = readJson(providerPolicyStatePath, {});
  return {
    schema_version: PROVIDER_POLICY_SCHEMA,
    omp: Array.isArray(state.omp) ? state.omp.map(String) : [],
    hermes: Array.isArray(state.hermes) ? state.hermes.map(String) : [],
  };
}

function providerPolicyMigrated(client, directory) {
  return providerPolicyState()[client].includes(path.resolve(directory));
}

function markProviderPolicyMigrated(client, directory) {
  if (options.dryRun) return;
  const state = providerPolicyState();
  const resolved = path.resolve(directory);
  state[client] = [...new Set([...state[client], resolved])].sort();
  atomicWrite(providerPolicyStatePath, JSON.stringify(state, null, 2));
}

function ompAgentDirectories({ includeOnlyConfigured = false } = {}) {
  const directories = [ompHome];
  const ompRoot = path.basename(ompHome) === "agent"
    ? path.dirname(ompHome)
    : path.resolve(process.env.OMP_ROOT || path.join(home, ".omp"));
  const profilesRoot = path.join(ompRoot, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(profilesRoot, entry.name, "agent");
      const mcpPath = path.join(directory, "mcp.json");
      if (!existsSync(mcpPath)) continue;
      const servers = readJson(mcpPath, {}).mcpServers;
      if (!servers || typeof servers !== "object") continue;
      // Empty auditor/scout profiles and Librarian's private OKF worker are
      // deliberately isolated.  Join only profiles that already use the
      // ordinary external-tool stack, or profiles previously managed here.
      if (Object.hasOwn(servers, "retrieval")
          || Object.hasOwn(servers, "camofox")
          || Object.hasOwn(servers, "localflame")) {
        directories.push(directory);
      }
    }
  }
  const unique = [...new Set(directories.map((directory) => path.resolve(directory)))];
  if (!includeOnlyConfigured) return unique;
  return unique.filter((directory) => existsSync(path.join(directory, "mcp.json")));
}

function installOmpAgent(directory) {
  const mcpPath = path.join(directory, "mcp.json");
  const mcp = readJson(mcpPath, {
    $schema: "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
    mcpServers: {},
  });
  mcp.mcpServers = mcp.mcpServers && typeof mcp.mcpServers === "object" ? mcp.mcpServers : {};
  const legacyPolicy = Object.hasOwn(mcp.mcpServers, "localflame")
    && !providerPolicyMigrated("omp", directory);
  mcp.mcpServers.localflame = {
    type: "stdio", command: runtimeCommand, args: [serverEntry], cwd: REPO_ROOT,
    env: { FIRECRAWL_API_URL: options.firecrawlUrl }, enabled: true, timeout: 0,
  };
  if (Array.isArray(mcp.disabledServers)) mcp.disabledServers = mcp.disabledServers.filter((name) => name !== "localflame");
  atomicWrite(mcpPath, JSON.stringify(mcp, null, 2));

  const omp = commandPath("omp");
  if (!omp) throw new Error("OMP is not on PATH; cannot apply its native settings contract.");
  const ompEnv = { PI_CODING_AGENT_DIR: directory };
  if (legacyPolicy) {
    log(`restore OMP web-provider defaults previously changed by Localflame in ${directory}`);
    runClient(omp, ["config", "reset", "web_search.enabled"], ompEnv);
    runClient(omp, ["config", "reset", "fetch.enabled"], ompEnv);
  }
  runClient(omp, ["config", "set", "mcp.renderMarkdownResults", "true"], ompEnv);
  installSkill(routingSkillSource, path.join(directory, "skills", "localflame", "SKILL.md"));
  markProviderPolicyMigrated("omp", directory);
}

function installOmp() {
  for (const directory of ompAgentDirectories()) installOmpAgent(directory);
}

function uninstallOmp() {
  for (const directory of ompAgentDirectories({ includeOnlyConfigured: true })) {
    const mcpPath = path.join(directory, "mcp.json");
    const mcp = readJson(mcpPath, {});
    if (mcp.mcpServers && Object.hasOwn(mcp.mcpServers, "localflame")) {
      delete mcp.mcpServers.localflame;
      atomicWrite(mcpPath, JSON.stringify(mcp, null, 2));
    } else log(`not present OMP MCP entry localflame in ${directory}`);
    uninstallSkill(routingSkillSource, path.join(directory, "skills", "localflame", "SKILL.md"));
  }
}

function hermesProfiles({ includeOnlyConfigured = false } = {}) {
  const profiles = [{ name: "default", directory: hermesHome }];
  const profilesRoot = path.join(hermesHome, "profiles");
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(profilesRoot, entry.name);
      if (existsSync(path.join(directory, "config.yaml"))) {
        profiles.push({ name: entry.name, directory });
      }
    }
  }
  if (includeOnlyConfigured) {
    return profiles.filter(({ directory }) => {
      const configPath = path.join(directory, "config.yaml");
      if (!existsSync(configPath)) return false;
      const config = readYamlDocument(configPath).toJS() || {};
      return Boolean(config.mcp_servers?.localflame);
    });
  }
  return profiles.filter(({ name, directory }) => {
    if (name === "default") return true;
    const config = readYamlDocument(path.join(directory, "config.yaml")).toJS() || {};
    // Librarian's delegated profile is a private capability boundary.  It may
    // expose only deterministic librarian-okf operations, so a general web
    // server must not be added by a blanket Hermes integration pass.
    return !config.mcp_servers?.["librarian-okf"];
  });
}

function hermesArguments(profile, args) {
  return profile === "default" ? args : ["--profile", profile, ...args];
}

function installHermesProfile(profile) {
  const configPath = path.join(profile.directory, "config.yaml");
  const document = readYamlDocument(configPath);
  const config = document.toJS() || {};
  const server = {
    command: runtimeCommand, args: [serverEntry], cwd: REPO_ROOT,
    env: { FIRECRAWL_API_URL: options.firecrawlUrl }, enabled: true,
    timeout: 86400, connect_timeout: 60, idle_timeout_seconds: 0,
    max_lifetime_seconds: 0, supports_parallel_tool_calls: true,
    tools: { prompts: false, resources: false },
  };
  const legacyPolicy = Boolean(config.mcp_servers?.localflame)
    && !providerPolicyMigrated("hermes", profile.directory);
  const hermes = commandPath("hermes");
  if (!hermes) throw new Error("Hermes is not on PATH; cannot apply its native configuration contract.");
  const hermesEnv = { HERMES_HOME: hermesHome };
  runClient(hermes, hermesArguments(profile.name, ["config", "set", "--force", "mcp_servers.localflame", JSON.stringify(server)]), hermesEnv);
  if (legacyPolicy) restoreHermesWebProviders(profile, config, hermes, hermesEnv);
  installSkill(routingSkillSource, path.join(profile.directory, "skills", "web", "localflame", "SKILL.md"));
  markProviderPolicyMigrated("hermes", profile.directory);
}

function restoreHermesWebProviders(profile, config, hermes, hermesEnv) {
  log(`restore Hermes web providers previously changed by Localflame in ${profile.name}`);
  const disabled = Array.isArray(config.agent?.disabled_toolsets)
    ? config.agent.disabled_toolsets.filter((name) => name !== "web")
    : [];
  const disabledArgs = disabled.length
    ? ["config", "set", "--force", "agent.disabled_toolsets", JSON.stringify(disabled)]
    : ["config", "unset", "agent.disabled_toolsets"];
  runClient(hermes, hermesArguments(profile.name, disabledArgs), hermesEnv);

  for (const name of ["camofox-mcp", "camofox"]) {
    const camofox = config.mcp_servers?.[name];
    if (!camofox || typeof camofox !== "object") continue;
    const currentTools = camofox.tools && typeof camofox.tools === "object"
      ? structuredClone(camofox.tools)
      : {};
    if (Array.isArray(currentTools.exclude)) {
      currentTools.exclude = currentTools.exclude.filter((tool) => tool !== "web_search");
      if (!currentTools.exclude.length) delete currentTools.exclude;
    }
    const toolArgs = Object.keys(currentTools).length
      ? ["config", "set", "--force", `mcp_servers.${name}.tools`, JSON.stringify(currentTools)]
      : ["config", "unset", `mcp_servers.${name}.tools`];
    runClient(hermes, hermesArguments(profile.name, toolArgs), hermesEnv);
  }
}

function installHermes() {
  for (const profile of hermesProfiles()) installHermesProfile(profile);
}

function uninstallHermes() {
  const hermes = commandPath("hermes");
  if (!hermes) throw new Error("Hermes is not on PATH; cannot remove its MCP entry through the native config command.");
  for (const profile of hermesProfiles({ includeOnlyConfigured: true })) {
    const configPath = path.join(profile.directory, "config.yaml");
    const config = readYamlDocument(configPath).toJS() || {};
    if (config.mcp_servers && Object.hasOwn(config.mcp_servers, "localflame")) {
      runClient(hermes, hermesArguments(profile.name, ["config", "unset", "mcp_servers.localflame"]), { HERMES_HOME: hermesHome });
    } else log(`not present Hermes MCP entry localflame in ${profile.name}`);
  }
  for (const file of hermesSkillFiles()) uninstallSkill(routingSkillSource, file);
  log("Hermes web providers are not changed by Localflame uninstall.");
}

function commandPath(name) {
  try { return execFileSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

function findDshPresetRoot() {
  const candidates = [];
  if (process.env.DSH_PRESET_ROOT) candidates.push(path.resolve(process.env.DSH_PRESET_ROOT));
  candidates.push(path.join(home, ".bun", "install", "global", "node_modules", "@deepseek-ai", "dsh-agent-presets", "presets"));
  const dsh = commandPath("dsh");
  if (dsh) {
    try {
      const target = realpathSync(dsh);
      for (let cursor = path.dirname(target); cursor !== path.dirname(cursor); cursor = path.dirname(cursor)) {
        if (path.basename(cursor) === "dsh" && path.basename(path.dirname(cursor)) === "@deepseek-ai") {
          candidates.push(path.join(path.dirname(cursor), "dsh-agent-presets", "presets"));
          break;
        }
      }
    } catch {}
  }
  return candidates.find((candidate) => existsSync(path.join(candidate, "standard", "agent.cordis.yml"))) || "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeManagedText(text) {
  return text.replace(new RegExp(`${escapeRegExp(MANAGED_START)}[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\n?`, "g"), "").trimEnd();
}

function splitTopLevelRows(text) {
  const lines = text.split(/(?<=\n)/);
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    if (/^- (?:id|insert):/.test(line)) starts.push(offset);
    offset += line.length;
  }
  if (!starts.length) return [{ text, start: 0, end: text.length }];
  const rows = starts[0] > 0 ? [{ text: text.slice(0, starts[0]), start: 0, end: starts[0] }] : [];
  return rows.concat(starts.map((start, index) => {
    const end = starts[index + 1] ?? text.length;
    return { text: text.slice(start, end), start, end };
  }));
}

function removeLegacyDshRows(text) {
  return splitTopLevelRows(removeManagedText(text))
    .filter((row) => {
      if (/^- id:\s*web\s*$/m.test(row.text) && /(?:search|fetch)Provider:\s*firecrawl-local/.test(row.text)) return false;
      if (/web-firecrawl-local|@local\/dsh-web-firecrawl/.test(row.text)) return false;
      return true;
    })
    .map((row) => row.text).join("").trimEnd();
}

function quoteYaml(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function dshPresetComposition(source) {
  const body = splitTopLevelRows(source)
    .filter((row) => !/^- id:\s*tool-web\s*$/m.test(row.text))
    .map((row) => row.text).join("").trimEnd();
  return `${body}\n\n# Firecrawl-only web surface managed by localflame.\n- id: mcp-localflame\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: localflame\n    transport: stdio\n    command: ${quoteYaml(runtimeCommand)}\n    args:\n      - ${quoteYaml(serverEntry)}\n    cwd: ${quoteYaml(REPO_ROOT)}\n    env:\n      FIRECRAWL_API_URL: ${quoteYaml(options.firecrawlUrl)}\n    toolCallTimeoutMs: ${MAX_TIMER_MS}\n    failOnStartupError: false\n    reconnect:\n      enabled: true\n      initialDelayMs: 500\n      maxDelayMs: 30000\n      maxAttempts: 1000000\n`;
}

function dshProfilePatch(source) {
  const clean = removeLegacyDshRows(source);
  const managed = `${MANAGED_START}\n# Replace every selectable preset with an upgrade-regenerated copy whose only\n# web surface is Localflame. Disable the host web registry as well as its\n# providers so changing presets cannot restore DeepSeek search or HTTP fetch.\n- id: web\n  disabled: true\n\n- id: web-search-deepseek\n  disabled: true\n\n- id: web-fetch-http\n  disabled: true\n\n- id: tool-web\n  disabled: true\n\n- id: agent-presets\n  config:\n    default: standard\n    roots:\n      - path: ${quoteYaml(dshManagedPresetRoot)}\n        trust: user\n    includeShippedRoot: false\n    includeUserRoot: false\n${MANAGED_END}`;
  return `${clean}${clean ? "\n\n" : ""}${managed}\n`;
}

function dshProfileDirectories({ onlyManaged = false } = {}) {
  const profilesRoot = path.join(dshHome, "profiles");
  if (options.dshProfile !== "all") {
    const directory = path.join(profilesRoot, options.dshProfile);
    if (!existsSync(directory) && !options.dryRun) {
      throw new Error(`DSH profile does not exist: ${directory}`);
    }
    return [directory];
  }
  if (!existsSync(profilesRoot)) {
    if (options.dryRun) return [];
    throw new Error(`DSH profiles directory does not exist: ${profilesRoot}`);
  }
  const directories = readdirSync(profilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(profilesRoot, entry.name))
    .filter((directory) => existsSync(path.join(directory, "cordis.yml"))
      || existsSync(path.join(directory, "package.json"))
      || existsSync(path.join(directory, "cordis.patch.yml")));
  if (!onlyManaged) return directories;
  return directories.filter((directory) => {
    const patchPath = path.join(directory, "cordis.patch.yml");
    return existsSync(patchPath) && readFileSync(patchPath, "utf8").includes(MANAGED_START);
  });
}

function dshPresetIds(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()
      && existsSync(path.join(root, entry.name, "agent.cordis.yml")))
    .map((entry) => entry.name)
    .sort();
}

function regenerateDshPresetRoot(sourceRoot) {
  const presetIds = dshPresetIds(sourceRoot);
  if (!presetIds.length) throw new Error(`DSH preset root contains no presets: ${sourceRoot}`);
  log(`regenerate ${dshManagedPresetRoot} from ${sourceRoot} (${presetIds.join(", ")})`);
  if (options.dryRun) return presetIds;

  ensureDirectory(path.dirname(dshManagedPresetRoot));
  const temporary = `${dshManagedPresetRoot}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  cpSync(sourceRoot, temporary, { recursive: true, dereference: true });
  for (const presetId of presetIds) {
    const composition = path.join(temporary, presetId, "agent.cordis.yml");
    writeFileSync(composition, dshPresetComposition(readFileSync(composition, "utf8")), { mode: 0o600 });
  }
  if (existsSync(dshManagedPresetRoot)) rmSync(dshManagedPresetRoot, { recursive: true, force: true });
  renameSync(temporary, dshManagedPresetRoot);
  chmodSync(dshManagedPresetRoot, 0o700);
  return presetIds;
}

function installDsh() {
  const presetRoot = findDshPresetRoot();
  if (!presetRoot) throw new Error("Could not find DSH's installed Standard preset. Set DSH_PRESET_ROOT and re-run.");
  const presetIds = regenerateDshPresetRoot(presetRoot);
  for (const profileDir of dshProfileDirectories()) {
    const patchPath = path.join(profileDir, "cordis.patch.yml");
    const patch = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
    atomicWrite(patchPath, dshProfilePatch(patch));

    const legacy = path.join(profileDir, "node_modules", "@local", "dsh-web-firecrawl");
    if (existsSync(legacy)) {
      log(`remove obsolete DSH-private provider ${legacy}`);
      if (!options.dryRun) rmSync(legacy, { recursive: true, force: true });
    }
  }

  const settingsPath = path.join(dshHome, "settings.yaml");
  const settings = readYamlDocument(settingsPath);
  const selected = String(settings.getIn(["agent-presets", "default"]) || "standard");
  settings.setIn(["agent-presets", "default"], presetIds.includes(selected) ? selected : "standard");
  writeYamlDocument(settingsPath, settings);
  installSkill(dshSkillSource, path.join(dshHome, "skills", "localflame", "SKILL.md"));

  const legacyPreset = path.join(dshHome, ".agent-presets", "localflame");
  if (existsSync(legacyPreset)) {
    log(`remove obsolete single-preset copy ${legacyPreset}`);
    if (!options.dryRun) rmSync(legacyPreset, { recursive: true, force: true });
  }
}

function uninstallDsh() {
  if (existsSync(dshManagedPresetRoot)) {
    log(`remove managed preset root ${dshManagedPresetRoot}`);
    if (!options.dryRun) rmSync(dshManagedPresetRoot, { recursive: true, force: true });
  }
  uninstallSkill(dshSkillSource, path.join(dshHome, "skills", "localflame", "SKILL.md"));
  for (const profileDir of dshProfileDirectories({ onlyManaged: true })) {
    const patchPath = path.join(profileDir, "cordis.patch.yml");
    atomicWrite(patchPath, removeManagedText(readFileSync(patchPath, "utf8")));
  }
  const settingsPath = path.join(dshHome, "settings.yaml");
  if (existsSync(settingsPath)) {
    const settings = readYamlDocument(settingsPath);
    if (settings.getIn(["agent-presets", "default"]) === "localflame") {
      settings.setIn(["agent-presets", "default"], "standard");
      writeYamlDocument(settingsPath, settings);
    }
  }
  log("DSH strict web rows were removed; any pre-existing profile rows now take effect again.");
}

const handlers = {
  install: { omp: installOmp, hermes: installHermes, dsh: installDsh },
  uninstall: { omp: uninstallOmp, hermes: uninstallHermes, dsh: uninstallDsh },
};

if (!existsSync(serverEntry)) throw new Error(`MCP entrypoint is missing: ${serverEntry}`);
for (const target of options.targets) {
  log(`${options.action} ${target}`);
  handlers[options.action][target]();
}
if (backupStamp) log(`backups: ${path.join(backupRoot, backupStamp)}`);
