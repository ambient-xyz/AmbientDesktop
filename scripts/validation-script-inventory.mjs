#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function buildValidationScriptInventory(packageJson, options = {}) {
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  const entries = Object.entries(scripts)
    .filter(([name]) => isValidationScriptName(name))
    .map(([name, command]) => validationScriptEntry(name, String(command)))
    .filter((entry) => validationScriptMatchesFilters(entry, options))
    .sort(compareValidationScriptEntries);

  const domains = [...new Set(entries.map((entry) => entry.domain))].sort();
  return {
    generatedFrom: "package.json scripts",
    scriptCount: entries.length,
    domains,
    liveProviderScriptCount: entries.filter((entry) => entry.liveProvider !== "none").length,
    gmiCloudScriptCount: entries.filter((entry) => entry.liveProvider === "gmi-cloud").length,
    entries,
  };
}

export function compareValidationScriptEntries(left, right) {
  return (
    left.domain.localeCompare(right.domain) ||
    validationCostRank(left.cost) - validationCostRank(right.cost) ||
    validationProviderRank(left.liveProvider) - validationProviderRank(right.liveProvider) ||
    Number(left.requiresSecrets) - Number(right.requiresSecrets) ||
    left.name.localeCompare(right.name)
  );
}

export function validationCostRank(cost) {
  return {
    "local-fast": 0,
    "local-medium": 1,
    "local-heavy": 2,
    "live-provider": 3,
  }[cost] ?? 99;
}

export function validationProviderRank(provider) {
  return {
    none: 0,
    "gmi-cloud": 1,
    ambient: 2,
    "provider-dependent": 3,
  }[provider] ?? 99;
}

export function recommendedValidationScriptEntries(report) {
  return report.domains
    .map((domain) => report.entries.find((entry) => entry.domain === domain && entry.liveProvider === "none" && !entry.requiresSecrets))
    .filter(Boolean);
}

export function validationScriptMatchesFilters(entry, options = {}) {
  if (options.domain && entry.domain !== options.domain) return false;
  if (options.cost && entry.cost !== options.cost) return false;
  if (options.liveProvider && entry.liveProvider !== options.liveProvider) return false;
  if (options.requiresSecrets !== undefined && entry.requiresSecrets !== options.requiresSecrets) return false;
  if (options.search) {
    const needle = options.search.toLowerCase();
    const haystack = `${entry.name}\n${entry.command}\n${entry.domain}\n${entry.cost}\n${entry.liveProvider}\n${entry.notes}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export function validationScriptEntry(name, command) {
  const liveProvider = classifyLiveProvider(name, command);
  const cost = classifyScriptCost(name, command, liveProvider);
  return {
    name,
    command,
    domain: classifyScriptDomain(name, command),
    cost,
    liveProvider,
    requiresSecrets: liveProvider !== "none" || /GMI_CLOUD_API_KEY|USE_SHARED_SNAPSHOT|credentialed/i.test(command) || /credentialed/i.test(name),
    notes: scriptNotes(name, command, { cost, liveProvider }),
  };
}

export function isValidationScriptName(name) {
  return (
    /^(test|validate|validation|verify)(:|$)/.test(name) ||
    name === "typecheck" ||
    name === "build" ||
    name === "pack" ||
    name === "preview" ||
    name === "dev:gmi-cloud" ||
    name === "complexity:inventory" ||
    name.startsWith("simplification:v2:") ||
    name.startsWith("simplification:v3:")
  );
}

export function classifyScriptDomain(name, command = "") {
  const text = `${name} ${command}`.toLowerCase();
  if (/project-board|kanban/.test(text)) return "project-board";
  if (/subagent|callable-workflow|symphony/.test(text)) return "subagents-workflows";
  if (/workflow/.test(text)) return "workflow";
  if (/local-deep-research/.test(text)) return "local-deep-research";
  if (/local-runtime|minicpm/.test(text)) return "local-runtime";
  if (/mcp|toolhive|agentos/.test(text)) return "mcp";
  if (/browser|web-research|scrapling/.test(text)) return "browser-web-research";
  if (/visual|ui-model|renderer|composer-controls/.test(text)) return "renderer-visual";
  if (/stt|tts|voice/.test(text)) return "speech";
  if (/plugin|marketplace/.test(text)) return "plugins";
  if (/security|dependency-audit/.test(text)) return "security";
  if (/packaged|electron-builder|build|pack|dist|native|runtime-architecture/.test(text)) return "packaging-native";
  if (/simplification|complexity/.test(text)) return "simplification";
  if (/chat-fix|ambient-live|aggressive-retries|desktop-release|e2e/.test(text)) return "desktop-runtime";
  return "general";
}

export function classifyLiveProvider(name, command = "") {
  const text = `${name} ${command}`.toLowerCase();
  if (/ambient_provider\s*=\s*gmi-cloud|\bgmi-cloud\b|\bgmi-live\b|:gmi\b/.test(text)) return "gmi-cloud";
  if (/ambient_provider\s*=\s*ambient\b/.test(text)) return "ambient";
  if (/\blive\b|:live\b|--include-live|--run-live|--require-live|_LIVE=1/.test(text)) return "provider-dependent";
  return "none";
}

export function classifyScriptCost(name, command = "", liveProvider = classifyLiveProvider(name, command)) {
  const text = `${name} ${command}`.toLowerCase();
  if (liveProvider !== "none") return "live-provider";
  if (/electron-builder|electron-vite build|xvfb|release-gate|graduation|dist\b|pack\b/.test(text)) return "local-heavy";
  if (name === "test" || /vitest run$/.test(command.trim())) return "local-heavy";
  if (/ && |node scripts\/.*gate|dogfood|benchmark|collect-current|compare-baseline/.test(text)) return "local-medium";
  return "local-fast";
}

export function validateValidationScriptInventory(report) {
  const issues = [];
  const byName = new Map(report.entries.map((entry) => [entry.name, entry]));
  for (const required of [
    "typecheck",
    "test",
    "dev:gmi-cloud",
    "test:project-board-pm-review-provider-fixtures",
    "test:project-board-release-gate:phase8",
  ]) {
    if (!byName.has(required)) issues.push(`Missing required inventory script: ${required}`);
  }
  if (!report.entries.some((entry) => entry.cost === "local-fast")) issues.push("Inventory should include local-fast scripts.");
  if (!report.entries.some((entry) => entry.cost === "live-provider")) issues.push("Inventory should include live-provider scripts.");
  if (!report.entries.some((entry) => entry.liveProvider === "gmi-cloud")) issues.push("Inventory should identify GMI Cloud scripts.");

  for (const entry of report.entries) {
    if (/\bgmi-cloud\b|\bgmi-live\b|:gmi\b/i.test(`${entry.name} ${entry.command}`) && entry.liveProvider !== "gmi-cloud") {
      issues.push(`Expected ${entry.name} to be classified as gmi-cloud.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function renderValidationScriptInventoryMarkdown(report) {
  const lines = [
    "# Validation Script Inventory",
    "",
    `Generated from ${report.generatedFrom}. ${report.scriptCount} validation-related scripts across ${report.domains.length} domains.`,
    `Live/provider-backed scripts: ${report.liveProviderScriptCount}; GMI Cloud scripts: ${report.gmiCloudScriptCount}.`,
    "",
  ];

  for (const domain of report.domains) {
    const entries = report.entries.filter((entry) => entry.domain === domain);
    lines.push(`## ${domain}`, "", "| Script | Cost | Provider | Secrets | Notes |", "| --- | --- | --- | --- | --- |");
    for (const entry of entries) {
      lines.push(`| \`${entry.name}\` | ${entry.cost} | ${entry.liveProvider} | ${entry.requiresSecrets ? "yes" : "no"} | ${entry.notes} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderValidationScriptRecommendationsMarkdown(report) {
  const lines = [
    "# Recommended Validation Scripts",
    "",
    `Generated from ${report.generatedFrom}. Showing the cheapest local, no-secret script for each included domain.`,
    "",
    "| Domain | Run | Cost | Notes |",
    "| --- | --- | --- | --- |",
  ];

  for (const entry of recommendedValidationScriptEntries(report)) {
    lines.push(`| ${entry.domain} | \`pnpm run ${entry.name}\` | ${entry.cost} | ${entry.notes} |`);
  }

  return lines.join("\n");
}

function scriptNotes(name, command, classification) {
  const notes = [];
  if (classification.liveProvider === "gmi-cloud") notes.push("uses GMI Cloud override");
  if (classification.liveProvider === "ambient") notes.push("uses Ambient provider directly");
  if (classification.liveProvider === "provider-dependent") notes.push("live/provider state required");
  if (/pnpm run typecheck|tsc --noEmit/.test(command) || name === "typecheck") notes.push("TypeScript check");
  if (/vitest run/.test(command)) notes.push("Vitest");
  if (/electron-builder|packaged/.test(command)) notes.push("packaging/native");
  if (/--compare-baseline|visual/i.test(command)) notes.push("visual baseline");
  if (/release-gate|gate/.test(name)) notes.push("gate");
  return notes.join("; ") || "local validation";
}

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
}

function parseArgs(argv) {
  const args = {
    json: false,
    check: false,
    recommend: false,
    domain: undefined,
    cost: undefined,
    liveProvider: undefined,
    requiresSecrets: undefined,
    search: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--json") args.json = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--recommend") args.recommend = true;
    else if (arg === "--local-only") args.liveProvider = "none";
    else if (arg === "--requires-secrets") args.requiresSecrets = true;
    else if (arg === "--no-secrets") args.requiresSecrets = false;
    else if (arg === "--domain") {
      args.domain = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--domain=")) {
      args.domain = arg.slice("--domain=".length);
    } else if (arg === "--cost") {
      args.cost = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--cost=")) {
      args.cost = arg.slice("--cost=".length);
    } else if (arg === "--provider") {
      args.liveProvider = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--provider=")) {
      args.liveProvider = arg.slice("--provider=".length);
    } else if (arg === "--search") {
      args.search = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--search=")) {
      args.search = arg.slice("--search=".length);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  validateFilterArg("cost", args.cost, ["local-fast", "local-medium", "local-heavy", "live-provider"]);
  validateFilterArg("provider", args.liveProvider, ["none", "ambient", "gmi-cloud", "provider-dependent"]);
  return args;
}

function validateFilterArg(label, value, allowedValues) {
  if (value === undefined) return;
  if (allowedValues.includes(value)) return;
  throw new Error(`Invalid ${label}: ${value}. Expected one of: ${allowedValues.join(", ")}`);
}

function usage() {
  return [
    "Usage: node scripts/validation-script-inventory.mjs [--json] [--check] [filters]",
    "",
    "Builds a generated inventory of validation-related package scripts grouped by domain, cost, and live-provider requirements.",
    "",
    "Views:",
    "  --recommend        Show the cheapest local, no-secret script per included domain",
    "",
    "Filters:",
    "  --domain <domain>",
    "  --cost <local-fast|local-medium|local-heavy|live-provider>",
    "  --provider <none|ambient|gmi-cloud|provider-dependent>",
    "  --local-only",
    "  --requires-secrets | --no-secrets",
    "  --search <text>",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const report = buildValidationScriptInventory(readPackageJson(), args);
  if (args.check) {
    const validation = validateValidationScriptInventory(report);
    if (!validation.ok) {
      process.stderr.write(`${validation.issues.join("\n")}\n`);
      process.exitCode = 1;
      return;
    }
  }
  if (args.recommend) {
    const recommendedEntries = recommendedValidationScriptEntries(report);
    process.stdout.write(
      args.json
        ? `${JSON.stringify({ ...report, recommendationCount: recommendedEntries.length, recommendedEntries }, null, 2)}\n`
        : `${renderValidationScriptRecommendationsMarkdown(report)}\n`,
    );
    return;
  }
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : renderValidationScriptInventoryMarkdown(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
