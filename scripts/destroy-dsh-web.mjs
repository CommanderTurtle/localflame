#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configure = path.join(root, "scripts", "configure.mjs");

execFileSync(process.execPath, [
  configure,
  "install",
  "--target", "dsh",
  "--dsh-profile", "all",
  ...process.argv.slice(2),
], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
