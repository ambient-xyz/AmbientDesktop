#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  {
    label: "prepare native Node test runtime",
    command: "pnpm",
    args: ["run", "prepare:node-native"],
  },
  {
    label: "wait/barrier controller and whole-barrier evaluation",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/main/subagents/subagentWaitAgentExecutor.test.ts",
      "src/main/subagents/subagentWaitBarrierResolution.test.ts",
      "src/main/subagents/subagentWaitContextResolver.test.ts",
      "src/main/subagents/subagentWaitBarrierEvaluation.test.ts",
      "src/main/subagents/subagentPiTools.test.ts",
    ],
  },
  {
    label: "runtime wait outcomes, child liveness, finalization blocks, and web-research scope",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/main/agent-runtime/agentRuntime.test.ts",
      "src/main/agent-runtime/agentRuntimeSubagentWaitLiveness.test.ts",
      "src/main/agent-runtime/agentRuntimeSubagentNativeApproval.test.ts",
      "src/main/agent-runtime/agentRuntimeSubagentAuthorityRouting.test.ts",
      "--testNamePattern",
      [
        "does not abort an active child only because the role runtime budget elapsed",
        "emits wait heartbeats while a live child runtime is still pending",
        "settles a child only after the child activity idle timeout elapses with liveness evidence",
        "settles an active child at the hard cap even when recent activity prevents idle timeout",
        "surfaces native child permission prompts as parent-forwarded approval requests",
        "round-trips native child permission prompts through parent approval and child resume",
        "launches ordinary child web research with brokered tools and without browser fallback",
        "round-trips child browser authority prompts through parent approval and child resume",
        "blocks parent finalization while required sub-agent wait barriers are unresolved",
        "reconciles stale waiting barriers during parent finalization when child results are now safe",
      ].join("|"),
    ],
  },
  {
    label: "approval, repair, recovery, and export evidence",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/main/subagents/subagentApprovalBridge.test.ts",
      "src/main/subagents/subagentStructuredOutput.test.ts",
      "src/main/subagents/subagentStartupReconciliation.test.ts",
      "src/main/chat-export/chatExport.test.ts",
      "src/main/agent-runtime/web-research/agentRuntimeWebResearchProviderPlan.test.ts",
    ],
  },
  {
    label: "read-only finalization helper models",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/main/agent-runtime/agentRuntimeFinalizationBlocking.test.ts",
      "src/main/agent-runtime/runtimeSuccessfulRunFinalization.test.ts",
      "src/main/agent-runtime/finalAssistantMessage.test.ts",
    ],
  },
  {
    label: "parent blocker UI and child transcript ordering",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/renderer/src/subagentParentClusterUiModel.test.ts",
      "src/renderer/src/SubagentParentCluster.test.tsx",
      "src/renderer/src/AppConversationMessages.test.tsx",
    ],
  },
  {
    label: "TypeScript",
    command: "pnpm",
    args: ["run", "typecheck"],
  },
  {
    label: "whitespace",
    command: "git",
    args: ["diff", "--check"],
  },
];

function runStep(step) {
  console.log(`\n[subagent-wait-stabilization] ${step.label}`);
  console.log(`[subagent-wait-stabilization] $ ${[step.command, ...step.args].join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    env: { ...process.env, CI: process.env.CI ?? "1" },
  });
  if (result.error) {
    console.error(`[subagent-wait-stabilization] failed to start ${step.label}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

for (const step of steps) {
  const status = runStep(step);
  if (status !== 0) {
    console.error(`\n[subagent-wait-stabilization] gate failed at: ${step.label}`);
    process.exit(status);
  }
}

console.log("\n[subagent-wait-stabilization] gate passed");
