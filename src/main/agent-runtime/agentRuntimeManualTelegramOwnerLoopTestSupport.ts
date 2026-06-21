import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { ProjectSummary } from "../../shared/projectBoardTypes";

export function normalizedIsoFromEnv(value: string | undefined, name: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be an ISO timestamp when supplied.`);
  }
  return date.toISOString();
}

export function manualTelegramOwnerLoopProjectFeatures(workspacePath: string) {
  const manualRelayProjectPath = join(workspacePath, "manual-relay-smoke-project");
  const project = (path: string, name: string): ProjectSummary => ({
    id: path,
    path,
    name,
    statePath: join(path, ".ambient-codex"),
    sessionPath: join(path, ".ambient-codex", "sessions"),
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:01.000Z",
    threads: [],
  });
  return {
    projects: {
      listProjects: () => [
        project(workspacePath, "Active project"),
        project(manualRelayProjectPath, "Manual Relay Smoke"),
      ],
      switchProject: (input: { workspacePath: string; reason: string }) => {
        if (input.workspacePath !== manualRelayProjectPath) {
          throw new Error(`Unexpected manual Telegram owner-loop project switch target: ${input.workspacePath}`);
        }
      },
    },
  };
}

export async function applyManualOwnerLoopCommand(input: {
  tool: (name: string) => { name: string; execute: (...args: any[]) => Promise<any> };
  toolCallId: string;
  queuedProjectionId: string;
}): Promise<unknown | undefined> {
  try {
    const result = await input.tool("ambient_messaging_remote_surface_command_apply").execute(input.toolCallId, {
      queuedProjectionId: input.queuedProjectionId,
    });
    expect(["applied", "noop"]).toContain(result.details.applyStatus);
    return undefined;
  } catch (error) {
    return error;
  }
}

export async function previewManualOwnerLoopRelay(input: {
  tool: (name: string) => { name: string; execute: (...args: any[]) => Promise<any> };
  toolCallIdPrefix: string;
  queuedProjectionId: string;
  sendReply: boolean;
}): Promise<void> {
  const status = await input.tool("ambient_messaging_gateway_status").execute(`${input.toolCallIdPrefix}-relay-status`, {});
  const relaySummary = (status.details.remoteSurfaceRelaySummaries as Array<any> | undefined)
    ?.find((candidate) =>
      candidate.queuedProjectionId === input.queuedProjectionId &&
      candidate.relayActionStatus === "preview-ready");
  if (!relaySummary?.runtimeEventId) {
    throw new Error([
      "Manual Telegram owner-loop relay smoke did not produce a preview-ready runtime event.",
      "Use a command that produces a relayable runtime event, for example: switch project Manual Relay Smoke.",
      status.content?.[0]?.text ?? JSON.stringify(status.details, null, 2),
    ].join("\n"));
  }
  expect(relaySummary.previewToolName).toBe("ambient_messaging_remote_surface_reply_preview");
  expect(relaySummary.applyToolName).toBe("ambient_messaging_remote_surface_reply_apply");
  expect(relaySummary.targetProviderId).toBe("telegram-tdlib");

  const replyPreview = await input.tool("ambient_messaging_remote_surface_reply_preview").execute(`${input.toolCallIdPrefix}-reply-preview`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(replyPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
  expect(replyPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
  expect(replyPreview.details).toMatchObject({
    status: "ready",
    delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
    delegatedProviderId: "telegram-tdlib",
  });

  const writeOwnerLoopOutput = async (extra: Record<string, unknown> = {}) => {
    const outputPath = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH?.trim();
    if (!outputPath) return;
    let existing: Record<string, unknown>;
    try {
      existing = JSON.parse(await readFile(outputPath, "utf8"));
    } catch {
      existing = {};
    }
    await writeFile(outputPath, JSON.stringify({
      generatedAt: existing.generatedAt ?? new Date().toISOString(),
      ...existing,
      queuedProjectionId: input.queuedProjectionId,
      runtimeEventId: relaySummary.runtimeEventId,
      relayActionStatus: relaySummary.relayActionStatus,
      targetProviderId: relaySummary.targetProviderId,
      previewStatus: replyPreview.details.status,
      delegatedPreviewToolName: replyPreview.details.delegatedToolName,
      delegatedProviderId: replyPreview.details.delegatedProviderId,
      replySent: false,
      privacy: {
        providerMessageBodiesReturned: false,
        providerHistoryRead: false,
      },
      ...extra,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8");
  };

  if (!input.sendReply) {
    await writeOwnerLoopOutput();
    console.info("Manual Telegram owner-loop relay preview completed without sending; set AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 to send the reviewed reply.");
    return;
  }

  const replyApply = await input.tool("ambient_messaging_remote_surface_reply_apply").execute(`${input.toolCallIdPrefix}-reply-apply`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(replyApply.content[0].text).toContain("Remote Ambient Surface reply apply");
  expect(replyApply.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_apply");
  expect(replyApply.details).toMatchObject({
    status: "sent",
    delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
    delegatedProviderId: "telegram-tdlib",
  });
  const statusAfterSend = await input.tool("ambient_messaging_gateway_status").execute(`${input.toolCallIdPrefix}-status-after-reply`, {});
  const eventAfterSend = (statusAfterSend.details.remoteSurfaceRuntimeEvents as Array<any> | undefined)
    ?.find((candidate) => candidate.id === relaySummary.runtimeEventId);
  const relaySummaryAfterSend = (statusAfterSend.details.remoteSurfaceRelaySummaries as Array<any> | undefined)
    ?.find((candidate) => candidate.runtimeEventId === relaySummary.runtimeEventId);
  expect(eventAfterSend).toMatchObject({
    id: relaySummary.runtimeEventId,
    relayStatus: "sent",
    relaySuggested: false,
  });
  expect(relaySummaryAfterSend).toMatchObject({
    runtimeEventId: relaySummary.runtimeEventId,
    relayActionStatus: "already-relayed",
    duplicateBlocked: true,
  });
  const duplicatePreview = await input.tool("ambient_messaging_remote_surface_reply_preview").execute(`${input.toolCallIdPrefix}-duplicate-reply-preview`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(duplicatePreview.details.status).toBe("blocked");
  expect(duplicatePreview.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
  const duplicateApply = await input.tool("ambient_messaging_remote_surface_reply_apply").execute(`${input.toolCallIdPrefix}-duplicate-reply-apply`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(duplicateApply.details.status).toBe("blocked");
  expect(duplicateApply.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
  await writeOwnerLoopOutput({
    replySent: true,
    replyApplyStatus: replyApply.details.status,
    delegatedApplyToolName: replyApply.details.delegatedToolName,
    deliveryStatus: replyApply.details.delivery?.status,
    providerMessageId: replyApply.details.delivery?.providerMessageId,
    relayStatusAfterSend: eventAfterSend?.relayStatus,
    relayActionStatusAfterSend: relaySummaryAfterSend?.relayActionStatus,
    duplicateBlockedAfterSend: relaySummaryAfterSend?.duplicateBlocked === true,
    duplicatePreviewStatus: duplicatePreview.details.status,
    duplicateApplyStatus: duplicateApply.details.status,
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
