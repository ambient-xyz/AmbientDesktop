#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const V2_HOTSPOTS = [
  {
    id: "right-panel-shell",
    phase: 1,
    owner: "renderer-shell",
    label: "RightPanel shell",
    file: "src/renderer/src/RightPanel.tsx",
    declaration: { kind: "FunctionDeclaration", name: "RightPanel" },
    baseline: { fileLines: 14977, declarationLines: 9172 },
    budget: { fileLines: 16500, declarationLines: 10100 },
    validationDomain: "renderer-visual",
    validationCommand: "pnpm run test:ui-model",
    firstParityTarget: "UI model baseline for main shell and right panel flows",
    phaseOutcome: "closed-first-pass",
    completedSlice: "Extracted browser pane, MiniCPM diagnostics, and app topbar without redesign.",
    remainingRisk: "RightPanel and App are still giant renderer declarations where visual and keyboard regressions are easy.",
    nextSlice: "Move artifact, tool, status, and routing panes behind stable props with UI-model evidence.",
  },
  {
    id: "app-shell",
    phase: 1,
    owner: "renderer-shell",
    label: "App shell",
    file: "src/renderer/src/App.tsx",
    declaration: { kind: "FunctionDeclaration", name: "App" },
    baseline: { fileLines: 9013, declarationLines: 7622 },
    budget: { fileLines: 10000, declarationLines: 8500 },
    validationDomain: "renderer-visual",
    validationCommand: "pnpm run test:ui-model",
    firstParityTarget: "UI model baseline for app routing, modal hosts, and shell controls",
    phaseOutcome: "closed-first-pass",
    completedSlice: "Moved the top app bar into an owned shell component while preserving app orchestration state.",
    remainingRisk: "App routing, modal hosts, and workspace switching still live in a large declaration.",
    nextSlice: "Extract route and modal host shells once renderer UI-model setup is stable.",
  },
  {
    id: "automations-workspace",
    phase: 2,
    owner: "renderer-workspace",
    label: "Automations workspace",
    file: "src/renderer/src/AutomationsWorkspace.tsx",
    declaration: { kind: "FunctionDeclaration", name: "AutomationsWorkspace" },
    baseline: { fileLines: 11225, declarationLines: 7591 },
    budget: { fileLines: 12200, declarationLines: 8500 },
    validationDomain: "renderer-visual",
    validationCommand: "pnpm run test:ui-model",
    firstParityTarget: "UI model baseline for automation list, editor, schedule, and run history",
    phaseOutcome: "closed-first-pass",
    completedSlice: "Lifted Local Tasks board, dispatch controls, prepare-result panel, and run list into typed views.",
    remainingRisk: "AutomationsWorkspace remains a large in-file component and still needs pane ownership outside the parent.",
    nextSlice: "Move extracted automation views into files and continue state derivation in UI-model helpers.",
  },
  {
    id: "project-board-workspace",
    phase: 2,
    owner: "renderer-workspace",
    label: "ProjectBoard workspace",
    file: "src/renderer/src/ProjectBoardWorkspace.tsx",
    declaration: { kind: "FunctionDeclaration", name: "ProjectBoardWorkspace" },
    baseline: { fileLines: 11633, declarationLines: 1276 },
    budget: { fileLines: 12600, declarationLines: 1800 },
    validationDomain: "project-board",
    validationCommand: "pnpm run test:project-board-evidentiary-fixes",
    firstParityTarget: "Project board UI model and proof closure coverage",
    phaseOutcome: "deferred-after-scorecard",
    completedSlice: "Measured and budgeted for V2, but no broad ProjectBoardWorkspace extraction landed in V2.",
    remainingRisk: "Project-board UI remains broad and will still tax LLM changes around evidence and card detail flows.",
    nextSlice: "Split board shell, active card detail, candidate detail, source/evidence panels, and action menus.",
  },
  {
    id: "project-board-ui-model",
    phase: 2,
    owner: "renderer-ui-model",
    label: "Project board UI model",
    file: "src/renderer/src/projectBoardUiModel.ts",
    baseline: { fileLines: 11770 },
    budget: { fileLines: 12800 },
    validationDomain: "project-board",
    validationCommand: "pnpm run test:project-board-evidentiary-fixes",
    firstParityTarget: "Project board UI model state derivation tests",
    phaseOutcome: "deferred-after-scorecard",
    completedSlice: "Measured and budgeted for V2, but no broad projectBoardUiModel split landed in V2.",
    remainingRisk: "State derivation for board layout, PM Review, evidence, and command affordances remains concentrated.",
    nextSlice: "Split board layout, card state, PM Review, evidence, and command affordance models.",
  },
  {
    id: "shared-types",
    phase: 3,
    owner: "shared-contracts",
    label: "Shared type surface",
    file: "src/shared/types.ts",
    baseline: { fileLines: 10259 },
    budget: { fileLines: 11200 },
    validationDomain: "general",
    validationCommand: "pnpm run typecheck",
    firstParityTarget: "Type-only compatibility through tsc --noEmit",
    phaseOutcome: "closed-big-win",
    completedSlice: "Moved 1,065 shared declarations into 14 domain contract modules behind a compatibility barrel.",
    remainingRisk: "The barrel can hide better owners unless future edits prefer domain imports.",
    nextSlice: "Migrate touched callers to direct domain imports when making deeper contract changes.",
  },
  {
    id: "project-store-facade",
    phase: 4,
    owner: "persistence",
    label: "ProjectStore facade",
    file: "src/main/projectStore.ts",
    declaration: { kind: "ClassDeclaration", name: "ProjectStore" },
    baseline: { fileLines: 15434, declarationLines: 1687 },
    budget: { fileLines: 16600, declarationLines: 2200 },
    validationDomain: "project-board",
    validationCommand: "pnpm exec vitest run src/main/projectStore.test.ts src/main/projectStoreSchema.test.ts",
    firstParityTarget: "ProjectStore behavior, schema, and project-board import/export coverage",
    phaseOutcome: "closed-first-pass",
    completedSlice: "Moved facade helpers, maturity history helpers, artifact draft persistence, and settings persistence to owners.",
    remainingRisk: "ProjectStore is still a large facade and repository coverage is incomplete for project-board/session domains.",
    nextSlice: "Extract project metadata, sessions/messages, project-board rows, and workflow recording repositories.",
  },
  {
    id: "ipc-registrar",
    phase: 5,
    owner: "main-ipc",
    label: "registerIpc registrar",
    file: "src/main/index.ts",
    declaration: { kind: "FunctionDeclaration", name: "registerIpc" },
    baseline: { fileLines: 12426, declarationLines: 2517 },
    budget: { fileLines: 13600, declarationLines: 3200 },
    validationDomain: "simplification",
    validationCommand: "pnpm run test:simplification-phase0",
    firstParityTarget: "AmbientDesktopApi, preload, and main-process IPC parity",
    phaseOutcome: "closed-big-win",
    completedSlice: "Moved central IPC wiring into registerMainIpc with explicit dependency passing and parity coverage.",
    remainingRisk: "registerMainIpc is now the next registrar-sized owner and still needs domain dependency bundles.",
    nextSlice: "Split registerMainIpc by IPC domain while keeping handleIpc and trust checks centralized.",
  },
  {
    id: "runtime-send-loop",
    phase: 6,
    owner: "runtime-send-loop",
    label: "AgentRuntime.send loop",
    file: "src/main/agentRuntime.ts",
    declaration: { kind: "MethodDeclaration", name: "send" },
    baseline: { fileLines: 8331, declarationLines: 3077 },
    budget: { fileLines: 9400, declarationLines: 3900 },
    validationDomain: "general",
    validationCommand: "pnpm exec vitest run src/main/agentRuntimeStreamState.test.ts src/main/agentRuntimeToolTranscript.test.ts src/main/agentRuntimeMessageContent.test.ts",
    firstParityTarget: "Streaming state, tool transcript, and message content regression coverage",
    phaseOutcome: "closed-first-pass",
    completedSlice: "Defined send-loop setup context and moved stream diagnostics into an owned runtime module.",
    remainingRisk: "AgentRuntime and send are still large enough that provider/tool-loop changes remain high-risk.",
    nextSlice: "Extract streaming event handling, tool dispatch, post-tool continuation, and finalization stages one at a time.",
  },
  {
    id: "subagent-release-gate-report",
    phase: 7,
    owner: "release-evidence",
    label: "Subagent release gate report",
    file: "scripts/subagent-release-gate-lib.mjs",
    declaration: { kind: "FunctionDeclaration", name: "buildSubagentReleaseGateReport" },
    baseline: { fileLines: 6732, declarationLines: 4047 },
    budget: { fileLines: 7600, declarationLines: 4800 },
    validationDomain: "subagents-workflows",
    validationCommand: "pnpm run test:subagents:release-gate:unit",
    firstParityTarget: "Subagent release gate report model and rendering coverage",
    phaseOutcome: "closed-big-win",
    completedSlice: "Split report assembly into command/source/artifact builders and moved 85 source checks into domain groups.",
    remainingRisk: "Source-check groups are still dense evidence maps and proof artifacts must be regenerated for raw gates.",
    nextSlice: "Separate artifact policy/rendering helpers and keep direct gate inputs aligned with moved owners.",
  },
];

export function buildV2Scorecard(complexityReport) {
  return {
    generatedFrom: "simplification-complexity-inventory --json",
    generatedAt: new Date().toISOString(),
    hotspotCount: V2_HOTSPOTS.length,
    hotspots: V2_HOTSPOTS.map((target) => scorecardEntry(target, complexityReport)),
  };
}

export function validateV2Scorecard(scorecard) {
  const issues = [];

  for (const entry of scorecard.hotspots) {
    if (!entry.owner) issues.push(`${entry.id}: missing owner`);
    if (!entry.validationCommand) issues.push(`${entry.id}: missing validation command`);
    if (!entry.firstParityTarget) issues.push(`${entry.id}: missing first parity target`);
    if (!entry.phaseOutcome) issues.push(`${entry.id}: missing phase outcome`);
    if (!entry.completedSlice) issues.push(`${entry.id}: missing completed slice`);
    if (!entry.remainingRisk) issues.push(`${entry.id}: missing remaining risk`);
    if (!entry.nextSlice) issues.push(`${entry.id}: missing next slice`);
    if (!entry.current.fileLines) issues.push(`${entry.id}: missing current file line measurement`);
    if (!entry.baseline.fileLines) issues.push(`${entry.id}: missing baseline file line measurement`);
    if (entry.budget.fileLines && entry.current.fileLines > entry.budget.fileLines) {
      issues.push(`${entry.id}: file lines ${entry.current.fileLines} exceed budget ${entry.budget.fileLines}`);
    }

    if (entry.declaration) {
      if (!entry.current.declarationLines) issues.push(`${entry.id}: missing current declaration line measurement`);
      if (!entry.baseline.declarationLines) issues.push(`${entry.id}: missing baseline declaration line measurement`);
      if (entry.budget.declarationLines && entry.current.declarationLines > entry.budget.declarationLines) {
        issues.push(`${entry.id}: declaration lines ${entry.current.declarationLines} exceed budget ${entry.budget.declarationLines}`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function renderV2ScorecardMarkdown(scorecard) {
  const lines = [
    "# Simplification V2 Hotspot Scorecard",
    "",
    `Generated from ${scorecard.generatedFrom}. ${scorecard.hotspotCount} hotspots tracked.`,
    "",
    "| Phase | Hotspot | Owner | File lines | Declaration lines | Outcome | Validation | First parity target | Completed slice | Remaining risk | Next slice |",
    "| ---: | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |",
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
        entry.phaseOutcome,
        `\`${entry.validationCommand}\``,
        entry.firstParityTarget,
        entry.completedSlice,
        entry.remainingRisk,
        entry.nextSlice,
      ].join(" | ") + " |",
    );
  }

  lines.push("");
  return lines.join("\n");
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
    firstParityTarget: target.firstParityTarget,
    phaseOutcome: target.phaseOutcome,
    completedSlice: target.completedSlice,
    remainingRisk: target.remainingRisk,
    nextSlice: target.nextSlice,
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

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    check: argv.includes("--check"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function usage() {
  return [
    "Usage: node scripts/simplification-v2-scorecard.mjs [--json] [--check]",
    "",
    "Builds a generated scorecard for Simplification V2 hotspots, current complexity measurements, owners, budgets, validation targets, outcomes, and remaining risks.",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const scorecard = buildV2Scorecard(readComplexityReport());
  const validation = validateV2Scorecard(scorecard);
  if (args.check && !validation.ok) {
    process.stderr.write(`${validation.issues.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(args.json ? `${JSON.stringify(scorecard, null, 2)}\n` : renderV2ScorecardMarkdown(scorecard));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
