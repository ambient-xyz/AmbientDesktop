#!/usr/bin/env node
import {
  buildSubagentLiveConfidencePlan,
  runSubagentLiveConfidence,
} from "./subagent-live-confidence-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const reportPath = buildSubagentLiveConfidencePlan(args).outputPath;
const interrupt = createInterruptController();
let evidence;
try {
  evidence = await runSubagentLiveConfidence({
    outputPath: args.outputPath,
    timeoutMs: args.timeoutMs,
    sliceId: args.sliceId,
    sliceKind: args.sliceKind,
    hypothesis: args.hypothesis,
    expectedObservation: args.expectedObservation,
    providerId: args.providerId,
    liveWorkflowArtifactPath: args.liveWorkflowArtifactPath,
    liveCallableWorkflowDogfoodArtifactPath: args.liveCallableWorkflowDogfoodArtifactPath,
    liveCallableWorkflowRehydrationArtifactPath: args.liveCallableWorkflowRehydrationArtifactPath,
    liveLocalRuntimeArtifactPath: args.liveLocalRuntimeArtifactPath,
    liveLocalRuntimeGateArtifactPath: args.liveLocalRuntimeGateArtifactPath,
    liveRestartRepairArtifactPath: args.liveRestartRepairArtifactPath,
    liveRestartRepairFixtureArtifactPath: args.liveRestartRepairFixtureArtifactPath,
    liveLifecycleEdgeArtifactPath: args.liveLifecycleEdgeArtifactPath,
    liveDesktopDogfoodArtifactPath: args.liveDesktopDogfoodArtifactPath,
    abortSignal: interrupt.signal,
  });
} finally {
  interrupt.dispose();
}

if (!evidence) throw new Error("Sub-agent live confidence did not produce evidence.");

process.stdout.write(`Sub-agent live confidence: ${evidence.status}\n`);
process.stdout.write(`Report: ${reportPath}\n`);
if (evidence.classifiedBlockers.length) {
  process.stdout.write("\nBlockers:\n");
  for (const blocker of evidence.classifiedBlockers) {
    process.stdout.write(`- ${blocker.kind}: ${blocker.summary}\n`);
  }
}
if (evidence.productIssues.length) {
  process.stdout.write("\nProduct issues:\n");
  for (const issue of evidence.productIssues) {
    process.stdout.write(`- ${issue.severity}: ${issue.summary}\n`);
  }
}

if ((args.strict && evidence.status !== "passed") || interrupt.interrupted) process.exitCode = 1;

function createInterruptController() {
  const controller = new AbortController();
  let interrupted = false;
  const onSignal = (signal) => {
    interrupted = true;
    if (!controller.signal.aborted) controller.abort({ signal });
  };
  const onSigint = () => onSignal("SIGINT");
  const onSigterm = () => onSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return {
    signal: controller.signal,
    get interrupted() {
      return interrupted;
    },
    dispose() {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    },
  };
}

function parseArgs(argv) {
  const parsed = {
    outputPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_OUT || undefined,
    timeoutMs: Number(process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_TIMEOUT_MS || "") || undefined,
    sliceId: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_SLICE_ID || undefined,
    sliceKind: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_SLICE_KIND || undefined,
    hypothesis: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_HYPOTHESIS || undefined,
    expectedObservation: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_EXPECTED_OBSERVATION || undefined,
    liveWorkflowArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_WORKFLOW_ARTIFACT || undefined,
    liveCallableWorkflowDogfoodArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_CALLABLE_WORKFLOW_DOGFOOD_ARTIFACT || undefined,
    liveCallableWorkflowRehydrationArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_CALLABLE_WORKFLOW_REHYDRATION_ARTIFACT || undefined,
    liveLocalRuntimeArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_LOCAL_RUNTIME_ARTIFACT || undefined,
    liveLocalRuntimeGateArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_LOCAL_RUNTIME_GATE_ARTIFACT || undefined,
    liveRestartRepairArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_RESTART_REPAIR_ARTIFACT || undefined,
    liveRestartRepairFixtureArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_RESTART_REPAIR_FIXTURE_ARTIFACT || undefined,
    liveLifecycleEdgeArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_LIFECYCLE_EDGE_ARTIFACT || undefined,
    liveDesktopDogfoodArtifactPath: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_DESKTOP_DOGFOOD_ARTIFACT || undefined,
    providerId: process.env.AMBIENT_PROVIDER || "ambient",
    strict: process.env.AMBIENT_SUBAGENT_LIVE_CONFIDENCE_STRICT !== "0",
  };
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--allow-blocked") {
      parsed.strict = false;
    } else if (arg === "--strict") {
      parsed.strict = true;
    } else if (arg.startsWith("--out=")) {
      parsed.outputPath = arg.slice("--out=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg.startsWith("--slice-id=")) {
      parsed.sliceId = arg.slice("--slice-id=".length);
    } else if (arg.startsWith("--slice-kind=")) {
      parsed.sliceKind = arg.slice("--slice-kind=".length);
    } else if (arg.startsWith("--hypothesis=")) {
      parsed.hypothesis = arg.slice("--hypothesis=".length);
    } else if (arg.startsWith("--expected-observation=")) {
      parsed.expectedObservation = arg.slice("--expected-observation=".length);
    } else if (arg.startsWith("--workflow-artifact=")) {
      parsed.liveWorkflowArtifactPath = arg.slice("--workflow-artifact=".length);
    } else if (arg.startsWith("--callable-workflow-dogfood-artifact=")) {
      parsed.liveCallableWorkflowDogfoodArtifactPath = arg.slice("--callable-workflow-dogfood-artifact=".length);
    } else if (arg.startsWith("--callable-workflow-rehydration-artifact=")) {
      parsed.liveCallableWorkflowRehydrationArtifactPath = arg.slice("--callable-workflow-rehydration-artifact=".length);
    } else if (arg.startsWith("--local-runtime-artifact=")) {
      parsed.liveLocalRuntimeArtifactPath = arg.slice("--local-runtime-artifact=".length);
    } else if (arg.startsWith("--local-runtime-gate-artifact=")) {
      parsed.liveLocalRuntimeGateArtifactPath = arg.slice("--local-runtime-gate-artifact=".length);
    } else if (arg.startsWith("--restart-repair-artifact=")) {
      parsed.liveRestartRepairArtifactPath = arg.slice("--restart-repair-artifact=".length);
    } else if (arg.startsWith("--restart-repair-fixture-artifact=")) {
      parsed.liveRestartRepairFixtureArtifactPath = arg.slice("--restart-repair-fixture-artifact=".length);
    } else if (arg.startsWith("--lifecycle-edge-artifact=")) {
      parsed.liveLifecycleEdgeArtifactPath = arg.slice("--lifecycle-edge-artifact=".length);
    } else if (arg.startsWith("--desktop-dogfood-artifact=")) {
      parsed.liveDesktopDogfoodArtifactPath = arg.slice("--desktop-dogfood-artifact=".length);
    } else if (arg.startsWith("--provider=")) {
      parsed.providerId = arg.slice("--provider=".length);
    } else {
      throw new Error(`Unknown sub-agent live confidence argument: ${arg}`);
    }
  }
  return parsed;
}
