import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ContextUsageSnapshot } from "../../shared/types";
import { summarizeProviderPayload } from "../contextAccounting";

type ContextUsageSnapshotInput = Omit<ContextUsageSnapshot, "updatedAt">;

export interface ContextAccountingSession {
  sessionFile?: string;
  sessionManager: {
    getEntries(): unknown[];
  };
}

export interface ContextAccountingTokenCount {
  source: "local-tokenizer" | "estimate";
  tokens: number;
  latencyMs: number;
  error?: string;
}

export interface ContextAccountingCompactionStats {
  compactionCount: number;
  latestCompactionAt?: string;
}

export interface ContextAccountingExtensionOptions {
  threadId: string;
  contextWindow: number;
  getActiveSession: (threadId: string) => ContextAccountingSession | undefined;
  compactionStatsFromEntries: (entries: unknown[]) => ContextAccountingCompactionStats;
  countSerializedPayload: (payload: unknown, fallbackTokens?: number) => Promise<ContextAccountingTokenCount>;
  recordContextUsageSnapshot: (input: ContextUsageSnapshotInput) => ContextUsageSnapshot;
  emitContextUsageUpdated: (snapshot: ContextUsageSnapshot) => void;
  fileExists?: (path: string) => boolean;
}

export function createContextAccountingExtension(options: ContextAccountingExtensionOptions): ExtensionFactory {
  const fileExists = options.fileExists ?? (() => false);

  return (pi) => {
    (pi as any).on("before_provider_request", async (event: any) => {
      const accounting = summarizeProviderPayload(event.payload);
      const session = options.getActiveSession(options.threadId);
      const compaction = session
        ? options.compactionStatsFromEntries(session.sessionManager.getEntries())
        : { compactionCount: 0 };
      const tokenCount = await options.countSerializedPayload(event.payload, accounting.estimatedTokens);
      const tokens = tokenCount.tokens || accounting.estimatedTokens;
      const snapshot = options.recordContextUsageSnapshot({
        threadId: options.threadId,
        source: "estimate",
        tokens,
        contextWindow: options.contextWindow,
        percent: tokens !== undefined ? (tokens / options.contextWindow) * 100 : undefined,
        latestCompactionAt: compaction.latestCompactionAt,
        compactionCount: compaction.compactionCount,
        diagnostics: {
          piSessionFile: session?.sessionFile,
          piSessionFileExists: session?.sessionFile ? fileExists(session.sessionFile) : false,
          activeSession: Boolean(session),
          message:
            tokenCount.source === "local-tokenizer"
              ? `Local GLM tokenizer counted payload in ${tokenCount.latencyMs}ms.`
              : tokenCount.error,
          providerPayload: {
            ...accounting,
            estimatedTokens: tokenCount.source === "local-tokenizer" ? accounting.estimatedTokens : tokenCount.tokens,
          },
        },
      });
      options.emitContextUsageUpdated(snapshot);
      return undefined;
    });
  };
}
