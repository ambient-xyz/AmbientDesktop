#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "provider-restart-behavior");
const latestArtifactPath = join(resultsDir, "latest.json");
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-provider-restart-behavior-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const authorityStateRoot = join(userDataPath, "authority-state");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "moonshotai/kimi-k2.7-code";
const hiddenContinuationNeedle = "Continue working toward the active Ambient Desktop thread goal.";
const cdpCommandTimeoutMs = 10_000;
const GATE_A = "gate-a-hidden-goal-continuation-provider-stall";
const GATE_B = "gate-b-post-tool-provider-stall";
const GATE_C = "gate-c-provider-retry-cap";
const GATE_D = "gate-d-no-stall-live-smoke";
const providerInfrastructureFailureLimit = 2;
const providerContinuationNeedle = "Ambient/Pi provider stream was interrupted. Continue the same user request";
const gateBMarkerText = "provider-restart-gate-b-side-effect";
const gateDResponseText = "provider-restart-gate-d-ok";
const gateBMarkerPath = join(workspacePath, "provider-restart-gate-b-side-effect.log");
const selectedGateId = parseGateArg(process.argv.slice(2));
const gateConfig = providerRestartGateConfig(selectedGateId);
const failpointLimit = gateConfig.failpointLimit;
const failpointResponseMs = Math.max(6_000, Math.floor(Number(process.env.AMBIENT_PROVIDER_RESTART_DOGFOOD_FAILPOINT_RESPONSE_MS || 12_000)));
const providerTimeoutMs = gateConfig.providerTimeoutMs;

let exitCode = 0;
let dogfoodEnv;
let failpointProxy;

function parseGateArg(argv) {
  let gate = GATE_A;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--gate") {
      gate = argv[++index];
    } else if (arg?.startsWith("--gate=")) {
      gate = arg.slice("--gate=".length);
    } else if (arg === "--help") {
      process.stdout.write(`Usage: provider-restart-behavior-dogfood.mjs --gate=<${[GATE_A, GATE_B, GATE_C, GATE_D].join("|")}>\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown provider restart dogfood argument: ${arg}`);
    }
  }
  return normalizeGateId(gate);
}

function normalizeGateId(value) {
  const normalized = String(value ?? "").trim();
  const aliases = new Map([
    [GATE_A, GATE_A],
    ["hidden-goal-continuation-provider-stall", GATE_A],
    ["hidden_goal_continuation_provider_stall", GATE_A],
    ["gate-a", GATE_A],
    [GATE_B, GATE_B],
    ["post-tool-provider-stall", GATE_B],
    ["post_tool_provider_stall", GATE_B],
    ["gate-b", GATE_B],
    [GATE_C, GATE_C],
    ["provider-retry-cap", GATE_C],
    ["provider_retry_cap", GATE_C],
    ["gate-c", GATE_C],
    [GATE_D, GATE_D],
    ["no-stall-live-smoke", GATE_D],
    ["no_stall_live_smoke", GATE_D],
    ["gate-d", GATE_D],
  ]);
  const gateId = aliases.get(normalized);
  if (!gateId) throw new Error(`Unsupported provider restart dogfood gate: ${value}`);
  return gateId;
}

function providerRestartGateConfig(gateId) {
  const failpointOverride = process.env.AMBIENT_PROVIDER_RESTART_DOGFOOD_FAILPOINT_COUNT;
  const failpointCount = (defaultValue) => {
    if (failpointOverride === undefined || failpointOverride === "") return defaultValue;
    return Math.max(0, Math.floor(Number(failpointOverride)));
  };
  const stallTimeoutMs = Math.max(5_000, Math.floor(Number(process.env.AMBIENT_PROVIDER_RESTART_DOGFOOD_PROVIDER_TIMEOUT_MS || 5_000)));
  const noStallTimeoutMs = Math.max(30_000, Math.floor(Number(process.env.AMBIENT_PROVIDER_RESTART_DOGFOOD_NO_STALL_TIMEOUT_MS || 30_000)));
  if (gateId === GATE_B) {
    return {
      gateId,
      mode: "after_tool_result",
      name: "post-tool provider stall",
      failpointLimit: failpointCount(1),
      providerTimeoutMs: stallTimeoutMs,
    };
  }
  if (gateId === GATE_C) {
    return {
      gateId,
      mode: "provider_retry_cap",
      name: "provider retry cap",
      failpointLimit: failpointCount(providerInfrastructureFailureLimit),
      providerTimeoutMs: stallTimeoutMs,
    };
  }
  if (gateId === GATE_D) {
    return {
      gateId,
      mode: "none",
      name: "no-stall live smoke",
      failpointLimit: failpointCount(0),
      providerTimeoutMs: noStallTimeoutMs,
    };
  }
  return {
    gateId,
    mode: "hidden_or_provider_continuation",
    name: "hidden goal continuation provider stall",
    failpointLimit: failpointCount(1),
    providerTimeoutMs: stallTimeoutMs,
  };
}

try {
  await rm(latestArtifactPath, { force: true });
  await seedWorkspace();
  failpointProxy = await startAmbientFailpointProxy();
  dogfoodEnv = buildDogfoodEnv(failpointProxy.baseUrl);
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await runProviderRestartDogfood(failpointProxy);
} catch (error) {
  exitCode = 1;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
} finally {
  if (failpointProxy) await closeProxy(failpointProxy);
  try {
    await run("pnpm", ["run", "prepare:node-native"], dogfoodEnv ?? buildDogfoodEnv("http://127.0.0.1:9"));
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  if (process.env.AMBIENT_PROVIDER_RESTART_DOGFOOD_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Provider restart dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

async function seedWorkspace() {
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  const sourceUserData = dogfoodSourceUserDataPath();
  if (sourceUserData) await cp(sourceUserData, userDataPath, { recursive: true, force: true });
  await writeFile(
    join(workspacePath, "README.md"),
    "# Provider Restart Behavior Dogfood\n\nThis workspace is disposable and intentionally small.\n",
    "utf8",
  );
}

function dogfoodSourceUserDataPath() {
  const value = process.env.AMBIENT_PROVIDER_RESTART_DOGFOOD_SOURCE_USER_DATA || process.env.AMBIENT_E2E_USER_DATA;
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!existsSync(trimmed)) throw new Error("Configured provider restart dogfood source userData path does not exist.");
  return trimmed;
}

async function runProviderRestartDogfood(proxyRef) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifacts = {};
  let app;
  let cdp;
  let threadId;
  try {
    const port = dogfoodCdpPort();
    app = launchDesktop(port, proxyRef.baseUrl);
    cdp = await connectToElectron(port, app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await waitForText(cdp, "Ambient", 45_000);
    await waitForText(cdp, expectedProviderLabel(), 45_000);

    const apiKeyCheck = await evaluate(cdp, () => window.ambientDesktop.testAmbientApiKey(), [], 45_000);
    if (!apiKeyCheck?.ok) throw new Error(`Ambient API key check failed through failpoint proxy: ${apiKeyCheck?.message ?? "unknown error"}`);

    const state = await evaluate(cdp, (model, preStreamTimeoutMs, streamIdleTimeoutMs) => {
      return window.ambientDesktop.updateModelRuntimeSettings({
        aggressiveRetries: false,
        providerPreStreamTimeoutMs: preStreamTimeoutMs,
        providerStreamIdleTimeoutMs: streamIdleTimeoutMs,
      }).then(() => window.ambientDesktop.createThread({
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "low",
      }));
    }, [dogfoodModel(), providerTimeoutMs, providerTimeoutMs], 45_000);
    threadId = state?.activeThreadId;
    if (!threadId) throw new Error("Provider restart dogfood could not create an active thread.");

    proxyRef.state.failpointArmed = true;
    if (selectedGateId === GATE_D) {
      await evaluate(cdp, (targetThreadId, content, model) => {
        void window.ambientDesktop.sendMessage({
          threadId: targetThreadId,
          content,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model,
          thinkingLevel: "low",
        });
        return true;
      }, [threadId, gateGoalObjective(selectedGateId), dogfoodModel()], 45_000);
    } else {
      const pausedGoal = await evaluate(cdp, (targetThreadId, objective) => {
        return window.ambientDesktop.setThreadGoal({ threadId: targetThreadId, objective, status: "paused" });
      }, [threadId, gateGoalObjective(selectedGateId)], 45_000);
      if (pausedGoal?.status !== "paused") throw new Error(`Provider restart dogfood could not seed a paused test goal: ${pausedGoal?.status ?? "missing"}`);
      const goal = await evaluate(cdp, (targetThreadId, expectedGoalId) => {
        return window.ambientDesktop.setThreadGoal({
          threadId: targetThreadId,
          expectedGoalId,
          status: "active",
        });
      }, [threadId, pausedGoal.goalId], 45_000);
      if (goal?.status !== "active") throw new Error(`Provider restart dogfood could not activate the test goal: ${goal?.status ?? "missing"}`);
    }
    artifacts.initialScreenshot = await writeScreenshot(cdp, "provider-restart-initial.png");

    await waitForDogfoodCheck(
      cdp,
      threadId,
      proxyRef,
      (checks) => dogfoodGateReady(selectedGateId, checks),
      `${gateConfig.name} gate`,
      gateWaitTimeoutMs(selectedGateId),
    );
    artifacts.finalScreenshot = await writeScreenshot(cdp, `provider-restart-${selectedGateId}-final.png`);

    const checks = await collectChecks(cdp, threadId, proxyRef);
    assertChecks(selectedGateId, checks);
    await writeReport({
      schemaVersion: "ambient-provider-restart-behavior-dogfood-v2",
      status: "passed",
      classification: "passed",
      gateId: selectedGateId,
      gateName: gateConfig.name,
      generatedAt: new Date().toISOString(),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      gitCommit: gitValue(["rev-parse", "HEAD"]),
      gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      provider: DEFAULT_DOGFOOD_PROVIDER,
      model: dogfoodModel(),
      headful: true,
      cdpPort: port,
      threadId,
      scenarios: [selectedGateId],
      failpoint: proxyEvidence(proxyRef),
      checks,
      artifacts,
    });
  } catch (error) {
    if (cdp) {
      try {
        artifacts.failureScreenshot = await writeScreenshot(cdp, "provider-restart-failure.png");
      } catch {
        // Preserve the original failure.
      }
    }
    await writeReport({
      schemaVersion: "ambient-provider-restart-behavior-dogfood-v2",
      status: "failed",
      classification: "failed",
      gateId: selectedGateId,
      gateName: gateConfig.name,
      generatedAt: new Date().toISOString(),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      gitCommit: gitValue(["rev-parse", "HEAD"]),
      gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      provider: DEFAULT_DOGFOOD_PROVIDER,
      model: dogfoodModel(),
      headful: true,
      cdpPort: cdpPortFromEnv() ?? -1,
      threadId,
      scenarios: [selectedGateId],
      failpoint: proxyEvidence(proxyRef),
      checks: threadId ? await collectChecks(cdp, threadId, proxyRef).catch(() => ({})) : {},
      artifacts,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    throw error;
  } finally {
    cdp?.close();
    await terminateApp(app);
  }
}

function gateGoalObjective(gateId) {
  if (gateId === GATE_B) {
    return [
      "This is Gate B for live Ambient provider restart behavior.",
      "Use the bash tool exactly once to append the marker line below, then wait for the bash result before finishing.",
      `Command to run exactly once: printf '${gateBMarkerText}\\n' >> ${shellQuote(gateBMarkerPath)}`,
      "After the bash result is visible, do not run that write command or any equivalent write again.",
      "Use the completed tool result from the transcript if Ambient restarts the provider stream.",
      "When the marker exists exactly once, call update_goal with status complete.",
    ].join("\n");
  }
  if (gateId === GATE_C) {
    return [
      "This is Gate C for live Ambient provider restart behavior.",
      "Keep the goal active while Ambient intentionally exhausts the provider interruption continuation retry budget.",
      "Do not mark this goal complete or blocked. Do not pause the goal.",
      "If the provider repeatedly stalls, Ambient should report provider availability/retry history rather than a generic paused goal.",
    ].join("\n");
  }
  if (gateId === GATE_D) {
    return [
      "This is Gate D for live Ambient provider restart behavior.",
      "No provider stall is injected in this gate.",
      `Reply with exactly this text and nothing else: ${gateDResponseText}`,
      "Do not use tools.",
    ].join("\n");
  }
  return [
    "This is Gate A for live Ambient provider restart behavior.",
    "Keep the goal active long enough for Ambient Desktop to run the internal hidden continuation.",
    "Do not mark this goal complete or blocked until the dogfood gate finishes.",
  ].join("\n");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function gateWaitTimeoutMs(gateId) {
  if (gateId === GATE_B || gateId === GATE_D) return 420_000;
  return 240_000;
}

function dogfoodGateReady(gateId, checks) {
  if (gateId === GATE_B) {
    return checks.hiddenGoalContinuationMessageCount >= 1 &&
      checks.toolResultRequestCount >= 1 &&
      checks.failpointTriggerCount >= failpointLimit &&
      checks.failpointClientCloseCount >= failpointLimit &&
      checks.failpointProxyEndCount === 0 &&
      checks.pausedGoalCount === 0 &&
      gateBGoalStateIsAcceptable(checks) &&
      checks.sideEffectMarkerLineCount === 1 &&
      checks.toolMessageCount >= 1 &&
      checks.providerContinuationRetryScheduledCount >= 1 &&
      checks.providerContinuationCompletedToolMessageCountMax >= 1;
  }
  if (gateId === GATE_C) {
    return checks.hiddenGoalContinuationMessageCount >= 1 &&
      checks.failpointEligibleRequestCount >= failpointLimit &&
      checks.failpointTriggerCount >= failpointLimit &&
      checks.goalStatus === "provider_unavailable" &&
      checks.pausedGoalCount === 0 &&
      checks.goalProviderInfraFailures >= failpointLimit &&
      checks.providerContinuationRetryScheduledCount >= 1 &&
      providerAvailabilityStatusReason(checks.goalStatusReason);
  }
  if (gateId === GATE_D) {
    return checks.failpointTriggerCount === 0 &&
      checks.noStallResponseMessageCount >= 1 &&
      checks.terminalProviderErrorRunCount === 0 &&
      checks.providerContinuationRetryScheduledCount === 0;
  }
  return checks.hiddenGoalContinuationMessageCount >= 1 &&
    checks.failpointEligibleRequestCount >= failpointLimit &&
    checks.failpointTriggerCount >= failpointLimit &&
    checks.failpointClientCloseCount >= failpointLimit &&
    checks.failpointProxyEndCount === 0 &&
    checks.goalStatus === "active" &&
    checks.pausedGoalCount === 0 &&
    checks.goalProviderInfraFailures >= failpointLimit &&
    checks.goalProviderInfraFailures > checks.goalNoProgressTurns &&
    checks.providerContinuationRetryScheduledCount >= 1;
}

async function collectChecks(cdp, threadId, proxyRef) {
  const bodyText = cdp ? await evaluate(cdp, () => document.body.innerText, [], 20_000) : "";
  const messages = readPersistedMessages(threadId).map((message) => ({
    ...message,
    metadata: parseJson(message.metadataJson),
  }));
  const hiddenGoalContinuationMessages = messages.filter(
    (message) =>
      message.role === "user" &&
      message.metadata?.hiddenFromTranscript === true &&
      message.metadata?.hiddenUserMessage === true &&
      message.content.includes(hiddenContinuationNeedle),
  );
  const hiddenPromptVisibleInUi = bodyText.includes(hiddenContinuationNeedle);
  const goals = readThreadGoals(threadId);
  const goal = goals[0];
  const runs = readRuns(threadId);
  const assistantInterruptionMetadata = messages
    .filter((message) => message.role === "assistant" && message.metadata?.piStreamInterruption)
    .map((message) => message.metadata.piStreamInterruption);
  const providerContinuationRetryScheduledCount = assistantInterruptionMetadata.filter(
    (metadata) => metadata?.retryScheduled === true && metadata?.retryReason === "provider_interruption_continuation",
  ).length;
  const providerContinuationRetryExhaustedCount = assistantInterruptionMetadata.filter(
    (metadata) => metadata?.retryScheduled === false && metadata?.retryReason === "provider_interruption_continuation",
  ).length;
  const providerContinuationCompletedToolMessageCountMax = assistantInterruptionMetadata.reduce(
    (max, metadata) => Math.max(max, Number(metadata?.completedToolMessageCount ?? 0)),
    0,
  );
  const toolMessages = messages.filter((message) => message.role === "tool");
  const bashToolMessages = toolMessages.filter((message) => message.metadata?.toolName === "bash" || /\bCommand\b/i.test(message.content));
  const sideEffectMarkerContent = await readOptionalText(gateBMarkerPath);
  return {
    hiddenGoalContinuationMessageCount: hiddenGoalContinuationMessages.length,
    hiddenGoalContinuationMessageIds: hiddenGoalContinuationMessages.map((message) => message.id),
    hiddenPromptVisibleInUi,
    failpointTriggerCount: proxyRef.state.failpointTriggerCount,
    failpointLimit: proxyRef.state.failpointLimit,
    failpointClosedByClient: proxyRef.state.failpointClosedByClient,
    failpointClientCloseCount: proxyRef.state.failpointClientCloseCount,
    failpointProxyEndCount: proxyRef.state.failpointProxyEndCount,
    hiddenPromptRequestCount: proxyRef.state.hiddenPromptRequestCount,
    providerContinuationRequestCount: proxyRef.state.providerContinuationRequestCount,
    toolResultRequestCount: proxyRef.state.toolResultRequestCount,
    failpointEligibleRequestCount: proxyRef.state.failpointEligibleRequestCount,
    chatCompletionCount: proxyRef.state.chatCompletionCount,
    forwardedChatCompletionCount: proxyRef.state.forwardedChatCompletionCount,
    activeGoalCount: goals.filter((row) => row.status === "active").length,
    goalCleared: goals.length === 0,
    goalCompletionMessageCount: messages.filter((message) => message.metadata?.kind === "goal-completion").length,
    toolMessageCount: toolMessages.length,
    bashToolMessageCount: bashToolMessages.length,
    noStallResponseMessageCount: messages.filter((message) => message.role === "assistant" && message.content.trim() === gateDResponseText).length,
    sideEffectMarkerContent,
    sideEffectMarkerLineCount: markerLineCount(sideEffectMarkerContent, gateBMarkerText),
    goalStatus: goal?.status,
    goalStatusReason: goal?.status_reason,
    goalNoProgressTurns: goal?.no_progress_turns,
    goalProviderInfraFailures: goal?.provider_infra_failures ?? 0,
    goalContinuationTurns: goal?.continuation_turns,
    pausedGoalCount: goals.filter((row) => row.status === "paused").length,
    terminalErrorRunCount: runs.filter((run) => run.status === "error").length,
    terminalProviderErrorRunCount: runs.filter((run) => run.status === "error" && providerErrorText(run.error_message)).length,
    providerContinuationRetryScheduledCount,
    providerContinuationRetryExhaustedCount,
    providerContinuationCompletedToolMessageCountMax,
    assistantInterruptionMetadata,
  };
}

async function readOptionalText(path) {
  if (!existsSync(path)) return "";
  return readFile(path, "utf8");
}

function markerLineCount(text, marker) {
  return text.split(/\r?\n/).filter((line) => line.trim() === marker).length;
}

function providerErrorText(value) {
  return /\b(?:Ambient\/Pi|stream|provider|did not start streaming|stalled)\b/i.test(String(value ?? ""));
}

function assertChecks(gateId, checks) {
  const failures = [];
  if (checks.hiddenGoalContinuationMessageCount < 1 && gateId !== GATE_D) failures.push("expected at least one durable hidden goal continuation anchor");
  if (checks.hiddenPromptVisibleInUi) failures.push("hidden internal goal continuation prompt was visible in the renderer transcript");
  if (gateId !== GATE_C && checks.failpointClientCloseCount < checks.failpointLimit) {
    failures.push(`provider watchdog closed ${checks.failpointClientCloseCount} of ${checks.failpointLimit} stalled failpoint streams from the client side`);
  }
  if (gateId !== GATE_C && checks.failpointProxyEndCount > 0) {
    failures.push(`proxy timeout ended ${checks.failpointProxyEndCount} stalled failpoint streams before the client watchdog closed them`);
  }
  if (gateId !== GATE_D && checks.failpointTriggerCount < failpointLimit) {
    failures.push(`failpoint triggered ${checks.failpointTriggerCount}/${failpointLimit} times`);
  }
  if (gateId === GATE_B) {
    if (checks.toolResultRequestCount < 1) failures.push("post-tool failpoint never saw a completed tool result request");
    if (checks.pausedGoalCount > 0) failures.push("goal was paused after post-tool provider recovery");
    if (!gateBGoalStateIsAcceptable(checks)) {
      failures.push(`goal should remain active, complete, or provider-unavailable after post-tool recovery, got ${checks.goalStatus ?? "missing"}`);
    }
    if (checks.sideEffectMarkerLineCount !== 1) failures.push(`side-effect marker was written ${checks.sideEffectMarkerLineCount} times instead of once`);
    if (checks.toolMessageCount < 1) failures.push("expected at least one completed tool message before post-tool recovery");
    if (checks.providerContinuationRetryScheduledCount < 1) failures.push("no retry-scheduled provider interruption continuation was persisted");
    if (checks.providerContinuationCompletedToolMessageCountMax < 1) failures.push("provider continuation did not record completed tool results before retry");
  } else if (gateId === GATE_C) {
    if (checks.pausedGoalCount > 0) failures.push("goal was paused after provider infrastructure failure");
    if (checks.goalStatus !== "provider_unavailable") {
      failures.push(`goal status should report provider availability, got ${checks.goalStatus ?? "missing"}`);
    }
    if (!providerAvailabilityStatusReason(checks.goalStatusReason)) failures.push(`goal status reason was not provider-specific: ${checks.goalStatusReason ?? "missing"}`);
    if (checks.goalProviderInfraFailures < checks.failpointLimit) {
      failures.push(`provider infrastructure failures recorded ${checks.goalProviderInfraFailures}/${checks.failpointLimit}`);
    }
    if (checks.goalProviderInfraFailures <= checks.goalNoProgressTurns) {
      failures.push(
        `provider infrastructure failures were not separated from semantic no-progress turns: provider=${checks.goalProviderInfraFailures}, noProgress=${checks.goalNoProgressTurns}`,
      );
    }
    if (checks.providerContinuationRetryScheduledCount < 1) failures.push("provider continuation was never scheduled before cap completion");
  } else if (gateId === GATE_D) {
    if (checks.failpointTriggerCount !== 0) failures.push(`no-stall gate unexpectedly triggered ${checks.failpointTriggerCount} failpoints`);
    if (checks.noStallResponseMessageCount < 1) failures.push("no-stall live response message was not persisted");
    if (checks.terminalProviderErrorRunCount !== 0) failures.push(`no-stall gate had ${checks.terminalProviderErrorRunCount} provider error runs`);
    if (checks.providerContinuationRetryScheduledCount !== 0) failures.push("no-stall gate unexpectedly scheduled provider interruption recovery");
  } else {
    if (checks.failpointEligibleRequestCount < failpointLimit) {
      failures.push(`provider continuation failpoint saw ${checks.failpointEligibleRequestCount}/${failpointLimit} eligible requests`);
    }
    if (checks.pausedGoalCount > 0) failures.push("goal was paused after provider infrastructure failure");
    if (checks.goalStatus !== "active") failures.push(`goal status should remain active, got ${checks.goalStatus ?? "missing"}`);
    if (checks.goalProviderInfraFailures < checks.failpointLimit) {
      failures.push(`provider infrastructure failures recorded ${checks.goalProviderInfraFailures}/${checks.failpointLimit}`);
    }
    if (checks.goalProviderInfraFailures <= checks.goalNoProgressTurns) {
      failures.push(
        `provider infrastructure failures were not separated from semantic no-progress turns: provider=${checks.goalProviderInfraFailures}, noProgress=${checks.goalNoProgressTurns}`,
      );
    }
    if (checks.providerContinuationRetryScheduledCount < 1) failures.push("no retry-scheduled provider interruption continuation was persisted");
  }
  if (failures.length > 0) throw new Error(`Provider restart behavior dogfood failed:\n- ${failures.join("\n- ")}`);
}

function providerAvailabilityStatusReason(value) {
  return /\bProvider (?:recovery stopped without pausing the goal|availability retry limit reached)\b/i.test(String(value ?? ""));
}

function gateBGoalStateIsAcceptable(checks) {
  if (checks.goalStatus === "active" || checks.goalCleared === true) return true;
  return checks.goalStatus === "provider_unavailable" && providerAvailabilityStatusReason(checks.goalStatusReason);
}

async function waitForDogfoodCheck(cdp, threadId, proxyRef, predicate, label, timeoutMs) {
  const started = Date.now();
  let latestChecks = {};
  while (Date.now() - started < timeoutMs) {
    latestChecks = await collectChecks(cdp, threadId, proxyRef);
    if (predicate(latestChecks)) return latestChecks;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}. Latest checks: ${JSON.stringify(latestChecks, null, 2)}`);
}

async function startAmbientFailpointProxy() {
  const upstreamBaseUrl = (process.env.AMBIENT_PROVIDER_RESTART_UPSTREAM_BASE_URL || "https://api.ambient.xyz").replace(/\/+$/, "");
  const state = {
    chatCompletionCount: 0,
    forwardedChatCompletionCount: 0,
    hiddenPromptRequestCount: 0,
    providerContinuationRequestCount: 0,
    toolResultRequestCount: 0,
    failpointEligibleRequestCount: 0,
    failpointLimit,
    failpointArmed: false,
    failpointTriggerCount: 0,
    failpointTriggered: false,
    failpointClosedByClient: false,
    failpointClientCloseCount: 0,
    failpointProxyEndCount: 0,
    requests: [],
  };
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req);
      if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
        state.chatCompletionCount += 1;
        const bodyText = body.toString("utf8");
        const parsedBody = parseChatCompletionRequestBody(body);
        const requestFeatures = classifyChatCompletionRequest(parsedBody, bodyText);
        if (requestFeatures.hiddenContinuation) state.hiddenPromptRequestCount += 1;
        if (requestFeatures.providerContinuation) state.providerContinuationRequestCount += 1;
        if (requestFeatures.toolResult) state.toolResultRequestCount += 1;
        const failpointEligible = state.failpointArmed && shouldFailpointRequest(gateConfig.mode, requestFeatures);
        if (failpointEligible) state.failpointEligibleRequestCount += 1;
        state.requests.push({
          index: state.chatCompletionCount,
          ...requestFeatures,
          failpointEligible,
          failpointArmed: state.failpointArmed,
          stream: parsedBody?.stream,
        });
        if (failpointEligible && state.failpointTriggerCount < state.failpointLimit) {
          state.failpointTriggered = true;
          state.failpointTriggerCount += 1;
          return writeKeepaliveOnlyStream(res, state);
        }
        state.forwardedChatCompletionCount += 1;
      }
      await forwardRequest({ req, res, body, upstreamBaseUrl });
    } catch (error) {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate provider restart proxy port.");
  return { server, state, sockets, baseUrl: `http://127.0.0.1:${address.port}` };
}

function classifyChatCompletionRequest(parsedBody, bodyText) {
  return {
    hiddenContinuation: requestContainsText(parsedBody, hiddenContinuationNeedle) || bodyText.includes(hiddenContinuationNeedle),
    providerContinuation: requestContainsText(parsedBody, providerContinuationNeedle) || bodyText.includes(providerContinuationNeedle),
    toolResult: requestHasToolResult(parsedBody, bodyText),
    gateBMarker: bodyText.includes(gateBMarkerText),
  };
}

function shouldFailpointRequest(mode, features) {
  if (mode === "none") return false;
  if (mode === "after_tool_result") return features.toolResult && features.gateBMarker;
  if (mode === "provider_retry_cap") return features.hiddenContinuation || features.providerContinuation;
  return features.hiddenContinuation || features.providerContinuation;
}

function requestHasToolResult(value, bodyText) {
  if (requestContainsRole(value, new Set(["tool", "toolResult"]))) return true;
  return /"role"\s*:\s*"tool(?:Result)?"/i.test(bodyText) || /"tool_call_id"\s*:/i.test(bodyText);
}

function requestContainsText(value, needle) {
  if (typeof value === "string") return value.includes(needle);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => requestContainsText(item, needle));
  return Object.values(value).some((item) => requestContainsText(item, needle));
}

function requestContainsRole(value, roles) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => requestContainsRole(item, roles));
  if (typeof value.role === "string" && roles.has(value.role)) return true;
  return Object.values(value).some((item) => requestContainsRole(item, roles));
}

function writeKeepaliveOnlyStream(res, state) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const interval = setInterval(() => {
    if (!res.destroyed) res.write(": provider-restart-dogfood-keepalive\n\n");
  }, 200);
  let endedByProxy = false;
  const timeout = setTimeout(() => {
    clearInterval(interval);
    endedByProxy = true;
    state.failpointProxyEndCount += 1;
    if (!res.destroyed) res.end();
  }, failpointResponseMs);
  res.on("close", () => {
    if (!endedByProxy) {
      state.failpointClosedByClient = true;
      state.failpointClientCloseCount += 1;
    }
    clearInterval(interval);
    clearTimeout(timeout);
  });
}

async function forwardRequest({ req, res, body, upstreamBaseUrl }) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (!value || ["host", "content-length", "connection"].includes(name.toLowerCase())) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else headers.set(name, value);
  }
  const upstream = await fetch(`${upstreamBaseUrl}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const responseHeaders = {};
  upstream.headers.forEach((value, name) => {
    responseHeaders[name] = value;
  });
  res.writeHead(upstream.status, responseHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }
  for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
  res.end();
}

function parseChatCompletionRequestBody(body) {
  try {
    const parsed = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readRequestBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("error", rejectPromise);
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
  });
}

async function closeProxy(proxyRef) {
  for (const socket of proxyRef.sockets) socket.destroy();
  await new Promise((resolvePromise) => proxyRef.server.close(() => resolvePromise()));
}

function proxyEvidence(proxyRef) {
  return {
    chatCompletionCount: proxyRef.state.chatCompletionCount,
    forwardedChatCompletionCount: proxyRef.state.forwardedChatCompletionCount,
    hiddenPromptRequestCount: proxyRef.state.hiddenPromptRequestCount,
    providerContinuationRequestCount: proxyRef.state.providerContinuationRequestCount,
    toolResultRequestCount: proxyRef.state.toolResultRequestCount,
    failpointEligibleRequestCount: proxyRef.state.failpointEligibleRequestCount,
    failpointLimit: proxyRef.state.failpointLimit,
    failpointArmed: proxyRef.state.failpointArmed,
    failpointTriggerCount: proxyRef.state.failpointTriggerCount,
    failpointTriggered: proxyRef.state.failpointTriggered,
    failpointClosedByClient: proxyRef.state.failpointClosedByClient,
    failpointClientCloseCount: proxyRef.state.failpointClientCloseCount,
    failpointProxyEndCount: proxyRef.state.failpointProxyEndCount,
    requests: proxyRef.state.requests,
  };
}

function buildDogfoodEnv(proxyBaseUrl) {
  return cleanChildEnv({
    ...process.env,
    AMBIENT_PROVIDER: DEFAULT_DOGFOOD_PROVIDER,
    AMBIENT_LIVE_MODEL: dogfoodModel(),
    AMBIENT_BASE_URL: proxyBaseUrl,
    AMBIENT_DESKTOP_WORKSPACE: workspacePath,
    AMBIENT_E2E_USER_DATA: userDataPath,
    AMBIENT_AUTHORITY_STATE_ROOT: authorityStateRoot,
    AMBIENT_CHAT_PI_EMPTY_ASSISTANT_STALL_TIMEOUT_MS: String(providerTimeoutMs),
  });
}

function dogfoodModel() {
  return process.env.AMBIENT_LIVE_MODEL || process.env.AMBIENT_MODEL || DEFAULT_DOGFOOD_MODEL;
}

function launchDesktop(port, proxyBaseUrl) {
  return spawn("pnpm", [
    "exec",
    "electron-vite",
    "dev",
    "--",
    `--remote-debugging-port=${port}`,
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: {
      ...buildDogfoodEnv(proxyBaseUrl),
      AMBIENT_E2E: "1",
    },
  });
}

async function connectToElectron(port, app) {
  const started = Date.now();
  let lastOutput = "";
  app.stdout?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  app.stderr?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  while (Date.now() - started < 45_000) {
    if (app.exitCode !== null) throw new Error(`Electron exited before CDP was available.\n${lastOutput}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return createCdpClient(page.webSocketDebuggerUrl);
      }
    } catch {
      // Keep polling.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron CDP on port ${port}.\n${lastOutput}`);
}

function createCdpClient(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id !== "number") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP command failed"));
    else waiter.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) waiter.reject(new Error("CDP socket closed"));
    pending.clear();
  });
  return {
    send(method, params = {}, timeoutMs = cdpCommandTimeoutMs) {
      const id = nextId++;
      const ready = socket.readyState === WebSocket.OPEN
        ? Promise.resolve()
        : new Promise((resolveReady, rejectReady) => {
          const timeout = setTimeout(() => {
            rejectReady(new Error(`Timed out waiting for CDP socket open after ${timeoutMs}ms.`));
          }, timeoutMs);
          socket.addEventListener("open", () => {
            clearTimeout(timeout);
            resolveReady();
          }, { once: true });
          socket.addEventListener("error", () => {
            clearTimeout(timeout);
            rejectReady(new Error("CDP socket failed to open"));
          }, { once: true });
        });
      return ready.then(() => new Promise((resolveCommand, rejectCommand) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          rejectCommand(new Error(`Timed out waiting for CDP ${method} after ${timeoutMs}ms.`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolveCommand(value);
          },
          reject: (error) => {
            clearTimeout(timeout);
            rejectCommand(error);
          },
        });
        socket.send(JSON.stringify({ id, method, params }));
      }));
    },
    close() {
      socket.close();
    },
  };
}

async function waitForText(cdp, text, timeoutMs = 20_000) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), [text], timeoutMs);
}

async function waitFor(cdp, predicate, args = [], timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, predicate, args)) return;
    await delay(250);
  }
  throw new Error("Timed out waiting for Electron UI condition.");
}

async function evaluate(cdp, fn, args = [], timeoutMs = cdpCommandTimeoutMs) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, timeoutMs);
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function writeScreenshot(cdp, name) {
  await mkdir(resultsDir, { recursive: true });
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, 30_000);
  const outputPath = join(resultsDir, name);
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return outputPathRelative(outputPath);
}

async function writeReport(report) {
  await mkdir(dirname(latestArtifactPath), { recursive: true });
  await writeFile(latestArtifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function readPersistedMessages(threadId) {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, [
    "SELECT id, thread_id as threadId, role, content, metadata_json as metadataJson",
    "FROM messages",
    `WHERE thread_id = '${sqlString(threadId)}'`,
    "ORDER BY created_at ASC, rowid ASC",
  ].join(" "));
}

function readThreadGoals(threadId) {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, `SELECT * FROM thread_goals WHERE thread_id = '${sqlString(threadId)}'`);
}

function readRuns(threadId) {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, [
    "SELECT id, thread_id as threadId, status, error_message, started_at, completed_at",
    "FROM runs",
    `WHERE thread_id = '${sqlString(threadId)}'`,
    "ORDER BY started_at ASC, rowid ASC",
  ].join(" "));
}

function readSqlJson(dbPath, sql) {
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return [];
  const trimmed = result.stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function dogfoodStateDbPath() {
  const legacyDbPath = join(workspacePath, ".ambient-codex", "state.sqlite");
  const authorityDbPath = join(authorityStateRoot, "workspaces", authorityWorkspaceDirectoryName(workspacePath), "state.sqlite");
  return existsSync(authorityDbPath) || !existsSync(legacyDbPath) ? authorityDbPath : legacyDbPath;
}

function authorityWorkspaceDirectoryName(workspace) {
  const name = safePathSegment(basename(workspace)) || "workspace";
  const id = createHash("sha256").update(resolve(workspace)).digest("hex").slice(0, 16);
  return `${name}-${id}`;
}

function safePathSegment(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^\.+|\.+$/g, "");
}

function sqlString(value) {
  return String(value).replace(/'/g, "''");
}

function parseJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dogfoodCdpPort() {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

function cdpPortFromEnv() {
  const raw = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT must be a TCP port, got ${raw}.`);
  }
  return port;
}

function failMissingCdpPort() {
  throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

function expectedProviderLabel() {
  return "Ambient API";
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function run(command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.`);
}

function outputPathRelative(path) {
  const absolute = resolve(path);
  return absolute.startsWith(`${repoRoot}/`) ? absolute.slice(repoRoot.length + 1) : absolute;
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  delete next.GMI_CLOUD_BASE_URL;
  delete next.GMI_CLOUD_MODEL;
  return next;
}

async function terminateApp(app) {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  signalAppProcess(app, "SIGTERM");
  const exited = await waitForAppExit(app, 5000);
  if (!exited) signalAppProcess(app, "SIGKILL");
}

function signalAppProcess(app, signal) {
  try {
    if (process.platform !== "win32" && app.pid) process.kill(-app.pid, signal);
    else app.kill(signal);
  } catch {
    try {
      app.kill(signal);
    } catch {
      // Process already exited.
    }
  }
}

async function waitForAppExit(app, timeoutMs) {
  if (app.exitCode !== null || app.signalCode !== null) return true;
  return Promise.race([
    once(app, "exit").then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}
