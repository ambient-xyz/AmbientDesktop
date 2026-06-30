#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = "docs/architecture.md";

const ownerGroups = [
  {
    owner: "agent-runtime",
    paths: ["src/main/agent-runtime"],
    responsibility: "Pi/Ambient session orchestration, tool registration, run lifecycle, and agent-facing domain facades.",
  },
  {
    owner: "subagents",
    paths: ["src/main/subagents"],
    responsibility: "Child-agent launch, lifecycle barriers, mailbox state, maturity evidence, and delegated tool policy.",
  },
  {
    owner: "workflow",
    paths: [
      "src/main/workflow",
      "src/main/workflow-compiler",
      "src/main/workflow-discovery",
      "src/main/workflow-program",
      "src/main/workflow-recording",
      "src/main/callable-workflow",
    ],
    responsibility: "Workflow recipes, runtime execution, compiler/discovery surfaces, recordings, and callable workflow launch cards.",
  },
  {
    owner: "project-board",
    paths: ["src/main/project-board", "src/main/orchestration"],
    responsibility: "Board planning, synthesis, task/action tools, planner-facing proof loops, and orchestration hooks.",
  },
  {
    owner: "projectStore",
    paths: ["src/main/projectStore"],
    responsibility: "Persisted workspace, thread, project-board, workflow, subagent repositories, and schema-facing facades.",
  },
  {
    owner: "messaging",
    paths: ["src/main/messaging", "src/main/telegram"],
    responsibility: "Remote messaging gateways and Telegram-specific bridge/runtime integration.",
  },
  {
    owner: "capability-builder",
    paths: ["src/main/capability-builder", "src/main/install-route"],
    responsibility: "Generated capability/package scaffolding and guided install-route setup.",
  },
  {
    owner: "browser",
    paths: ["src/main/browser", "src/main/web-research", "src/main/scrapling", "src/main/local-deep-research"],
    responsibility: "Browsing, page inspection, web research, Scrapling/default web capability, and local deep research flows.",
  },
  {
    owner: "desktop-tools",
    paths: ["src/main/desktop-tools", "src/main/terminal", "src/main/office", "src/main/pdf", "src/main/google-workspace"],
    responsibility: "First-party desktop tools plus document, office, PDF, terminal, and Google Workspace adapters.",
  },
  {
    owner: "ipc",
    paths: ["src/main/ipc", "src/main/project-runtime"],
    responsibility: "Main-process IPC registration, preload-facing method contracts, and project runtime IPC adapters.",
  },
  {
    owner: "mcp",
    paths: ["src/main/mcp", "src/main/mcp-autowire", "src/main/tool-runtime", "src/main/container-runtime"],
    responsibility: "MCP server catalog/install/runtime bridge, ToolHive/container runtime, and MCP autowire evaluation.",
  },
  {
    owner: "provider",
    paths: [
      "src/main/provider",
      "src/main/model-provider",
      "src/main/local-runtime",
      "src/main/local-llama",
      "src/main/mini-cpm",
      "src/main/stt",
      "src/main/voice",
      "src/main/media",
      "src/main/memory",
    ],
    responsibility: "Model/provider catalogs, local runtimes, speech/voice/media integrations, and memory provider bridges.",
  },
  {
    owner: "permissions",
    paths: ["src/main/permissions", "src/main/security", "src/main/privileged-action"],
    responsibility: "Deterministic permission policy, security boundaries, URL/path safety, and privileged action approvals.",
  },
  {
    owner: "core/platform",
    paths: [
      "src/main/agent",
      "src/main/ambient",
      "src/main/ambient-cli",
      "src/main/chat-export",
      "src/main/desktop-shell",
      "src/main/diagnostics",
      "src/main/git",
      "src/main/pi",
      "src/main/planner",
      "src/main/plugins",
      "src/main/session",
      "src/main/settings",
      "src/main/setup",
      "src/main/thread",
      "src/main/tokenization",
      "src/main/workspace",
    ],
    responsibility: "App composition, shell/session/workspace plumbing, plugin/planner adapters, diagnostics/export, and platform services.",
  },
];

const dependencyDirection =
  "Domains depend down on core/platform; cross-domain calls go through typed owner facades/contracts; renderer reaches main only through the preload/IPC contract.";

const whereRows = [
  ["New agent tool or run-loop behavior", "agent-runtime", "Add the domain contract/facade there, then wire any specific owner behind it."],
  ["Child agent lifecycle, wait barriers, or mailbox state", "subagents", "Keep launch, wait, cancellation, and maturity proof in the subagent owner."],
  ["Workflow recipe, compiler, discovery, or recording", "workflow", "Choose the workflow sub-owner first; use callable-workflow only for launch-card/task bridging."],
  ["Project board planning, synthesis, or proof", "project-board", "Use projectStore only for persistence and repository construction."],
  ["Persisted thread/workspace/project records", "projectStore", "Repository and schema changes live here; UI/read-model changes stay with their product owner."],
  ["Browser, web research, or page inspection", "browser", "Route Scrapling and local deep research through their browser-facing owner contracts."],
  ["MCP install/runtime/tool bridge", "mcp", "Keep ToolHive/container runtime behind MCP/tool-runtime contracts."],
  ["Provider catalog, local runtime, STT/TTS, or media provider", "provider", "Provider quirks belong in provider/local-runtime/speech/voice adapters, not central prompts."],
  ["Permission, security, or privileged action boundary", "permissions", "Put hard safety rules in permission/security validators and policies."],
  ["New renderer-to-main method", "ipc", "Define the typed IPC/preload contract first; renderer should not import main modules."],
  ["Right-panel or app-shell UI", "src/renderer/src", "Keep React state/UI ownership in renderer modules and call main only through preload APIs."],
];

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const check = args.includes("--check");
  const help = args.includes("--help") || args.includes("-h");
  if (help) {
    process.stdout.write("Usage: node scripts/generate-architecture-map.mjs [--check]\n");
    return;
  }

  const generated = renderArchitectureMap();
  const fullOutputPath = resolve(repoRoot, outputPath);
  if (check) {
    const existing = existsSync(fullOutputPath) ? readFileSync(fullOutputPath, "utf8") : "";
    if (existing !== generated) {
      process.stderr.write(`${outputPath} is stale. Run node scripts/generate-architecture-map.mjs and commit the result.\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${outputPath} is up to date.\n`);
    return;
  }

  writeFileSync(fullOutputPath, generated, "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
}

function renderArchitectureMap() {
  assertComplexityInventoryAvailable();
  assertOwnerGroupsCoverTree();
  assertReferencedPathsExist(whereRows.map(([, owner]) => owner).filter((owner) => owner.startsWith("src/")));

  return [
    "# Architecture Map",
    "",
    "<!-- Generated by `node scripts/generate-architecture-map.mjs`. Do not edit the generated owner tables by hand. -->",
    "",
    "This is the short orientation map for the post-simplification structure. It is a map, not a manual; use it to find the owner before making a change.",
    "",
    "## Dependency Direction",
    "",
    dependencyDirection,
    "",
    "```mermaid",
    "flowchart TB",
    '  Renderer["src/renderer UI"] --> Preload["preload / ambientDesktop contract"]',
    '  Preload --> IPC["src/main/ipc"]',
    '  IPC --> Domains["main domain owners"]',
    '  Domains --> Core["core/platform"]',
    '  Domains -. "typed owner facades/contracts" .-> Domains',
    "```",
    "",
    "## Main Owner Map",
    "",
    "| Owner | Paths | Responsibility |",
    "| --- | --- | --- |",
    ...ownerGroups.map((group) => `| \`${group.owner}\` | ${group.paths.map((path) => `\`${path}\``).join("<br>")} | ${group.responsibility} |`),
    "",
    "## Where Does X Live?",
    "",
    "| Change | Owner | Notes |",
    "| --- | --- | --- |",
    ...whereRows.map(([change, owner, notes]) => `| ${change} | \`${owner}\` | ${notes} |`),
    "",
    "## Checks",
    "",
    "- Refresh after owner-tree changes: `node scripts/generate-architecture-map.mjs`.",
    "- Verify the checked-in map: `node scripts/generate-architecture-map.mjs --check`.",
    "- Keep this file short; deep workflow, provider, and validation detail belongs in owner docs or `docs/active-plan-index.md`.",
    "",
  ].join("\n");
}

function assertComplexityInventoryAvailable() {
  const output = execFileSync(process.execPath, ["scripts/simplification-complexity-inventory.mjs", "--json", "--limit", "1"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(output);
  if (!Number.isFinite(report.sourceFileCount) || report.sourceFileCount <= 0) {
    throw new Error("complexity inventory did not return a source file count");
  }
}

function assertOwnerGroupsCoverTree() {
  const actualDirs = new Set(readdirSync(resolve(repoRoot, "src/main"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  const seen = new Map();

  for (const group of ownerGroups) {
    for (const path of group.paths) {
      const dir = topMainDir(path);
      if (!dir) throw new Error(`Owner path is not under src/main: ${path}`);
      if (!actualDirs.has(dir)) throw new Error(`Owner path does not exist: ${path}`);
      const existing = seen.get(dir);
      if (existing) throw new Error(`src/main/${dir} is assigned to both ${existing} and ${group.owner}`);
      seen.set(dir, group.owner);
    }
  }

  const missing = [...actualDirs].filter((dir) => !seen.has(dir)).sort();
  if (missing.length) {
    throw new Error(`Unmapped src/main owner directories: ${missing.map((dir) => `src/main/${dir}`).join(", ")}`);
  }
}

function assertReferencedPathsExist(paths) {
  for (const path of paths) {
    if (!existsSync(resolve(repoRoot, path))) throw new Error(`Referenced architecture path is missing: ${path}`);
  }
}

function topMainDir(path) {
  const normalized = relative(repoRoot, resolve(repoRoot, path)).replace(/\\/g, "/");
  const match = /^src\/main\/([^/]+)(?:\/|$)/.exec(normalized);
  return match?.[1];
}

main();
