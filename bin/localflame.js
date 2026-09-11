#!/usr/bin/env bun

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildServer } from "../src/server.js";

process.on("uncaughtException", (error) => {
  process.stderr.write(`[localflame] ${error?.stack || error}\n`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  process.stderr.write(`[localflame] ${error?.stack || error}\n`);
  process.exitCode = 1;
});

serveStdio(() => buildServer(), {
  legacy: "serve",
  onerror: (error) => process.stderr.write(`[localflame] ${error?.stack || error}\n`),
});
