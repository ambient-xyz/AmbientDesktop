import Database from "better-sqlite3";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";

import type { DesktopEvent } from "../src/shared/desktopTypes";
import type { ChatMessage, ThreadSummary } from "../src/shared/threadTypes";
import {
  AgentRuntimeInstallRouteGuard,
  formatRawPiInstallRootBlockedMessage,
} from "../src/main/agent-runtime/agentRuntimeInstallRouteGuard";
import {
  AgentRuntimeThreadWakeContinuationController,
  type AgentRuntimeThreadWakeContinuationControllerOptions,
  type ThreadWakeContinuationSendInput,
} from "../src/main/agent-runtime/agentRuntimeThreadWakeContinuationController";
import { planAmbientInstallRoute } from "../src/main/install-route/installRoutePlanner";
import { applyProjectStoreBootstrapSchema } from "../src/main/projectStore/projectStoreSchema";
import { ProjectStoreThreadWakeRepository } from "../src/main/projectStore/threadWakeRepository";

describe("skill install polish contract scenarios", () => {
  it("records builder routing, wrapped Pi allowance, raw Pi guard, and wake supersession evidence", async () => {
    const report = {
      schemaVersion: "skill-install-polish-contract-scenarios-v1",
      status: "passed",
      generatedAt: new Date().toISOString(),
      scenarios: {
        capabilityBuilderRouting: verifyCapabilityBuilderRouting(),
        wrappedPiCatalogInstall: verifyWrappedPiCatalogInstall(),
        rawPiInstallGuard: verifyRawPiInstallGuard(),
        wakeSupersession: await verifyWakeSupersession(),
      },
    };

    await writeContractReportIfRequested(report);
    expect(report.status).toBe("passed");
  });
});

function verifyCapabilityBuilderRouting() {
  const plan = planAmbientInstallRoute({
    userRequest: "Build an Ambient wrapper for an unknown Pi marketplace package that calls a public API and returns JSON.",
    sourceUrl: "https://pi.dev/packages/weather-lite",
    requestedKind: "pi-marketplace",
  });
  const nextTools = plan.nextTools.map((tool) => tool.name);

  expect(plan.lane).toBe("pi-marketplace-generated-wrapper");
  expect(nextTools[0]).toBe("ambient_capability_builder_plan");
  expect(nextTools).toContain("ambient_capability_builder_plan");
  expect(nextTools).not.toContain("ambient_cli_package_install_pi_catalog");
  expect(nextTools).not.toContain("ambient_pi_privileged_scan");
  expect(plan.warnings.join("\n")).toContain("Do not execute raw upstream Pi extension code");

  return {
    lane: plan.lane,
    selectedTool: nextTools[0],
    nextTools,
    approvalBoundary: plan.approvalBoundary,
    validationKind: plan.validationTarget?.kind,
    rawPiInstallRecommended: nextTools.some((tool) => /raw|pi_extension|plugin_install/i.test(tool)),
  };
}

function verifyWrappedPiCatalogInstall() {
  const plan = planAmbientInstallRoute({
    userRequest: "Install this Pi package for arXiv search.",
    sourceUrl: "https://pi.dev/packages/pi-arxiv?name=arxiv",
  });
  const guard = new AgentRuntimeInstallRouteGuard();
  const threadId = "thread-wrapped-pi-install";
  const nextTools = plan.nextTools.map((tool) => tool.name);

  guard.recordInstallRoutePlan(threadId, plan, "2026-06-24T00:00:00.000Z");

  expect(plan.lane).toBe("pi-marketplace-curated-wrapper");
  expect(nextTools[0]).toBe("ambient_cli_package_install_pi_catalog");
  expect(guard.installRouteGateBlockForTool(threadId, "ambient_cli_package_install_pi_catalog")).toBeUndefined();
  expect(
    guard.rawPiInstallRootBlockForTool({
      toolName: "ambient_cli_package_install_pi_catalog",
      rawToolInput: { packageName: "pi-arxiv" },
      permissionMode: "full-access",
    }),
  ).toBeUndefined();

  return {
    lane: plan.lane,
    selectedTool: nextTools[0],
    nextTools,
    wrappedInstallAllowed: true,
    rawPiRootGuardAppliesToWrappedTool: false,
    warning: plan.warnings.find((item) => item.includes("Do not route this source")),
  };
}

function verifyRawPiInstallGuard() {
  const guard = new AgentRuntimeInstallRouteGuard();
  const command = "mkdir -p ~/.codex/skills/example && cp SKILL.md ~/.codex/skills/example/SKILL.md";
  const block = guard.rawPiInstallRootBlockForTool({
    toolName: "bash",
    rawToolInput: { command },
    permissionMode: "full-access",
  });

  expect(block?.protectedRoot).toBe("~/.codex/skills");
  const message = formatRawPiInstallRootBlockedMessage("bash", block!.detail);
  expect(message).toContain("Ambient raw Pi install root guard blocked bash.");
  expect(message).toContain("ambient_install_route_plan");

  return {
    toolName: "bash",
    commandPreview: command,
    blocked: true,
    protectedRoot: block!.protectedRoot,
    formattedMessagePrefix: message.split("\n")[0],
    noDurableWriteExecuted: true,
  };
}

async function verifyWakeSupersession() {
  const db = new Database(":memory:");
  try {
    applyProjectStoreBootstrapSchema(db);
    const now = "2026-06-24T12:00:00.000Z";
    db.prepare("INSERT INTO threads (id, title, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      "thread-1",
      "Skill install polish wake thread",
      "/workspace",
      now,
      now,
    );

    const repository = new ProjectStoreThreadWakeRepository(db);
    const timers: TimerHandle[] = [];
    const clearedTimers: TimerHandle[] = [];
    const sentInputs: ThreadWakeContinuationSendInput[] = [];
    const messages: ChatMessage[] = [];
    const events: DesktopEvent[] = [];
    const deliveredWakeIds: string[] = [];
    const store: AgentRuntimeThreadWakeContinuationControllerOptions["store"] = {
      getThread: () => threadSummary(),
      getThreadWakeContinuation: (id) => repository.getThreadWakeContinuation(id),
      listPendingThreadWakeContinuations: () => repository.listPendingThreadWakeContinuations(),
      scheduleThreadWakeContinuation: (input) => repository.scheduleThreadWakeContinuation(input),
      cancelThreadWakeContinuation: (id) => repository.cancelThreadWakeContinuation(id),
      resolveThreadWakeContinuation: (id, reason) => repository.resolveThreadWakeContinuation(id, reason),
      markThreadWakeContinuationDelivered: (id) => {
        deliveredWakeIds.push(id);
        return repository.markThreadWakeContinuationDelivered(id);
      },
      markThreadWakeContinuationFailed: (id, error) => repository.markThreadWakeContinuationFailed(id, error),
      addMessage: (input) => {
        const message: ChatMessage = {
          id: `message-${messages.length + 1}`,
          threadId: input.threadId,
          role: input.role,
          content: input.content,
          createdAt: now,
          metadata: input.metadata,
        };
        messages.push(message);
        return message;
      },
    };

    const controller = new AgentRuntimeThreadWakeContinuationController({
      store,
      hasActiveRun: () => false,
      send: async (input) => {
        sentInputs.push(input);
      },
      emit: (event) => {
        events.push(event);
      },
      now: () => Date.parse(now),
      setTimeout: (callback, delayMs) => {
        const handle = { sequence: timers.length + 1, delayMs, callback };
        timers.push(handle);
        return handle;
      },
      clearTimeout: (handle) => {
        clearedTimers.push(handle as TimerHandle);
      },
    });

    const first = controller.schedule({
      threadId: "thread-1",
      dueAt: "2026-06-24T12:00:05.000Z",
      reason: "first progress check",
      operationKey: "skill-install-polish:job-1",
    });
    const second = controller.schedule({
      threadId: "thread-1",
      dueAt: "2026-06-24T12:00:10.000Z",
      reason: "replacement progress check",
      operationKey: "skill-install-polish:job-1",
    });

    expect(second.supersedesWakeIds).toEqual([first.id]);
    expect(repository.getThreadWakeContinuation(first.id)).toMatchObject({
      status: "superseded",
      resolutionReason: `Superseded by wake ${second.id}.`,
    });
    expect(repository.listPendingThreadWakeContinuations().map((wake) => wake.id)).toEqual([second.id]);
    expect(clearedTimers.map((timer) => timer.sequence)).toContain(1);

    timers[0]!.callback();
    await setImmediate();

    const droppedMessage = messages.find((message) => message.metadata?.event === "wake-dropped");
    expect(sentInputs).toHaveLength(0);
    expect(deliveredWakeIds).not.toContain(first.id);
    expect(droppedMessage?.metadata).toMatchObject({
      runtime: "ambient-thread-wake",
      event: "wake-dropped",
      wakeStatus: "superseded",
      operationKey: "skill-install-polish:job-1",
    });
    expect(events.some((event) => event.type === "message-created")).toBe(true);

    return {
      firstWakeId: first.id,
      secondWakeId: second.id,
      operationKey: "skill-install-polish:job-1",
      supersedesWakeIds: second.supersedesWakeIds,
      firstStatusAfterReplacement: repository.getThreadWakeContinuation(first.id)?.status,
      pendingWakeIds: repository.listPendingThreadWakeContinuations().map((wake) => wake.id),
      staleTimerCleared: clearedTimers.some((timer) => timer.sequence === 1),
      staleTimerDeliveryAttemptDropped: Boolean(droppedMessage),
      wakeDroppedEvent: droppedMessage?.metadata?.event,
      staleTimerSentPiTurn: sentInputs.length > 0,
    };
  } finally {
    db.close();
  }
}

async function writeContractReportIfRequested(report: Record<string, unknown>) {
  const outputPath = process.env.AMBIENT_SKILL_INSTALL_POLISH_CONTRACT_OUT;
  if (!outputPath) return;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function threadSummary(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Skill install polish wake thread",
    workspacePath: "/workspace",
    kind: "chat",
    createdAt: "2026-06-24T12:00:00.000Z",
    updatedAt: "2026-06-24T12:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "example/model-id",
    thinkingLevel: "minimal",
  };
}

interface TimerHandle {
  sequence: number;
  delayMs: number;
  callback: () => void;
}
