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
import { getWorkspaceGitStatus as defaultGetWorkspaceGitStatus } from "../workspace/workspaceGit";

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
      const piCompaction = await compactPiContext(
        event.preparation,
        options.model,
        options.apiKey,
        undefined,
        customInstructions,
        event.signal,
        thread.thinkingLevel,
      );
      const fileLists = collectAmbientCompactionFileLists({
        visibleMessages,
        fileOps: event.preparation?.fileOps,
      });
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
