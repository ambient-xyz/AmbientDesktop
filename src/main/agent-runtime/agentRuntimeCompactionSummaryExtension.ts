import type { Model } from "@mariozechner/pi-ai";
import {
  compact as defaultCompactPiContext,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";

import type { BrowserCapabilityState } from "../../shared/browserTypes";
import type { WorkspaceGitStatus, WorkspaceState } from "../../shared/workspaceTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  buildAmbientCompactionSummary as defaultBuildAmbientCompactionSummary,
  collectAmbientCompactionFileLists as defaultCollectAmbientCompactionFileLists,
  type AmbientCompactionFileLists,
  type AmbientCompactionSummaryInput,
} from "./recovery/compactionSummary";
import { getWorkspaceGitStatus as defaultGetWorkspaceGitStatus } from "./agentRuntimeWorkspaceFacade";
import {
  materializeProviderPayloadContext,
  type ProviderContextPreflightOptions,
} from "./agentRuntimeProviderContextPreflight";

type CompactPiContext = (
  preparation: unknown,
  model: Model<"openai-completions">,
  apiKey: string,
  resourceLoader: undefined,
  customInstructions: string,
  signal: AbortSignal | undefined,
  thinkingLevel: ThreadSummary["thinkingLevel"],
) => Promise<{ summary: string; details?: unknown }>;

export interface AmbientCompactionSummaryExtensionOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  model: Model<"openai-completions">;
  apiKey: string | undefined;
  getThread: (threadId: string) => ThreadSummary;
  listMessages: (threadId: string) => ChatMessage[];
  getBrowserState: () => Promise<BrowserCapabilityState | undefined> | BrowserCapabilityState | undefined;
  getWorkspaceGitStatus?: (workspacePath: string) => Promise<WorkspaceGitStatus | undefined> | WorkspaceGitStatus | undefined;
  compactPiContext?: CompactPiContext;
  buildAmbientCompactionSummary?: (input: AmbientCompactionSummaryInput) => string;
  collectAmbientCompactionFileLists?: (input: {
    visibleMessages: ChatMessage[];
    fileOps?: AmbientCompactionSummaryInput["fileOps"];
  }) => AmbientCompactionFileLists;
  providerContextPreflight?: Partial<Pick<
    ProviderContextPreflightOptions,
    "reserveTokens" | "hardPreflightPercent" | "textPreviewChars" | "offloadTextChars"
  >>;
  now?: () => string;
}

export function createAmbientCompactionSummaryExtension(
  options: AmbientCompactionSummaryExtensionOptions,
): ExtensionFactory {
  const compactPiContext = options.compactPiContext ?? (defaultCompactPiContext as CompactPiContext);
  const buildAmbientCompactionSummary = options.buildAmbientCompactionSummary ?? defaultBuildAmbientCompactionSummary;
  const collectAmbientCompactionFileLists = options.collectAmbientCompactionFileLists ?? defaultCollectAmbientCompactionFileLists;
  const getWorkspaceGitStatus = options.getWorkspaceGitStatus ?? defaultGetWorkspaceGitStatus;
  const now = options.now ?? (() => new Date().toISOString());

  return (pi) => {
    (pi as any).on("session_before_compact", async (event: any) => {
      if (!options.apiKey) return undefined;
      const thread = options.getThread(options.threadId);
      const visibleMessages = options.listMessages(options.threadId);
      const [gitStatus, browserState] = await Promise.all([
        Promise.resolve(getWorkspaceGitStatus(options.workspace.path)).catch(() => undefined),
        Promise.resolve(options.getBrowserState()).catch(() => undefined),
      ]);
      const ambientSummary = buildAmbientCompactionSummary({
        thread,
        visibleMessages,
        summarizedMessages: event.preparation?.messagesToSummarize,
        previousSummary: event.preparation?.previousSummary,
        gitStatus,
        browserState,
        fileOps: event.preparation?.fileOps,
        reason: event.customInstructions ? `manual: ${event.customInstructions}` : "automatic",
      });
      const customInstructions = [
        event.customInstructions,
        "Preserve the Ambient Desktop workspace state below. It is deterministic local state, not chat speculation.",
        ambientSummary,
      ]
        .filter(Boolean)
        .join("\n\n");
      const fileLists = collectAmbientCompactionFileLists({
        visibleMessages,
        fileOps: event.preparation?.fileOps,
      });
      const providerSafePreparation = await protectCompactionPreparationFailClosed({
        preparation: event.preparation,
        workspacePath: options.workspace.path,
        model: options.model,
        providerContextPreflight: options.providerContextPreflight,
      });
      if (providerSafePreparation.blocked) {
        return {
          cancel: true,
        };
      }
      const piCompaction = await compactPiContext(
        providerSafePreparation.preparation,
        options.model,
        options.apiKey,
        undefined,
        customInstructions,
        event.signal,
        thread.thinkingLevel,
      );
      return {
        compaction: {
          ...piCompaction,
          summary: `${piCompaction.summary}\n\n---\n\n${ambientSummary}`,
          details: {
            ...(piCompaction.details && typeof piCompaction.details === "object" ? piCompaction.details : {}),
            source: "ambient-desktop",
            version: 1,
            generatedAt: now(),
            readFiles: fileLists.readFiles,
            modifiedFiles: fileLists.modifiedFiles,
          },
        },
      };
    });
  };
}

interface ProtectedCompactionPreparation {
  preparation: unknown;
  blocked: boolean;
  blockArtifactPaths: string[];
  materializedArtifactPaths: string[];
  materializedOutputCount: number;
  failureReason?: string;
}

async function protectCompactionPreparationFailClosed(input: {
  preparation: unknown;
  workspacePath: string;
  model: Model<"openai-completions">;
  providerContextPreflight?: AmbientCompactionSummaryExtensionOptions["providerContextPreflight"];
}): Promise<ProtectedCompactionPreparation> {
  try {
    return await protectCompactionPreparation(input);
  } catch (error) {
    return {
      preparation: input.preparation,
      blocked: true,
      blockArtifactPaths: [],
      materializedArtifactPaths: [],
      materializedOutputCount: 0,
      failureReason: `Provider context materialization failed (${errorName(error)}) before compaction could be safely reduced.`,
    };
  }
}

async function protectCompactionPreparation(input: {
  preparation: unknown;
  workspacePath: string;
  model: Model<"openai-completions">;
  providerContextPreflight?: AmbientCompactionSummaryExtensionOptions["providerContextPreflight"];
}): Promise<ProtectedCompactionPreparation> {
  const record = objectRecord(input.preparation);
  if (!record) {
    return {
      preparation: input.preparation,
      blocked: false,
      blockArtifactPaths: [],
      materializedArtifactPaths: [],
      materializedOutputCount: 0,
    };
  }

  const preflightOptions = compactionProviderContextPreflightOptions(input, record);
  const [summaryMessages, turnPrefixMessages] = await Promise.all([
    protectCompactionHistoryMessages(record.messagesToSummarize, record.previousSummary, preflightOptions),
    protectCompactionMessageArray(record.turnPrefixMessages, preflightOptions),
  ]);
  const blockArtifactPaths = [...summaryMessages.blockArtifactPaths, ...turnPrefixMessages.blockArtifactPaths];
  const materializedArtifactPaths = [...summaryMessages.materializedArtifactPaths, ...turnPrefixMessages.materializedArtifactPaths];
  const materializedOutputCount = summaryMessages.materializedOutputCount + turnPrefixMessages.materializedOutputCount;
  if (summaryMessages.blocked || turnPrefixMessages.blocked) {
    return {
      preparation: input.preparation,
      blocked: true,
      blockArtifactPaths,
      materializedArtifactPaths,
      materializedOutputCount,
    };
  }

  if (!summaryMessages.changed && !turnPrefixMessages.changed) {
    return {
      preparation: input.preparation,
      blocked: false,
      blockArtifactPaths,
      materializedArtifactPaths,
      materializedOutputCount,
    };
  }

  return {
    preparation: {
      ...record,
      ...(summaryMessages.changed ? { messagesToSummarize: summaryMessages.messages } : {}),
      ...(turnPrefixMessages.changed ? { turnPrefixMessages: turnPrefixMessages.messages } : {}),
    },
    blocked: false,
    blockArtifactPaths,
    materializedArtifactPaths,
    materializedOutputCount,
  };
}

async function protectCompactionMessageArray(
  messages: unknown,
  options: ProviderContextPreflightOptions,
): Promise<{
  messages: unknown;
  changed: boolean;
  blocked: boolean;
  blockArtifactPaths: string[];
  materializedArtifactPaths: string[];
  materializedOutputCount: number;
}> {
  if (!Array.isArray(messages)) {
    return {
      messages,
      changed: false,
      blocked: false,
      blockArtifactPaths: [],
      materializedArtifactPaths: [],
      materializedOutputCount: 0,
    };
  }

  const result = await materializeProviderPayloadContext({
    payload: { messages },
    options,
  });
  const protectedPayload = objectRecord(result.payload);
  return {
    messages: Array.isArray(protectedPayload?.messages) ? protectedPayload.messages : messages,
    changed: result.changed,
    blocked: result.blocked,
    blockArtifactPaths: result.blockArtifactPath ? [result.blockArtifactPath] : [],
    materializedArtifactPaths: result.materializedOutputs
      .map((output) => output.artifactPath)
      .filter((path): path is string => Boolean(path)),
    materializedOutputCount: result.materializedOutputs.length,
  };
}

async function protectCompactionHistoryMessages(
  messages: unknown,
  previousSummary: unknown,
  options: ProviderContextPreflightOptions,
): ReturnType<typeof protectCompactionMessageArray> {
  if (typeof previousSummary !== "string" || !previousSummary.trim()) {
    return protectCompactionMessageArray(messages, options);
  }
  if (!Array.isArray(messages)) {
    return protectCompactionMessageArray([compactionPreviousSummaryMessage(previousSummary)], options);
  }

  const result = await materializeProviderPayloadContext({
    payload: { messages: [...messages, compactionPreviousSummaryMessage(previousSummary)] },
    options,
  });
  const protectedPayload = objectRecord(result.payload);
  const protectedMessages = Array.isArray(protectedPayload?.messages) ? protectedPayload.messages : messages;
  return {
    messages: protectedMessages.slice(0, messages.length),
    changed: result.changed,
    blocked: result.blocked,
    blockArtifactPaths: result.blockArtifactPath ? [result.blockArtifactPath] : [],
    materializedArtifactPaths: result.materializedOutputs
      .map((output) => output.artifactPath)
      .filter((path): path is string => Boolean(path)),
    materializedOutputCount: result.materializedOutputs.length,
  };
}

function compactionPreviousSummaryMessage(previousSummary: string): Record<string, unknown> {
  return {
    role: "user",
    content: previousSummary,
    name: "ambient_previous_compaction_summary",
  };
}

function compactionProviderContextPreflightOptions(
  input: {
    workspacePath: string;
    model: Model<"openai-completions">;
    providerContextPreflight?: AmbientCompactionSummaryExtensionOptions["providerContextPreflight"];
  },
  preparation: Record<string, unknown>,
): ProviderContextPreflightOptions {
  const preparationSettings = objectRecord(preparation.settings);
  return {
    workspacePath: input.workspacePath,
    contextWindow: positiveInteger((input.model as { contextWindow?: unknown }).contextWindow, Number.MAX_SAFE_INTEGER),
    reserveTokens: nonNegativeInteger(
      input.providerContextPreflight?.reserveTokens,
      nonNegativeInteger(preparationSettings?.reserveTokens, 0),
    ),
    hardPreflightPercent: positiveInteger(input.providerContextPreflight?.hardPreflightPercent, 100),
    textPreviewChars: input.providerContextPreflight?.textPreviewChars,
    offloadTextChars: input.providerContextPreflight?.offloadTextChars,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : typeof error;
}
