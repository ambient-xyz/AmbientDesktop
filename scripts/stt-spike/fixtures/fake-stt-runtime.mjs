#!/usr/bin/env node
import { basename } from "node:path";
import { writeFile } from "node:fs/promises";

const args = parseArgs(process.argv.slice(2));
if (args.health) {
  process.stdout.write("ok\n");
  process.exit(0);
}

if (!args.audio) {
  process.stderr.write("Missing --audio\n");
  process.exit(2);
}

const text = args.text ?? `Fake transcript for ${basename(args.audio)}.`;
const payload = {
  text,
  language: args.language ?? "English",
  durationMs: args.durationMs ? Number(args.durationMs) : undefined,
  providerId: "fake-stt-runtime",
};

if (args.outputJson) {
  await writeFile(args.outputJson, `${JSON.stringify(payload, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(payload)}\n`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--health") {
      parsed.health = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

