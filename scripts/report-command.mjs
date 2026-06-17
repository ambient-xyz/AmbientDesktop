#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const MAX_LINES = 240;
const [label, command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: node scripts/report-command.mjs <label> <command> [...args]");
}

function boundedText(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length <= MAX_LINES) {
    return text;
  }

  const headCount = Math.ceil(MAX_LINES / 2);
  const tailCount = Math.floor(MAX_LINES / 2);
  const omitted = lines.length - headCount - tailCount;
  return [...lines.slice(0, headCount), `[report-command] omitted ${omitted} lines from ${label} output`, ...lines.slice(-tailCount)].join(
    "\n",
  );
}

if (!label || !command) {
  usage();
  process.exit(1);
}

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === "win32",
});

const output = [result.stdout, result.stderr].filter(Boolean).join("");
if (output.length > 0) {
  process.stdout.write(boundedText(output));
  if (!output.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

if (result.error) {
  console.error(`[${label}] could not run report command: ${result.error.message}`);
  process.exit(1);
}

if (result.status && result.status !== 0) {
  console.log(`[${label}] exited ${result.status}; continuing because this Phase 6 lane is report-only.`);
}
