#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const V3_HOTSPOTS = [
  {
    id: "right-panel-shell",
    phase: 1,
    owner: "renderer-shell",
    label: "RightPanel shell",
    file: "src/renderer/src/RightPanel.tsx",
    declaration: { kind: "FunctionDeclaration", name: "RightPanel" },
    baseline: { fileLines: 14326, declarationLines: 8639 },
    budget: { fileLines: 15200, declarationLines: 9200 },
    validationDomain: "renderer-visual",
    validationCommand: "pnpm run test:ui-model",
    firstParityCommand:
      "pnpm run test:ui-model -- --scenario=main-shell-desktop,main-shell-compact,model-selector-open,api-key-dialog-open,permission-dialog-open --isolate-scenarios",
    desiredFirstPassDirection: "Move artifact, tool/status, diagnostics, local runtime, and composer-control panes behind explicit props.",
    firstExtractionTarget: "RightPanel artifact/tool/status pane ownership with parent state preserved.",
    statusNote: "Phase 0 baseline installed before V3 renderer extraction.",
  },
  {
    id: "app-shell",
    phase: 1,
    owner: "renderer-shell",
    label: "App shell",
    file: "src/renderer/src/App.tsx",
    declaration: { kind: "FunctionDeclaration", name: "App" },
    baseline: { fileLines: 9054, declarationLines: 7659 },
    budget: { fileLines: 9800, declarationLines: 8300 },
    validationDomain: "renderer-visual",
    validationCommand: "pnpm run test:ui-model",
    firstParityCommand:
      "pnpm run test:ui-model -- --scenario=main-shell-desktop,main-shell-medium,main-shell-compact,settings-search-active,workflow-recordings-home,browser-picker-active,plugin-import-candidate-visible --isolate-scenarios",
    desiredFirstPassDirection: "Split workspace routing, modal host, global effects, status subscriptions, and shell controls.",
    firstExtractionTarget: "App workspace router and modal host shells with existing subscriptions intact.",
    statusNote: "Phase 0 baseline installed before V3 app-shell extraction.",
  },
  {
    id: "automations-workspace",
    phase: 2,
    owner: "renderer-workspace",
    label: "Automations workspace",
    file: "src/renderer/src/AutomationsWorkspace.tsx",
    declaration: { kind: "FunctionDeclaration", name: "AutomationsWorkspace" },
    baseline: { fileLines: 11373, declarationLines: 7267 },
    budget: { fileLines: 12200, declarationLines: 7900 },
    validationDomain: "renderer-visual",
    validationCommand: "pnpm run test:ui-model",
    firstParityCommand:
      "pnpm run test:ui-model -- --scenario=local-tasks-many-items-desktop,local-tasks-long-names-compact,local-tasks-edit-card-open --isolate-scenarios",
    desiredFirstPassDirection: "Move in-file automation views into owned files, then extract schedule, editor, run-history, and dispatch helpers.",
    firstExtractionTarget: "Automation schedule/editor/run-history view modules with parent command wiring unchanged.",
    statusNote: "Phase 0 baseline installed before V3 automation workspace extraction.",
  },
  {
    id: "project-board-workspace",
    phase: 2,
    owner: "renderer-workspace",
    label: "ProjectBoard workspace",
    file: "src/renderer/src/ProjectBoardWorkspace.tsx",
    declaration: { kind: "FunctionDeclaration", name: "ProjectBoardWorkspace" },
    baseline: { fileLines: 11633, declarationLines: 1276 },
    budget: { fileLines: 12500, declarationLines: 1600 },
    validationDomain: "project-board",
    validationCommand: "pnpm run test:project-board-evidentiary-fixes",
    firstParityCommand:
      "pnpm run test:ui-model -- --scenario=project-board-desktop,project-board-medium,project-board-compact,project-board-long-names-desktop,project-board-long-names-compact,project-board-many-cards-25-desktop,project-board-many-cards-25-compact,project-board-draft-detail-open,project-board-pm-review-open --isolate-scenarios",
    desiredFirstPassDirection: "Move board shell, lane rendering, active card detail, candidate detail, evidence panels, and action menus behind stable props.",
    firstExtractionTarget: "Project board shell and active-card detail components with existing UI model inputs.",
    statusNote: "Phase 0 baseline installed before V3 project-board workspace extraction.",
  },
  {
    id: "project-board-ui-model",
    phase: 2,
    owner: "renderer-ui-model",
    label: "Project board UI model",
    file: "src/renderer/src/projectBoardUiModel.ts",
    baseline: { fileLines: 11770 },
    budget: { fileLines: 12600 },
    validationDomain: "project-board",
    validationCommand: "pnpm run test:project-board-evidentiary-fixes",
    firstParityCommand: "pnpm exec vitest run src/renderer/src/projectBoardUiModel.test.ts src/main/projectBoardProofClosureModel.test.ts",
    desiredFirstPassDirection: "Split board layout, card state, PM Review, evidence, and command-affordance model owners.",
    firstExtractionTarget: "Board layout and card state model modules before PM Review/evidence splits.",
    statusNote: "Phase 0 baseline installed before V3 project-board UI-model split.",
  },
  {
    id: "agent-runtime-class",
    phase: 3,
    owner: "runtime-send-pipeline",
    label: "AgentRuntime class",
    file: "src/main/agentRuntime.ts",
    declaration: { kind: "ClassDeclaration", name: "AgentRuntime" },
    baseline: { fileLines: 8204, declarationLines: 7135 },
    budget: { fileLines: 9000, declarationLines: 7800 },
    validationDomain: "general",
    validationCommand:
      "pnpm exec vitest run src/main/agentRuntimeStreamState.test.ts src/main/agentRuntimeToolTranscript.test.ts src/main/agentRuntimeMessageContent.test.ts",
    firstParityCommand:
      "pnpm exec vitest run src/main/agentRuntimeStreamState.test.ts src/main/agentRuntimeToolTranscript.test.ts src/main/agentRuntimeMessageContent.test.ts",
    desiredFirstPassDirection: "Extract runtime setup, stream handling, tool dispatch, continuation, recovery, compaction, and finalization stages.",
    firstExtractionTarget: "Named runtime stage context and stream/tool-loop helpers with provider behavior preserved.",
    statusNote: "Phase 0 baseline installed before V3 runtime pipeline extraction.",
  },
  {
    id: "agent-runtime-send",
    phase: 3,
    owner: "runtime-send-pipeline",
    label: "AgentRuntime.send",
    file: "src/main/agentRuntime.ts",
    declaration: { kind: "MethodDeclaration", name: "send" },
    baseline: { fileLines: 8204, declarationLines: 2865 },
    budget: { fileLines: 9000, declarationLines: 3300 },
    validationDomain: "general",
    validationCommand:
      "pnpm exec vitest run src/main/agentRuntimeStreamState.test.ts src/main/agentRuntimeToolTranscript.test.ts src/main/agentRuntimeMessageContent.test.ts",
    firstParityCommand:
      "pnpm exec vitest run src/main/agentRuntimeStreamState.test.ts src/main/agentRuntimeToolTranscript.test.ts src/main/agentRuntimeMessageContent.test.ts",
    desiredFirstPassDirection: "Turn send into a readable table of named stages without changing stream, timeout, tool, or finalization semantics.",
    firstExtractionTarget: "Streaming event and tool-dispatch stage helpers called from send.",
    statusNote: "Phase 0 baseline installed before V3 send-loop extraction.",
  },
  {
    id: "main-ipc-registrar",
    phase: 4,
    owner: "main-ipc",
    label: "registerMainIpc registrar",
    file: "src/main/ipc/registerMainIpc.ts",
    declaration: { kind: "FunctionDeclaration", name: "registerMainIpc" },
    baseline: { fileLines: 3191, declarationLines: 2862 },
    budget: { fileLines: 3600, declarationLines: 3200 },
    validationDomain: "simplification",
    validationCommand: "pnpm run test:simplification-phase0",
    firstParityCommand: "pnpm run test:simplification-phase0",
    desiredFirstPassDirection: "Split IPC by subagents/workflows, diagnostics, model settings, project board, files/artifacts, local runtime, and plugin/tooling registrars.",
    firstExtractionTarget: "First domain registrar with explicit dependencies while handleIpc and trust checks stay centralized.",
    statusNote: "Phase 0 baseline installed before V3 IPC domain registrar extraction.",
  },
  {
    id: "project-store-facade",
    phase: 5,
    owner: "persistence",
    label: "ProjectStore facade",
    file: "src/main/projectStore.ts",
    declaration: { kind: "ClassDeclaration", name: "ProjectStore" },
    baseline: { fileLines: 14397, declarationLines: 1488 },
    budget: { fileLines: 15400, declarationLines: 1800 },
    validationDomain: "project-board",
    validationCommand: "pnpm exec vitest run src/main/projectStore.test.ts src/main/projectStoreSchema.test.ts",
    firstParityCommand: "pnpm exec vitest run src/main/projectStore.test.ts src/main/projectStoreSchema.test.ts",
    desiredFirstPassDirection: "Extract project metadata, sessions/messages, project-board rows, workflow recording, artifacts, settings, and diagnostics repositories.",
    firstExtractionTarget: "Project metadata and session/message repositories behind the existing ProjectStore facade.",
    statusNote: "Phase 0 baseline installed before V3 ProjectStore repository extraction.",
  },
];

export function buildV3Scorecard(complexityReport) {
  const trackedFiles = gitTrackedFiles();
  return {
    generatedFrom: "simplification-complexity-inventory --json plus git/package guardrail metrics",
    generatedAt: new Date().toISOString(),
    hotspotCount: V3_HOTSPOTS.length,
    hotspots: V3_HOTSPOTS.map((target) => scorecardEntry(target, complexityReport)),
    advisoryGuardrails: buildAdvisoryGuardrailMetrics(complexityReport, trackedFiles),
  };
}

export function validateV3Scorecard(scorecard) {
  const issues = [];

  for (const entry of scorecard.hotspots) {
    if (!entry.owner) issues.push(`${entry.id}: missing owner`);
    if (!entry.validationDomain) issues.push(`${entry.id}: missing validation domain`);
    if (!entry.validationCommand) issues.push(`${entry.id}: missing validation command`);
    if (!entry.firstParityCommand) issues.push(`${entry.id}: missing first parity command`);
    if (!entry.desiredFirstPassDirection) issues.push(`${entry.id}: missing desired first-pass direction`);
    if (!entry.firstExtractionTarget) issues.push(`${entry.id}: missing first extraction target`);
    if (!entry.current.fileLines) issues.push(`${entry.id}: missing current file line measurement`);
    if (!entry.baseline.fileLines) issues.push(`${entry.id}: missing baseline file line measurement`);
    if (!entry.budget.fileLines) issues.push(`${entry.id}: missing explicit file line budget`);

    if (entry.budget.fileLines && entry.current.fileLines > entry.budget.fileLines && !entry.statusNote) {
      issues.push(`${entry.id}: file lines ${entry.current.fileLines} exceed advisory budget ${entry.budget.fileLines} without status note`);
    }

    if (entry.declaration) {
      if (!entry.current.declarationLines) issues.push(`${entry.id}: missing current declaration line measurement`);
      if (!entry.baseline.declarationLines) issues.push(`${entry.id}: missing baseline declaration line measurement`);
      if (!entry.budget.declarationLines) issues.push(`${entry.id}: missing explicit declaration line budget`);
      if (entry.budget.declarationLines && entry.current.declarationLines > entry.budget.declarationLines && !entry.statusNote) {
        issues.push(
          `${entry.id}: declaration lines ${entry.current.declarationLines} exceed advisory budget ${entry.budget.declarationLines} without status note`,
        );
      }
    }
  }

  const requiredGuardrails = [
    "src-main-physical-boundaries",
    "shared-types-fan-in",
    "script-surface",
    "root-doc-surface",
    "local-guardrail-readiness",
    "top-import-fan-in",
    "churn-size-hotspots",
  ];
  const guardrailIds = new Set(scorecard.advisoryGuardrails?.map((entry) => entry.id) ?? []);
  for (const id of requiredGuardrails) {
    if (!guardrailIds.has(id)) issues.push(`advisory guardrails: missing ${id}`);
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function renderV3ScorecardMarkdown(scorecard) {
  const lines = [
    "# Simplification V3 Hotspot Scorecard",
    "",
    `Generated from ${scorecard.generatedFrom}. ${scorecard.hotspotCount} hotspots tracked.`,
    "",
    "| Phase | Hotspot | Owner | File lines | Declaration lines | Validation | First parity command | First extraction target | Direction | Status note |",
    "| ---: | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |",
  ];

  for (const entry of scorecard.hotspots) {
    lines.push(
      [
        `| ${entry.phase}`,
        entry.label,
        entry.owner,
        lineSummary(entry.current.fileLines, entry.baseline.fileLines, entry.budget.fileLines),
        entry.declaration
          ? lineSummary(entry.current.declarationLines, entry.baseline.declarationLines, entry.budget.declarationLines)
          : "n/a",
        `\`${entry.validationCommand}\``,
        `\`${entry.firstParityCommand}\``,
        entry.firstExtractionTarget,
        entry.desiredFirstPassDirection,
        entry.statusNote,
      ].join(" | ") + " |",
    );
  }

  lines.push("");
  lines.push("## Advisory Guardrail Metrics");
  lines.push("");
  lines.push("These metrics are report-only until owner extraction has enough stable evidence for ratcheted local gates.");
  lines.push("");
  lines.push("| Metric | Current | Direction | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const metric of scorecard.advisoryGuardrails ?? []) {
    lines.push(`| ${metric.label} | ${metric.displayValue} | ${metric.direction} | ${metric.status} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function buildAdvisoryGuardrailMetrics(complexityReport, trackedFiles = gitTrackedFiles()) {
  const sourceFiles = trackedFiles.filter(isSourceFile).filter((file) => !isGeneratedOrVendored(file));
  const packageScripts = readPackageScripts();
  const scriptNames = Object.keys(packageScripts);
  const testScriptNames = scriptNames.filter((name) => name.startsWith("test:"));
  const rootDocs = trackedFiles.filter((file) => /^[^/]+\.(?:md|html)$/i.test(file));
  const flatMainFiles = trackedFiles.filter((file) => /^src\/main\/[^/]+$/.test(file));
  const nestedMainFiles = trackedFiles.filter((file) => /^src\/main\/.+\/.+/.test(file));
  const workflowFiles = trackedFiles.filter((file) => file.startsWith(".github/workflows/"));
  const linterConfig = findConfigFile(trackedFiles, [
    /^eslint\.config\.(?:[cm][jt]s|[jt]s)$/,
    /^\.eslintrc(?:\..+)?$/,
  ]);
  const formatterConfig = findConfigFile(trackedFiles, [
    /^prettier\.config\.(?:[cm][jt]s|[jt]s)$/,
    /^\.prettierrc(?:\..+)?$/,
  ]);
  const importFanIn = topImportFanIn(sourceFiles);
  const sharedTypesFanIn =
    importFanIn.entries.find((entry) => entry.file === "src/shared/types.ts") ?? {
      file: "src/shared/types.ts",
      importers: 0,
    };
  const churnSizeHotspots = topChurnSizeHotspots(complexityReport);

  return [
    {
      id: "src-main-physical-boundaries",
      label: "src/main physical boundaries",
      displayValue: `${formatNumber(flatMainFiles.length)} flat / ${formatNumber(nestedMainFiles.length)} nested tracked files`,
      status: "advisory",
      direction: "Prefer domain owner directories for new main-process extractions.",
      details: {
        flatFiles: flatMainFiles.length,
        nestedFiles: nestedMainFiles.length,
      },
    },
    {
      id: "shared-types-fan-in",
      label: "shared/types fan-in",
      displayValue: `${formatNumber(sharedTypesFanIn.importers)} tracked source importers`,
      status: "advisory",
      direction: "Retire broad shared-type imports through domain-local contracts as owners stabilize.",
      details: sharedTypesFanIn,
    },
    {
      id: "script-surface",
      label: "package script surface",
      displayValue: `${formatNumber(scriptNames.length)} scripts / ${formatNumber(testScriptNames.length)} test:* scripts`,
      status: "advisory",
      direction: "Collapse script permutations only after product owners and evidence lanes are clear.",
      details: {
        scripts: scriptNames.length,
        testScripts: testScriptNames.length,
      },
    },
    {
      id: "root-doc-surface",
      label: "root docs surface",
      displayValue: `${formatNumber(rootDocs.length)} tracked root .md/.html docs`,
      status: "advisory",
      direction: "Defer broad doc hygiene to closeout unless a phase changes the plan of record.",
      details: {
        rootDocs: rootDocs.length,
      },
    },
    {
      id: "local-guardrail-readiness",
      label: "local guardrail readiness",
      displayValue: `ESLint ${presenceLabel(linterConfig)}; Prettier ${presenceLabel(formatterConfig)}; ${formatNumber(workflowFiles.length)} tracked workflows`,
      status: "advisory",
      direction: "Keep checks local and do not add cloud workflows without explicit human approval.",
      details: {
        eslintConfig: linterConfig,
        prettierConfig: formatterConfig,
        workflowFiles: workflowFiles.length,
      },
    },
    {
      id: "top-import-fan-in",
      label: "top import fan-in",
      displayValue: formatImportFanIn(importFanIn.entries.slice(0, 5)),
      status: "advisory",
      direction: "Use fan-in hotspots to choose future type and owner-boundary work.",
      details: {
        topImportFanIn: importFanIn.entries.slice(0, 10),
        sourceFilesScanned: importFanIn.sourceFilesScanned,
      },
    },
    {
      id: "churn-size-hotspots",
      label: "churn x size hotspots",
      displayValue: formatChurnSizeHotspots(churnSizeHotspots.slice(0, 5)),
      status: "advisory",
      direction: "Prioritize broad wins where large files are also active edit targets.",
      details: {
        recentCommitWindow: RECENT_CHURN_COMMIT_WINDOW,
        hotspots: churnSizeHotspots.slice(0, 10),
      },
    },
  ];
}

function scorecardEntry(target, complexityReport) {
  const fileStat = complexityReport.topFiles.find((entry) => entry.file === target.file);
  const declarationStat = target.declaration
    ? complexityReport.topDeclarations.find(
        (entry) =>
          entry.file === target.file &&
          entry.name === target.declaration.name &&
          entry.kind === target.declaration.kind,
      )
    : undefined;

  return {
    id: target.id,
    phase: target.phase,
    owner: target.owner,
    label: target.label,
    file: target.file,
    declaration: target.declaration,
    validationDomain: target.validationDomain,
    validationCommand: target.validationCommand,
    firstParityCommand: target.firstParityCommand,
    desiredFirstPassDirection: target.desiredFirstPassDirection,
    firstExtractionTarget: target.firstExtractionTarget,
    statusNote: target.statusNote,
    baseline: target.baseline,
    budget: target.budget,
    current: {
      fileLines: fileStat?.lines,
      declarationLines: declarationStat?.lines,
      declarationLine: declarationStat?.line,
    },
  };
}

function lineSummary(current, baseline, budget) {
  const currentText = current === undefined ? "missing" : current.toLocaleString();
  const baselineText = baseline === undefined ? "missing" : baseline.toLocaleString();
  const budgetText = budget === undefined ? "none" : budget.toLocaleString();
  return `${currentText} / ${baselineText} / ${budgetText}`;
}

function readComplexityReport() {
  const output = execFileSync(process.execPath, ["scripts/simplification-complexity-inventory.mjs", "--json", "--limit", "10000"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(output);
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const RECENT_CHURN_COMMIT_WINDOW = 200;
const ROOT_CONFIG_CANDIDATES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  "prettier.config.js",
  "prettier.config.mjs",
  "prettier.config.cjs",
  "prettier.config.ts",
  "prettier.config.mts",
  "prettier.config.cts",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.json",
  ".prettierrc.yaml",
  ".prettierrc.yml",
];

function gitTrackedFiles() {
  const output = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

function readPackageScripts() {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
  return packageJson.scripts ?? {};
}

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension));
}

function isGeneratedOrVendored(file) {
  return (
    file.includes("/node_modules/") ||
    file.startsWith("out/") ||
    file.startsWith("dist/") ||
    file.startsWith("release/") ||
    file.includes(".generated.") ||
    /\.gen\./.test(file) ||
    /(^|\/)generated(\/|$)/i.test(file)
  );
}

function findConfigFile(trackedFiles, patterns) {
  return (
    trackedFiles.find((file) => patterns.some((pattern) => pattern.test(file))) ??
    ROOT_CONFIG_CANDIDATES.find((file) => patterns.some((pattern) => pattern.test(file)) && existsSync(resolve(repoRoot, file)))
  );
}

function topImportFanIn(sourceFiles) {
  const sourceFileSet = new Set(sourceFiles);
  const importersByTarget = new Map();

  for (const file of sourceFiles) {
    const text = readFileSync(resolve(repoRoot, file), "utf8");
    for (const specifier of importSpecifiers(text)) {
      const target = resolveImportTarget(file, specifier, sourceFileSet);
      if (!target || target === file) continue;
      const importers = importersByTarget.get(target) ?? new Set();
      importers.add(file);
      importersByTarget.set(target, importers);
    }
  }

  const entries = [...importersByTarget.entries()]
    .map(([file, importers]) => ({
      file,
      importers: importers.size,
    }))
    .sort((a, b) => b.importers - a.importers || a.file.localeCompare(b.file));

  return {
    sourceFilesScanned: sourceFiles.length,
    entries,
  };
}

function importSpecifiers(text) {
  const specifiers = [];
  const pattern =
    /\bfrom\s+["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm;
  let match;
  while ((match = pattern.exec(text))) {
    specifiers.push(match[1] ?? match[2] ?? match[3]);
  }
  return specifiers;
}

function resolveImportTarget(importer, specifier, sourceFileSet) {
  if (!specifier.startsWith(".")) return undefined;

  const base = normalize(join(dirname(importer), specifier)).replace(/\\/g, "/");
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];

  return candidates.find((candidate) => sourceFileSet.has(candidate));
}

function topChurnSizeHotspots(complexityReport) {
  const linesByFile = new Map(complexityReport.topFiles.map((entry) => [entry.file, entry.lines]));
  const output = execFileSync("git", ["log", `-${RECENT_CHURN_COMMIT_WINDOW}`, "--format=", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const touchesByFile = new Map();

  for (const file of output.split("\n").filter(Boolean)) {
    if (!linesByFile.has(file)) continue;
    touchesByFile.set(file, (touchesByFile.get(file) ?? 0) + 1);
  }

  return [...touchesByFile.entries()]
    .map(([file, touches]) => {
      const lines = linesByFile.get(file);
      return {
        file,
        touches,
        lines,
        score: touches * lines,
      };
    })
    .sort((a, b) => b.score - a.score || b.lines - a.lines || a.file.localeCompare(b.file));
}

function formatImportFanIn(entries) {
  if (!entries.length) return "none";
  return entries.map((entry) => `\`${entry.file}\` (${formatNumber(entry.importers)})`).join(", ");
}

function formatChurnSizeHotspots(entries) {
  if (!entries.length) return "none";
  return entries.map((entry) => `\`${entry.file}\` (${formatNumber(entry.touches)} x ${formatNumber(entry.lines)} lines)`).join(", ");
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function presenceLabel(file) {
  return file ? `present (${file})` : "missing";
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    check: argv.includes("--check"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function usage() {
  return [
    "Usage: node scripts/simplification-v3-scorecard.mjs [--json] [--check]",
    "",
    "Builds a generated scorecard for Simplification V3 hotspots, current complexity measurements, owners, advisory budgets, validation commands, first parity commands, and first extraction targets.",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const scorecard = buildV3Scorecard(readComplexityReport());
  const validation = validateV3Scorecard(scorecard);
  if (args.check && !validation.ok) {
    process.stderr.write(`${validation.issues.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(args.json ? `${JSON.stringify(scorecard, null, 2)}\n` : renderV3ScorecardMarkdown(scorecard));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
