#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildV3Scorecard } from "./simplification-v3-scorecard.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = "scripts/simplification-v3-guardrail-baseline.json";
const LARGE_FILE_LINE_THRESHOLD = 800;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const LINT_TARGETS = ["src/**/*.{js,mjs,cjs,ts,tsx}", "scripts/**/*.{js,mjs,cjs}"];

export function buildGuardrailSnapshot(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const trackedFiles = options.trackedFiles ?? gitTrackedFiles(root);
  const sourceFiles = trackedFiles.filter(isSourceFile).filter((file) => !isGeneratedOrVendored(file));
  const complexityReport = options.complexityReport ?? readComplexityReport(root);
  const scorecard = options.scorecard ?? buildV3Scorecard(complexityReport);
  const importGraph = buildImportGraph(root, sourceFiles);
  const importersByTarget = buildImportersByTarget(importGraph);
  const flatMainFiles = trackedFiles.filter((file) => /^src\/main\/[^/]+$/.test(file)).sort();
  const sharedTypesImporters = [...(importersByTarget.get("src/shared/types.ts") ?? new Set())].sort();
  const importCycles = findImportCycles(importGraph);
  const importBoundaryEdges = findImportBoundaryEdges(importGraph);
  const hardBoundaryViolations = findHardBoundaryViolations(importBoundaryEdges);
  const largeFileLineCeilings = Object.fromEntries(
    complexityReport.topFiles
      .filter((entry) => entry.lines >= LARGE_FILE_LINE_THRESHOLD)
      .sort((a, b) => a.file.localeCompare(b.file))
      .map((entry) => [entry.file, entry.lines]),
  );
  const lint = options.lint ?? readLintSummary(root);
  const localGuardrailReadiness = guardrailDetails(scorecard, "local-guardrail-readiness");

  return {
    schemaVersion: 1,
    description:
      "Simplification V3 Phase 6 local guardrail baseline. Existing debt is grandfathered; update intentionally only when a phase lowers a baseline or records an explicit exception.",
    largeFileLineThreshold: LARGE_FILE_LINE_THRESHOLD,
    lintTargets: LINT_TARGETS,
    metrics: {
      sourceFiles: sourceFiles.length,
      srcMainFlatFiles: flatMainFiles.length,
      srcMainNestedFiles: guardrailDetails(scorecard, "src-main-physical-boundaries").nestedFiles,
      sharedTypesImporters: sharedTypesImporters.length,
      importCycles: importCycles.length,
      importBoundaryEdges: importBoundaryEdges.length,
      hardBoundaryViolations: hardBoundaryViolations.length,
      largeFiles: Object.keys(largeFileLineCeilings).length,
    },
    localTooling: {
      eslintConfig: localGuardrailReadiness.eslintConfig,
      prettierConfig: localGuardrailReadiness.prettierConfig,
      workflowFiles: localGuardrailReadiness.workflowFiles,
    },
    lint,
    hotspotCeilings: Object.fromEntries(
      scorecard.hotspots.map((entry) => [
        entry.id,
        {
          file: entry.file,
          fileLines: entry.current.fileLines,
          declarationLines: entry.current.declarationLines,
        },
      ]),
    ),
    flatMainFiles,
    sharedTypesImporters,
    importCycles,
    importBoundaryEdges,
    hardBoundaryViolations,
    largeFileLineCeilings,
    exceptions: {
      flatMainFiles: {},
      sharedTypesImporters: {},
      importCycles: {},
      importBoundaryEdges: {},
      largeFiles: {},
      hotspots: {},
      lintRuleCounts: {},
      lintTotalWarnings: undefined,
    },
  };
}

export function compareGuardrailSnapshots(current, baseline) {
  const issues = [];
  const exceptions = baseline.exceptions ?? {};

  if (!current.localTooling.eslintConfig) issues.push("local-tooling: ESLint config is missing");
  if (!current.localTooling.prettierConfig) issues.push("local-tooling: Prettier config is missing");
  if ((current.localTooling.workflowFiles ?? 0) > (baseline.localTooling?.workflowFiles ?? 0)) {
    issues.push(
      `local-tooling: tracked workflow files increased from ${baseline.localTooling?.workflowFiles ?? 0} to ${current.localTooling.workflowFiles}`,
    );
  }

  const allowedFlatMainFiles = new Set(Object.keys(exceptions.flatMainFiles ?? {}));
  const baselineFlatMainFiles = new Set(baseline.flatMainFiles ?? []);
  const newFlatMainFiles = (current.flatMainFiles ?? []).filter(
    (file) => !baselineFlatMainFiles.has(file) && !allowedFlatMainFiles.has(file),
  );
  if (newFlatMainFiles.length) {
    issues.push(`src-main-flat-files: ${newFlatMainFiles.length} new flat files: ${newFlatMainFiles.join(", ")}`);
  }

  const allowedSharedTypesImporters = new Set(Object.keys(exceptions.sharedTypesImporters ?? {}));
  const baselineSharedTypesImporters = new Set(baseline.sharedTypesImporters ?? []);
  const newSharedTypesImporters = (current.sharedTypesImporters ?? []).filter(
    (file) => !baselineSharedTypesImporters.has(file) && !allowedSharedTypesImporters.has(file),
  );
  if (newSharedTypesImporters.length) {
    issues.push(`shared-types-fan-in: ${newSharedTypesImporters.length} new importers: ${newSharedTypesImporters.join(", ")}`);
  }

  const allowedImportCycles = new Set(Object.keys(exceptions.importCycles ?? {}));
  const baselineImportCycles = new Set(baseline.importCycles ?? []);
  const newImportCycles = (current.importCycles ?? []).filter(
    (cycle) => !baselineImportCycles.has(cycle) && !allowedImportCycles.has(cycle),
  );
  if (newImportCycles.length) {
    issues.push(`import-cycles: ${newImportCycles.length} new cycles: ${newImportCycles.join(" | ")}`);
  }

  const allowedImportBoundaryEdges = new Set(Object.keys(exceptions.importBoundaryEdges ?? {}));
  const baselineImportBoundaryEdges = new Set(baseline.importBoundaryEdges ?? []);
  const newImportBoundaryEdges = (current.importBoundaryEdges ?? []).filter(
    (edge) => !baselineImportBoundaryEdges.has(edge) && !allowedImportBoundaryEdges.has(edge),
  );
  if (newImportBoundaryEdges.length) {
    issues.push(`import-boundaries: ${newImportBoundaryEdges.length} new boundary imports: ${newImportBoundaryEdges.join(" | ")}`);
  }

  const hardBoundaryViolations = current.hardBoundaryViolations ?? findHardBoundaryViolations(current.importBoundaryEdges ?? []);
  if (hardBoundaryViolations.length) {
    issues.push(
      `hard-boundaries: ${hardBoundaryViolations.length} production main/renderer imports: ${hardBoundaryViolations.join(" | ")}`,
    );
  }

  for (const [file, lines] of Object.entries(current.largeFileLineCeilings ?? {})) {
    const baselineCeiling = baseline.largeFileLineCeilings?.[file];
    const exceptionCeiling = exceptions.largeFiles?.[file]?.lineCeiling;
    const ceiling = Math.max(baselineCeiling ?? 0, exceptionCeiling ?? 0);
    if (!ceiling) {
      issues.push(`large-file: new file ${file} has ${lines} lines above threshold ${current.largeFileLineThreshold}`);
    } else if (lines > ceiling) {
      issues.push(`large-file: ${file} grew from ceiling ${ceiling} to ${lines} lines`);
    }
  }

  for (const [id, currentCeiling] of Object.entries(current.hotspotCeilings ?? {})) {
    const baselineCeiling = baseline.hotspotCeilings?.[id];
    if (!baselineCeiling) continue;
    const exception = exceptions.hotspots?.[id] ?? {};
    const fileCeiling = Math.max(baselineCeiling.fileLines ?? 0, exception.fileLines ?? 0);
    const declarationCeiling = Math.max(baselineCeiling.declarationLines ?? 0, exception.declarationLines ?? 0);
    if (currentCeiling.fileLines > fileCeiling) {
      issues.push(`hotspot-size: ${id} file lines grew from ceiling ${fileCeiling} to ${currentCeiling.fileLines}`);
    }
    if (currentCeiling.declarationLines && currentCeiling.declarationLines > declarationCeiling) {
      issues.push(`hotspot-size: ${id} declaration lines grew from ceiling ${declarationCeiling} to ${currentCeiling.declarationLines}`);
    }
  }

  if ((current.lint?.totalErrors ?? 0) > (baseline.lint?.totalErrors ?? 0)) {
    issues.push(`lint: errors increased from ${baseline.lint?.totalErrors ?? 0} to ${current.lint.totalErrors}`);
  }
  const warningCeiling = exceptions.lintTotalWarnings ?? baseline.lint?.totalWarnings ?? 0;
  if ((current.lint?.totalWarnings ?? 0) > warningCeiling) {
    issues.push(`lint: warnings increased from ceiling ${warningCeiling} to ${current.lint.totalWarnings}`);
  }
  for (const [ruleId, count] of Object.entries(current.lint?.ruleCounts ?? {})) {
    const baselineCount = baseline.lint?.ruleCounts?.[ruleId] ?? 0;
    const exceptionCount = exceptions.lintRuleCounts?.[ruleId]?.count ?? 0;
    const ceiling = Math.max(baselineCount, exceptionCount);
    if (count > ceiling) {
      issues.push(`lint: ${ruleId} warnings increased from ceiling ${ceiling} to ${count}`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function renderGuardrailSnapshotMarkdown(snapshot, comparison) {
  const lines = [
    "# Simplification V3 Guardrail Ratchets",
    "",
    `Schema version: ${snapshot.schemaVersion}`,
    "",
    "| Metric | Current |",
    "| --- | ---: |",
    `| source files | ${formatNumber(snapshot.metrics.sourceFiles)} |`,
    `| flat src/main files | ${formatNumber(snapshot.metrics.srcMainFlatFiles)} |`,
    `| nested src/main files | ${formatNumber(snapshot.metrics.srcMainNestedFiles)} |`,
    `| shared/types importers | ${formatNumber(snapshot.metrics.sharedTypesImporters)} |`,
    `| relative import cycles | ${formatNumber(snapshot.metrics.importCycles)} |`,
    `| import-boundary edges | ${formatNumber(snapshot.metrics.importBoundaryEdges)} |`,
    `| hard boundary violations | ${formatNumber(snapshot.metrics.hardBoundaryViolations ?? 0)} |`,
    `| files at/above ${formatNumber(snapshot.largeFileLineThreshold)} lines | ${formatNumber(snapshot.metrics.largeFiles)} |`,
    `| lint errors / warnings | ${formatNumber(snapshot.lint.totalErrors)} / ${formatNumber(snapshot.lint.totalWarnings)} |`,
    "",
    comparison?.ok ? "Guardrail ratchets passed." : "Guardrail ratchets failed.",
  ];

  if (comparison && !comparison.ok) {
    lines.push("", ...comparison.issues.map((issue) => `- ${issue}`));
  }

  lines.push("");
  return lines.join("\n");
}

function readBaseline(root, baselinePath = BASELINE_PATH) {
  const fullPath = resolve(root, baselinePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing guardrail baseline at ${baselinePath}. Run pnpm run simplification:v3:guardrails:update first.`);
  }
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function writeBaseline(root, snapshot, baselinePath = BASELINE_PATH) {
  writeFileSync(resolve(root, baselinePath), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function readComplexityReport(root) {
  const output = execFileSync(process.execPath, ["scripts/simplification-complexity-inventory.mjs", "--json", "--limit", "10000"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function gitTrackedFiles(root) {
  const output = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  return output.split("\n").filter(Boolean);
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

function guardrailDetails(scorecard, id) {
  return scorecard.advisoryGuardrails.find((entry) => entry.id === id)?.details ?? {};
}

function buildImportGraph(root, sourceFiles) {
  const sourceFileSet = new Set(sourceFiles);
  const graph = new Map();

  for (const file of sourceFiles) {
    const text = readFileSync(resolve(root, file), "utf8");
    const imports = new Set();
    for (const specifier of importSpecifiers(text)) {
      const target = resolveImportTarget(file, specifier, sourceFileSet);
      if (target && target !== file) imports.add(target);
    }
    graph.set(file, [...imports].sort());
  }

  return graph;
}

function buildImportersByTarget(importGraph) {
  const importersByTarget = new Map();
  for (const [file, imports] of importGraph.entries()) {
    for (const target of imports) {
      const importers = importersByTarget.get(target) ?? new Set();
      importers.add(file);
      importersByTarget.set(target, importers);
    }
  }
  return importersByTarget;
}

function findImportCycles(importGraph) {
  const cycles = new Set();
  const visited = new Set();
  const stack = [];
  const onStack = new Set();

  function visit(file) {
    visited.add(file);
    stack.push(file);
    onStack.add(file);

    for (const importedFile of importGraph.get(file) ?? []) {
      if (!visited.has(importedFile)) {
        visit(importedFile);
      } else if (onStack.has(importedFile)) {
        const cycleStart = stack.indexOf(importedFile);
        if (cycleStart !== -1) cycles.add(canonicalCycle([...stack.slice(cycleStart), importedFile]));
      }
    }

    stack.pop();
    onStack.delete(file);
  }

  for (const file of [...importGraph.keys()].sort()) {
    if (!visited.has(file)) visit(file);
  }

  return [...cycles].sort();
}

function findImportBoundaryEdges(importGraph) {
  const edges = new Set();
  for (const [file, imports] of importGraph.entries()) {
    for (const importedFile of imports) {
      const edge = classifyImportBoundaryEdge(file, importedFile);
      if (edge) edges.add(edge);
    }
  }
  return [...edges].sort();
}

function findHardBoundaryViolations(importBoundaryEdges) {
  return importBoundaryEdges.map(hardBoundaryViolationForEdge).filter(Boolean).sort();
}

function hardBoundaryViolationForEdge(edge) {
  const crossLayerMatch = /^(main-to-renderer|renderer-to-main):(.+)->(.+)$/.exec(edge);
  if (!crossLayerMatch) return undefined;

  const [, kind, importer, target] = crossLayerMatch;
  if (isTestFile(importer)) return undefined;

  return `${kind}:${importer}->${target}`;
}

export function classifyImportBoundaryEdge(importer, target) {
  const importerMainOwner = mainOwnerDirectory(importer);
  const targetMainOwner = mainOwnerDirectory(target);
  if (importerMainOwner && targetMainOwner && importerMainOwner !== targetMainOwner) {
    return `main-owner-peer:${importerMainOwner}->${targetMainOwner}:${importer}->${target}`;
  }

  if (importer.startsWith("src/main/") && target.startsWith("src/renderer/")) {
    return `main-to-renderer:${importer}->${target}`;
  }

  if (importer.startsWith("src/renderer/") && target.startsWith("src/main/")) {
    return `renderer-to-main:${importer}->${target}`;
  }

  if (importer.startsWith("src/shared/") && (target.startsWith("src/main/") || target.startsWith("src/renderer/"))) {
    return `shared-reaches-up:${importer}->${target}`;
  }

  return undefined;
}

function mainOwnerDirectory(file) {
  return /^src\/main\/([^/]+)\//.exec(file)?.[1];
}

function isTestFile(file) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  let best;
  for (let index = 0; index < nodes.length; index += 1) {
    const rotated = [...nodes.slice(index), ...nodes.slice(0, index)].join(" -> ");
    if (!best || rotated < best) best = rotated;
  }
  return best;
}

function importSpecifiers(text) {
  const specifiers = [];
  const pattern = /\bfrom\s+["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm;
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

function readLintSummary(root) {
  const result = spawnSync("pnpm", ["exec", "eslint", ...LINT_TARGETS, "--format", "json", "--no-error-on-unmatched-pattern"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (!result.stdout.trim()) {
    throw new Error(result.stderr.trim() || "ESLint did not return JSON output");
  }

  const reports = JSON.parse(result.stdout);
  const ruleCounts = {};
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const report of reports) {
    totalErrors += report.errorCount ?? 0;
    totalWarnings += report.warningCount ?? 0;
    for (const message of report.messages ?? []) {
      if (message.severity !== 1) continue;
      const ruleId = message.ruleId ?? "unknown-rule";
      ruleCounts[ruleId] = (ruleCounts[ruleId] ?? 0) + 1;
    }
  }

  return {
    totalErrors,
    totalWarnings,
    ruleCounts: Object.fromEntries(Object.entries(ruleCounts).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  return {
    check: args.includes("--check"),
    json: args.includes("--json"),
    updateBaseline: args.includes("--update-baseline"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function usage() {
  return [
    "Usage: node scripts/simplification-v3-guardrail-ratchets.mjs [--check] [--json] [--update-baseline]",
    "",
    "Builds or checks the Simplification V3 Phase 6 local guardrail baseline.",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const snapshot = buildGuardrailSnapshot();
  if (args.updateBaseline) {
    writeBaseline(repoRoot, snapshot);
    process.stdout.write(`Updated ${BASELINE_PATH}\n`);
    return;
  }

  const baseline = readBaseline(repoRoot);
  const comparison = compareGuardrailSnapshots(snapshot, baseline);
  if (args.check && !comparison.ok) {
    process.stderr.write(`${comparison.issues.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    args.json ? `${JSON.stringify({ snapshot, comparison }, null, 2)}\n` : renderGuardrailSnapshotMarkdown(snapshot, comparison),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
