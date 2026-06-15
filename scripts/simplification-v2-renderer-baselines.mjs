#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { V2_HOTSPOTS } from "./simplification-v2-scorecard.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const V2_RENDERER_BASELINE_HOTSPOT_IDS = [
  "right-panel-shell",
  "app-shell",
  "automations-workspace",
  "project-board-workspace",
];

export const V2_RENDERER_BASELINE_GROUPS = [
  {
    id: "right-panel-shell",
    hotspotId: "right-panel-shell",
    label: "RightPanel shell",
    phase: 1,
    scenarios: [
      "main-shell-desktop",
      "main-shell-compact",
      "model-selector-open",
      "api-key-dialog-open",
      "permission-dialog-open",
    ],
    parityTarget: "Right panel shell, composer-adjacent controls, provider dialogs, and permission prompt geometry.",
  },
  {
    id: "app-shell",
    hotspotId: "app-shell",
    label: "App shell",
    phase: 1,
    scenarios: [
      "main-shell-desktop",
      "main-shell-medium",
      "main-shell-compact",
      "settings-search-active",
      "workflow-run-console-open",
      "workflow-artifact-preview-open",
      "browser-picker-active",
      "plugin-import-candidate-visible",
    ],
    parityTarget: "Top-level shell routing, modal hosts, settings, workflow panels, browser picker, and plugin marketplace entry points.",
  },
  {
    id: "automations-workspace",
    hotspotId: "automations-workspace",
    label: "Automations workspace",
    phase: 2,
    scenarios: [
      "local-tasks-many-items-desktop",
      "local-tasks-long-names-compact",
      "local-tasks-edit-card-open",
      "workflow-run-console-open",
      "workflow-artifact-preview-open",
    ],
    parityTarget: "Automation workspace list/edit flows plus workflow run and artifact history panes before workspace extraction.",
  },
  {
    id: "project-board-workspace",
    hotspotId: "project-board-workspace",
    label: "ProjectBoard workspace",
    phase: 2,
    scenarios: [
      "project-board-desktop",
      "project-board-medium",
      "project-board-compact",
      "project-board-long-names-desktop",
      "project-board-long-names-compact",
      "project-board-many-cards-25-desktop",
      "project-board-many-cards-25-compact",
      "project-board-draft-detail-open",
      "project-board-pm-review-open",
    ],
    parityTarget: "Board columns, dense cards, long generated content, draft detail, and PM-review inspector geometry.",
  },
];

export function buildV2RendererBaselineManifest(hotspots = V2_HOTSPOTS) {
  const byId = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const groups = V2_RENDERER_BASELINE_GROUPS.map((group) => {
    const hotspot = byId.get(group.hotspotId);
    const resultsDir = `test-results/simplification-v2-baselines/${group.id}`;
    const fixtureRoot = `test-results/simplification-v2-baselines-fixture/${group.id}`;
    return {
      ...group,
      owner: hotspot?.owner,
      file: hotspot?.file,
      declaration: hotspot?.declaration,
      command: uiModelCommand(group, { resultsDir, fixtureRoot }),
      outputs: {
        resultsDir,
        fixtureRoot,
        summary: `${resultsDir}/summary.json`,
        report: `${resultsDir}/report.md`,
        htmlReport: `${resultsDir}/report.html`,
        scenarioJson: group.scenarios.map((scenario) => `${resultsDir}/${scenario}.json`),
      },
    };
  });

  return {
    generatedFrom: "simplification V2 renderer baseline manifest",
    requiredHotspotIds: V2_RENDERER_BASELINE_HOTSPOT_IDS,
    groupCount: groups.length,
    groups,
  };
}

export function validateV2RendererBaselineManifest(manifest, options = {}) {
  const issues = [];
  const availableScenarios = options.availableScenarios ?? readUiModelScenarioNames();
  const availableScenarioSet = new Set(availableScenarios);
  const hotspotIds = new Set(V2_HOTSPOTS.map((hotspot) => hotspot.id));
  const groupIds = new Set();
  const coveredHotspots = new Set();

  for (const group of manifest.groups) {
    if (groupIds.has(group.id)) issues.push(`${group.id}: duplicate renderer baseline group`);
    groupIds.add(group.id);
    if (!hotspotIds.has(group.hotspotId)) issues.push(`${group.id}: unknown hotspot ${group.hotspotId}`);
    coveredHotspots.add(group.hotspotId);
    if (!group.owner) issues.push(`${group.id}: missing hotspot owner`);
    if (!group.file) issues.push(`${group.id}: missing hotspot file`);
    if (!group.command.includes("pnpm run test:ui-model --")) issues.push(`${group.id}: command must use test:ui-model`);
    if (!group.command.includes("--isolate-scenarios")) issues.push(`${group.id}: command must isolate scenarios`);
    if (!group.outputs?.resultsDir?.startsWith("test-results/simplification-v2-baselines/")) {
      issues.push(`${group.id}: results must stay under test-results/simplification-v2-baselines`);
    }
    if (!group.outputs?.fixtureRoot?.startsWith("test-results/simplification-v2-baselines-fixture/")) {
      issues.push(`${group.id}: fixture root must stay under test-results/simplification-v2-baselines-fixture`);
    }
    if (!Array.isArray(group.scenarios) || group.scenarios.length === 0) {
      issues.push(`${group.id}: missing UI-model scenarios`);
      continue;
    }
    for (const scenario of group.scenarios) {
      if (!availableScenarioSet.has(scenario)) issues.push(`${group.id}: unknown UI-model scenario ${scenario}`);
      if (!group.command.includes(scenario)) issues.push(`${group.id}: command does not include scenario ${scenario}`);
    }
  }

  for (const hotspotId of manifest.requiredHotspotIds) {
    if (!coveredHotspots.has(hotspotId)) issues.push(`${hotspotId}: missing renderer baseline group`);
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function renderV2RendererBaselinesMarkdown(manifest) {
  const lines = [
    "# Simplification V2 Renderer Baselines",
    "",
    `Generated from ${manifest.generatedFrom}. ${manifest.groupCount} renderer baseline groups tracked.`,
    "",
    "| Phase | Hotspot | Owner | Scenarios | Capture command | Outputs |",
    "| ---: | --- | --- | --- | --- | --- |",
  ];

  for (const group of manifest.groups) {
    lines.push(
      [
        `| ${group.phase}`,
        group.label,
        group.owner,
        group.scenarios.map((scenario) => `\`${scenario}\``).join(", "),
        `\`${group.command}\``,
        `\`${group.outputs.summary}\`, \`${group.outputs.report}\``,
      ].join(" | ") + " |",
    );
  }

  lines.push("", "## Parity Targets", "");
  for (const group of manifest.groups) {
    lines.push(`- \`${group.hotspotId}\`: ${group.parityTarget}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function extractUiModelScenarioNames(source) {
  const catalog = source.match(/const scenarioCatalog = \[([\s\S]*?)\];\nconst scenarios =/);
  if (!catalog) return [];
  return [...catalog[1].matchAll(/\bname:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function readUiModelScenarioNames() {
  const source = readFileSync(resolve(repoRoot, "scripts/ui-model/collect-ui-model.mjs"), "utf8");
  return extractUiModelScenarioNames(source);
}

function uiModelCommand(group, { resultsDir, fixtureRoot }) {
  return [
    "pnpm run test:ui-model --",
    `--scenario=${group.scenarios.join(",")}`,
    "--isolate-scenarios",
    `--results-dir=${resultsDir}`,
    `--fixture-root=${fixtureRoot}`,
  ].join(" ");
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
    "Usage: node scripts/simplification-v2-renderer-baselines.mjs [--json] [--check]",
    "",
    "Prints the UI-model baseline capture commands for V2 renderer hotspots and checks that every scenario still exists.",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const manifest = buildV2RendererBaselineManifest();
  const validation = validateV2RendererBaselineManifest(manifest);
  if (args.check && !validation.ok) {
    process.stderr.write(`${validation.issues.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(args.json ? `${JSON.stringify(manifest, null, 2)}\n` : renderV2RendererBaselinesMarkdown(manifest));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
