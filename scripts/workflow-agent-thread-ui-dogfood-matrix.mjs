#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  workflowUiDogfoodSnapshotPreflight,
  workflowUiDogfoodSnapshotPreflightErrorMessage,
} from "./workflow-ui-dogfood-contract.mjs";

const startedAt = new Date().toISOString();
const scenarioArg = valueForArg("--scenarios");
const suiteArg = valueForArg("--suite");
const keepArtifacts = process.argv.includes("--keep");
const scenarioSuites = {
  "phase0-live": ["vocabulary-quiz", "local-file-classifier"],
  "phase1-live": [
    "gmail-20-metadata-readonly-validation",
    "downloads-document-categorization",
    "public-source-browser",
    "current-web-recipe-report",
  ],
  "phase7-abstraction": ["vocabulary-quiz", "public-source-browser", "local-file-classifier"],
};
const scenarios = resolveScenarios();
const basePort = Number(valueForArg("--port") || process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_CDP_PORT || 9647);
const reportRoot = resolve("test-results", "workflow-agent-thread-ui-dogfood");
const matrixReportPath = join(reportRoot, "matrix-latest.json");
const matrixReportPaths = uniqueStrings([
  matrixReportPath,
  suiteArg ? join(reportRoot, `${safeFilePart(suiteArg)}-matrix-latest.json`) : undefined,
]);
const snapshotPreflight = workflowUiDogfoodSnapshotPreflight({ env: process.env });
const results = [];

if (!scenarios.length) throw new Error("No dogfood scenarios were requested.");

if (snapshotPreflight.requested && !snapshotPreflight.ok) {
  const message = workflowUiDogfoodSnapshotPreflightErrorMessage(snapshotPreflight);
  const failure = {
    scenario: scenarios[0] ?? "snapshot-preflight",
    ok: false,
    exitCode: 1,
    elapsedMs: 0,
    classification: "environment/snapshot issue",
    runStatus: "not-started",
    preflight: snapshotPreflight,
    stderrTail: message,
  };
  await writeMatrixReport(false, failure);
  console.error(`Workflow Agent UI dogfood classification: environment/snapshot issue`);
  console.error(message);
  process.exitCode = 1;
} else {
  for (const [index, scenario] of scenarios.entries()) {
    const port = basePort + index;
    const args = ["scripts/workflow-agent-thread-ui-dogfood.mjs", `--scenario=${scenario}`, `--port=${port}`];
    if (keepArtifacts) args.push("--keep");
    const run = await runScenario(scenario, args);
    results.push(run);
    await writeMatrixReport(false);
  }

  await writeMatrixReport(true);
  console.log(JSON.stringify(compactMatrixReport(), null, 2));
  console.log(`Workflow Agent thread UI dogfood matrix passed. Report: ${matrixReportPath}`);
}

async function runScenario(scenario, args) {
  const started = Date.now();
  console.log(`[dogfood-matrix] ${scenario} started on CDP port ${args.find((arg) => arg.startsWith("--port="))?.slice("--port=".length)}`);
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_WORKFLOW_UI_DOGFOOD_PROVIDER_IDLE_RETRIES: process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_PROVIDER_IDLE_RETRIES ?? "4",
      AMBIENT_WORKFLOW_UI_DOGFOOD_PROVIDER_IDLE_RETRY_BASE_MS: process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_PROVIDER_IDLE_RETRY_BASE_MS ?? "5000",
      AMBIENT_WORKFLOW_UI_DOGFOOD_PERMISSION_MODE: process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_PERMISSION_MODE ?? "full-access",
      AMBIENT_LEGACY_WORKFLOW_COMPILER: process.env.AMBIENT_LEGACY_WORKFLOW_COMPILER ?? "1",
      AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS: process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS ?? "90000",
      AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS: process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS ?? "24000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stderr += text;
    process.stderr.write(text);
  });
  const exitCode = await new Promise((resolvePromise) => child.once("exit", (code) => resolvePromise(code ?? 0)));
  const elapsedMs = Date.now() - started;
  const reportPath = join(reportRoot, scenario, "latest.json");
  const scenarioReport = existsSync(reportPath) ? JSON.parse(await readFile(reportPath, "utf8")) : undefined;
  const result = {
    scenario,
    ok: exitCode === 0 && scenarioReport?.ok === true,
    exitCode,
    elapsedMs,
    reportPath,
    harness: compactHarness(scenarioReport?.harness),
    launch: compactLaunchSummary(scenarioReport?.launch),
    classification: scenarioReport?.classification,
    runStatus: scenarioReport?.run?.status,
    artifact: scenarioReport?.artifact?.title,
    manifest: scenarioReport?.sourceAssertions?.manifest ?? scenarioReport?.manifest,
    promptAssembly: compactPromptAssembly(scenarioReport?.sourceAssertions?.promptAssembly),
    compileContext: compactCompileContext(scenarioReport?.sourceAssertions?.compileContext),
    validationReport: compactValidationReport(scenarioReport?.sourceAssertions?.validationReport),
    abstractionContract: compactAbstractionContract(scenarioReport?.sourceAssertions?.abstractionContract ?? scenarioReport?.abstractionContract),
    finalOutput: scenarioReport?.scenarioAssertions?.finalOutput,
    runEvidence: scenarioReport?.runEvidence,
    scenarioAssertions: scenarioReport?.scenarioAssertions,
    uiAssertions: scenarioReport?.uiAssertions,
    screenshots: (scenarioReport?.screenshots ?? []).map((shot) => ({ name: shot.name, file: basename(shot.path), bytes: shot.bytes })),
    stdoutTail: stdout.split("\n").slice(-40).join("\n"),
    stderrTail: stderr.split("\n").slice(-40).join("\n"),
  };
  if (!result.ok) {
    await writeMatrixReport(false, result);
    throw new Error(`Dogfood scenario ${scenario} failed with exit code ${exitCode}. Report: ${reportPath}`);
  }
  console.log(`[dogfood-matrix] ${scenario} passed in ${elapsedMs}ms`);
  return result;
}

async function writeMatrixReport(ok, failure) {
  await mkdir(reportRoot, { recursive: true });
  const report = {
    ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    suite: suiteArg,
    scenarios,
    results,
    failure,
    blocked: snapshotPreflight.requested && !snapshotPreflight.ok,
    classification: failure?.classification,
    preflight: snapshotPreflight.requested ? snapshotPreflight : undefined,
  };
  for (const path of matrixReportPaths) {
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
}

function compactMatrixReport() {
  return {
    ok: true,
    suite: suiteArg,
    scenarios,
    results: results.map((result) => ({
      scenario: result.scenario,
      workspaceMode: result.launch?.workspaceMode,
      googleWorkspace: result.launch?.googleWorkspace?.status,
      runStatus: result.runStatus,
      scenarioAssertions: result.scenarioAssertions?.passed,
      uiAssertions: result.uiAssertions?.passed,
      desktopToolEnds: result.runEvidence?.desktopToolEnds,
      promptModules: result.promptAssembly?.moduleIds,
      selectedRecipes: result.compileContext?.selectedRecipeIds,
      rejectedRecipes: result.compileContext?.rejectedRecipeIds,
      validationStatus: result.validationReport?.status,
      finalOutput: result.finalOutput,
      abstractionContract: result.abstractionContract?.id,
      screenshots: result.screenshots?.map((shot) => shot.file),
    })),
  };
}

function compactHarness(harness) {
  if (!harness) return undefined;
  return {
    name: harness.name,
    runId: harness.runId,
    snapshotMode: harness.snapshotMode,
    snapshotRootLabel: harness.snapshotRootLabel,
    snapshotRootPathDigest: harness.snapshotRootPathDigest,
    pathsAreMachineLocal: harness.pathsAreMachineLocal === true,
  };
}

function compactLaunchSummary(launch) {
  if (!launch) return undefined;
  return {
    providerId: launch.providerId,
    providerLabel: launch.providerLabel,
    workspaceMode: launch.workspaceMode,
    credentialConfigured: launch.credentialConfigured === true,
    credentialSources: Array.isArray(launch.credentialSources) ? launch.credentialSources : [],
    googleWorkspace: launch.googleWorkspace
      ? {
          status: launch.googleWorkspace.status,
          binarySource: launch.googleWorkspace.binarySource,
          configSource: launch.googleWorkspace.configSource,
          binaryConfigured: launch.googleWorkspace.binaryConfigured === true,
          configConfigured: launch.googleWorkspace.configConfigured === true,
        }
      : undefined,
  };
}

function compactPromptAssembly(promptAssembly) {
  if (!promptAssembly) return undefined;
  return {
    path: promptAssembly.path,
    moduleCount: promptAssembly.moduleCount,
    moduleIds: promptAssembly.moduleIds ?? [],
    requiredModuleIds: promptAssembly.requiredModuleIds ?? [],
    forbiddenModuleFragments: promptAssembly.forbiddenModuleFragments ?? [],
  };
}

function compactCompileContext(compileContext) {
  if (!compileContext) return undefined;
  return {
    path: compileContext.path,
    selectedRecipeIds: compileContext.selectedRecipeIds ?? [],
    rejectedRecipeIds: compileContext.rejectedRecipeIds ?? [],
    policyImplicationIds: compileContext.policyImplicationIds ?? [],
  };
}

function compactValidationReport(validationReport) {
  if (!validationReport) return undefined;
  return {
    path: validationReport.path,
    status: validationReport.status,
    validatorIds: validationReport.validatorIds ?? validationReport.validators?.map((validator) => validator.id) ?? [],
    failedValidatorIds:
      validationReport.failedValidatorIds ??
      validationReport.validators?.filter((validator) => validator.status === "failed").map((validator) => validator.id) ??
      [],
  };
}

function compactAbstractionContract(contract) {
  if (!contract) return undefined;
  return {
    passed: contract.passed,
    id: contract.id,
    contractType: contract.contractType,
    proves: contract.proves ?? [],
    promptAssembly: contract.promptAssembly
      ? {
          moduleCount: contract.promptAssembly.moduleCount,
          moduleIds: contract.promptAssembly.moduleIds ?? [],
          requiredModuleIds: contract.promptAssembly.requiredModuleIds ?? [],
          forbiddenModuleFragments: contract.promptAssembly.forbiddenModuleFragments ?? [],
        }
      : undefined,
    compileContext: contract.compileContext
      ? {
          selectedRecipeIds: contract.compileContext.selectedRecipeIds ?? [],
          rejectedRecipeIds: contract.compileContext.rejectedRecipeIds ?? [],
          policyImplicationIds: contract.compileContext.policyImplicationIds ?? [],
        }
      : undefined,
  };
}

function valueForArg(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function resolveScenarios() {
  if (scenarioArg) return scenarioArg.split(",").map((item) => item.trim()).filter(Boolean);
  if (!suiteArg) return scenarioSuites["phase7-abstraction"];
  const suiteScenarios = scenarioSuites[suiteArg];
  if (!suiteScenarios) {
    throw new Error(`Unknown dogfood matrix suite "${suiteArg}". Available suites: ${Object.keys(scenarioSuites).join(", ")}`);
  }
  return suiteScenarios;
}

function safeFilePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "workflow-ui-dogfood-matrix";
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}
