#!/usr/bin/env node
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  join(repoRoot, "gmicloud-api-key.txt"),
  join(dirname(repoRoot), "gmicloud-api-key.txt"),
  join(dirname(repoRoot), "ambientCoder", "gmicloud-api-key.txt"),
  join(homedir(), "ambientCoder", "gmicloud-api-key.txt"),
  join(homedir(), "Documents", "ambientCoder", "gmicloud-api-key.txt"),
];

const match = candidates.find((candidate) => existsSync(candidate));
if (match) process.stdout.write(match);
