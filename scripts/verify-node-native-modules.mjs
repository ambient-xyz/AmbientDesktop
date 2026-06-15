#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const failures = [];

check("better-sqlite3", () => {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.prepare("select 1 as ok").get();
  db.close();
});

check("node-pty", () => {
  require("node-pty");
});

if (failures.length > 0) {
  console.error(`Native module verification failed for Node ABI ${process.versions.modules}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Native module verification passed for Node ABI ${process.versions.modules}.`);

function check(name, load) {
  try {
    load();
    console.log(`native module ok: ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
