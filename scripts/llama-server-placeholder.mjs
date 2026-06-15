#!/usr/bin/env node

if (process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_PLACEHOLDER !== "1") {
  process.stderr.write("llama-server-placeholder is only for sub-agent Desktop dogfood.\n");
  process.exit(1);
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

setInterval(() => {
  // Keep the placeholder resident long enough for runtime inventory discovery.
}, 30_000);
