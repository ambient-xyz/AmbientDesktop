import type { IpcMain } from "electron";
import { z } from "zod";

import {
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
} from "../../shared/symphonyWorkflowRecipes";
import type { SendMessageInput } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const messageSendIpcChannels = ["message:send"] as const;

const sttNoSpeechGateSchema = z.object({
  enabled: z.boolean(),
  skipped: z.boolean(),
  rmsDbfs: z.number().finite().optional(),
  peakDbfs: z.number().finite().optional(),
  thresholdDbfs: z.number().finite().optional(),
  sampleCount: z.number().finite().optional(),
  durationMs: z.number().finite().optional(),
  reason: z.string().min(1).optional(),
});

const sttMessageMetadataSchema = z.object({
  source: z.literal("stt"),
  utteranceId: z.string().min(1),
  threadId: z.string().min(1),
  status: z.enum(["queued", "transcribing", "ready", "no-speech", "failed"]),
  providerCapabilityId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  durationMs: z.number().finite().optional(),
  noSpeechGate: sttNoSpeechGateSchema.optional(),
  artifacts: z.object({
    audioPath: z.string().min(1).optional(),
    normalizedAudioPath: z.string().min(1).optional(),
    transcriptPath: z.string().min(1).optional(),
    jsonPath: z.string().min(1).optional(),
    stdoutPath: z.string().min(1).optional(),
    stderrPath: z.string().min(1).optional(),
  }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const symphonyBuilderAnswersSchema = z.record(
  z.string(),
  z.object({
    choiceId: z.string().min(1).max(200).optional(),
    customText: z.string().max(2000).optional(),
  }),
);

const localDeepResearchRunBudgetSchema = z.object({
  schemaVersion: z.literal("ambient-local-deep-research-run-budget-v1"),
  enabled: z.literal(true),
  effort: z.enum(["quick", "balanced", "deep", "exhaustive", "custom"]),
  maxToolCalls: z.number().int().min(1).max(500),
  source: z.enum(["user_default", "run_override", "tool_input"]),
  onExhausted: z.enum(["summarize", "ask_to_continue"]),
});

const composerIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local-deep-research"),
    localDeepResearch: localDeepResearchRunBudgetSchema,
  }),
  z.object({
    kind: z.literal("symphony-workflow"),
    action: z.enum(["run-once", "save-recipe"]),
    patternId: z.enum([
      "map_reduce",
      "adversarial_debate",
      "imitate_and_verify",
      "pipeline",
      "ensemble",
      "self_healing_loop",
    ]),
    blocking: z.boolean().optional(),
    stepAnswers: symphonyBuilderAnswersSchema.optional(),
    metricCustomizations: z.record(z.string(), z.string().max(4000)).optional(),
  }),
]).superRefine((intent, ctx) => {
  if (intent.kind !== "symphony-workflow") return;
  const missingLabels = missingRequiredSymphonyMetricTemplateLabels({
    patternId: intent.patternId,
    metricCustomizations: intent.metricCustomizations,
  });
  const message = requiredSymphonyMetricTemplateErrorMessage({
    missingLabels,
    actionLabel: intent.action === "run-once" ? "launching the Symphony workflow" : "saving the Symphony recipe",
  });
  if (!message) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["metricCustomizations"],
    message,
  });
});

const sendMessageSchema = z.object({
  threadId: z.string().min(1),
  content: z.string().min(1),
  permissionMode: z.enum(["full-access", "workspace"]),
  collaborationMode: z.enum(["agent", "planner"]),
  model: z.string().min(1),
  thinkingLevel: z.enum(["minimal", "low", "medium", "high", "xhigh"]),
  delivery: z.enum(["prompt", "steer", "follow-up"]).optional(),
  retryOfMessageId: z.string().min(1).optional(),
  workflowThreadId: z.string().min(1).max(512).optional(),
  workflowRecordingEditContext: z.object({
    id: z.string().min(1).max(512),
    title: z.string().min(1).max(500),
    version: z.number().int().positive(),
    manifestPath: z.string().min(1).max(4096),
    markdownPath: z.string().min(1).max(4096),
    sidecarPath: z.string().min(1).max(4096),
    transcriptPath: z.string().min(1).max(4096),
  }).optional(),
  preserveActiveThread: z.boolean().optional(),
  stt: sttMessageMetadataSchema.optional(),
  goalMode: z.object({
    enabled: z.boolean(),
    tokenBudget: z.number().int().positive().nullable().optional(),
  }).optional(),
  composerIntent: composerIntentSchema.optional(),
  context: z
    .array(
      z.object({
        path: z.string().min(1).max(4096),
        absolute: z.boolean().optional(),
      }),
    )
    .max(30)
    .optional(),
});

export type SendMessageIpcInput = z.infer<typeof sendMessageSchema>;

export interface RegisterMessageSendIpcDependencies {
  handleIpc: HandleIpc;
  sendMessage(input: SendMessageIpcInput, raw: SendMessageInput): MaybePromise<void>;
}

export function registerMessageSendIpc({
  handleIpc,
  sendMessage,
}: RegisterMessageSendIpcDependencies): void {
  handleIpc("message:send", (_event, raw: SendMessageInput) => sendMessage(sendMessageSchema.parse(raw), raw));
}
