import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
  type AmbientFeatureFlagId,
} from "../../shared/featureFlags";
import { diagnosticAgentMemoryFromStorage, diagnosticAgentMemoryStarterFromStorage } from "./diagnosticExportHistoryAgentMemoryStorage";
import {
  diagnosticLocalRuntimeEvidenceFromStorage,
  diagnosticLocalRuntimeSummaryFromStorage,
} from "./diagnosticExportHistoryLocalRuntimeStorage";
import { diagnosticReplayEvidenceFromStorage, diagnosticReplaySummaryFromStorage } from "./diagnosticExportHistoryReplayStorage";
import {
  MAX_SUMMARY_MESSAGE_CHARS,
  arrayValue,
  boundedString,
  finiteNonNegativeNumber,
  objectValue,
} from "./diagnosticExportHistoryStorageUtils";

const DIAGNOSTIC_EXPORT_HISTORY_STORAGE_SCHEMA_VERSION = "ambient-diagnostic-export-history-v1";

export interface DiagnosticExportHistoryStorageState {
  history: DiagnosticExportResult[];
  selectedId?: string;
}

export function diagnosticExportHistoryEntryId(result: DiagnosticExportResult): string {
  return `${result.path}\u0000${result.createdAt}`;
}

export function recordDiagnosticExportHistory(
  history: DiagnosticExportResult[],
  result: DiagnosticExportResult,
  limit = 5,
): DiagnosticExportResult[] {
  const id = diagnosticExportHistoryEntryId(result);
  const deduped = history.filter((entry) => diagnosticExportHistoryEntryId(entry) !== id);
  return [result, ...deduped].slice(0, Math.max(1, limit));
}

export function selectedDiagnosticExportFromHistory(
  history: DiagnosticExportResult[],
  selectedId: string | undefined,
): DiagnosticExportResult | undefined {
  return history.find((entry) => diagnosticExportHistoryEntryId(entry) === selectedId) ?? history[0];
}

export function encodeDiagnosticExportHistoryStorage(state: DiagnosticExportHistoryStorageState): string {
  const history = persistableDiagnosticExportHistory(state.history);
  const selectedId =
    state.selectedId && history.some((entry) => diagnosticExportHistoryEntryId(entry) === state.selectedId)
      ? state.selectedId
      : history[0]
        ? diagnosticExportHistoryEntryId(history[0])
        : undefined;
  return `${JSON.stringify({
    schemaVersion: DIAGNOSTIC_EXPORT_HISTORY_STORAGE_SCHEMA_VERSION,
    history,
    ...(selectedId ? { selectedId } : {}),
  })}\n`;
}

export function decodeDiagnosticExportHistoryStorage(raw: string | null | undefined): DiagnosticExportHistoryStorageState {
  if (!raw) return { history: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const payload = objectValue(parsed);
    if (payload?.schemaVersion !== DIAGNOSTIC_EXPORT_HISTORY_STORAGE_SCHEMA_VERSION) return { history: [] };
    const history = persistableDiagnosticExportHistory(
      arrayValue(payload.history).flatMap((entry) => {
        const result = diagnosticExportResultFromStorage(entry);
        return result ? [result] : [];
      }),
    );
    const selectedId =
      typeof payload.selectedId === "string" && history.some((entry) => diagnosticExportHistoryEntryId(entry) === payload.selectedId)
        ? payload.selectedId
        : history[0]
          ? diagnosticExportHistoryEntryId(history[0])
          : undefined;
    return { history, ...(selectedId ? { selectedId } : {}) };
  } catch {
    return { history: [] };
  }
}

function persistableDiagnosticExportHistory(history: DiagnosticExportResult[], limit = 5): DiagnosticExportResult[] {
  return history
    .flatMap((entry) => {
      const result = diagnosticExportResultFromStorage(entry);
      return result ? [result] : [];
    })
    .slice(0, Math.max(1, limit));
}

function diagnosticExportResultFromStorage(input: unknown): DiagnosticExportResult | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const path = typeof value.path === "string" ? value.path : undefined;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : undefined;
  const bytes = finiteNonNegativeNumber(value.bytes);
  if (!path || !createdAt || typeof bytes !== "number") return undefined;

  const replaySummary = diagnosticReplaySummaryFromStorage(objectValue(objectValue(value.summary)?.subagents)?.replayEvidence);
  const localRuntimeSummary = diagnosticLocalRuntimeSummaryFromStorage(objectValue(value.summary)?.localRuntimes);
  const agentMemory = diagnosticAgentMemoryFromStorage(objectValue(value.summary)?.agentMemory);
  const agentMemoryStarter = diagnosticAgentMemoryStarterFromStorage(objectValue(value.summary)?.agentMemoryStarter);
  const featureFlags = diagnosticFeatureFlagSnapshotFromStorage(objectValue(value.summary)?.featureFlags);
  const replayEvidence = diagnosticReplayEvidenceFromStorage(objectValue(objectValue(value.subagents)?.replayEvidence));
  const localRuntimeEvidence = diagnosticLocalRuntimeEvidenceFromStorage(objectValue(objectValue(value.localRuntimes)?.evidence));
  const summary =
    replaySummary || localRuntimeSummary || agentMemory || agentMemoryStarter || featureFlags
      ? ({
          ...(featureFlags ? { featureFlags } : {}),
          ...(agentMemory ? { agentMemory } : {}),
          ...(agentMemoryStarter ? { agentMemoryStarter } : {}),
          subagents: {
            ...(replaySummary ? { replayEvidence: replaySummary } : {}),
          },
          ...(localRuntimeSummary ? { localRuntimes: localRuntimeSummary } : {}),
        } as unknown as DiagnosticExportResult["summary"])
      : undefined;
  return {
    path,
    bytes,
    createdAt,
    ...(summary ? { summary } : {}),
    ...(replayEvidence
      ? {
          subagents: {
            replayEvidence,
          },
        }
      : {}),
    ...(localRuntimeEvidence
      ? {
          localRuntimes: {
            evidence: localRuntimeEvidence,
          },
        }
      : {}),
  };
}

function diagnosticFeatureFlagSnapshotFromStorage(input: unknown): AmbientFeatureFlagSnapshot | undefined {
  const value = objectValue(input);
  const flags = objectValue(value?.flags);
  const schemaVersion = value?.schemaVersion === "ambient-feature-flags-v1" ? value.schemaVersion : undefined;
  const generatedAt = boundedString(value?.generatedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const subagents = diagnosticFeatureFlagResolutionFromStorage(flags?.[AMBIENT_SUBAGENTS_FEATURE_FLAG], AMBIENT_SUBAGENTS_FEATURE_FLAG);
  if (!schemaVersion || !generatedAt || !subagents) return undefined;
  return {
    schemaVersion,
    generatedAt,
    flags: {
      [AMBIENT_SUBAGENTS_FEATURE_FLAG]: subagents,
      [AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG]:
        diagnosticFeatureFlagResolutionFromStorage(flags?.[AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG], AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG) ??
        defaultDiagnosticFeatureFlagResolution(AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG),
      [AMBIENT_SLASH_COMMANDS_FEATURE_FLAG]:
        diagnosticFeatureFlagResolutionFromStorage(flags?.[AMBIENT_SLASH_COMMANDS_FEATURE_FLAG], AMBIENT_SLASH_COMMANDS_FEATURE_FLAG) ??
        defaultDiagnosticFeatureFlagResolution(AMBIENT_SLASH_COMMANDS_FEATURE_FLAG),
    },
  };
}

function diagnosticFeatureFlagResolutionFromStorage(
  input: unknown,
  id: AmbientFeatureFlagId,
): AmbientFeatureFlagSnapshot["flags"][AmbientFeatureFlagId] | undefined {
  const flag = objectValue(input);
  const enabled = typeof flag?.enabled === "boolean" ? flag.enabled : undefined;
  const source = featureFlagSourceValue(flag?.source);
  const defaultEnabled = typeof flag?.defaultEnabled === "boolean" ? flag.defaultEnabled : undefined;
  if (enabled === undefined || !source || defaultEnabled === undefined) return undefined;
  return {
    id,
    enabled,
    source,
    defaultEnabled,
    ...(typeof flag?.settingsEnabled === "boolean" ? { settingsEnabled: flag.settingsEnabled } : {}),
  };
}

function defaultDiagnosticFeatureFlagResolution(id: AmbientFeatureFlagId): AmbientFeatureFlagSnapshot["flags"][AmbientFeatureFlagId] {
  return {
    id,
    enabled: false,
    source: "default",
    defaultEnabled: false,
  };
}

function featureFlagSourceValue(
  value: unknown,
): AmbientFeatureFlagSnapshot["flags"][typeof AMBIENT_SUBAGENTS_FEATURE_FLAG]["source"] | undefined {
  return value === "default" ||
    value === "settings" ||
    value === "startup_arg_enable" ||
    value === "startup_arg_disable" ||
    value === "harness_enable" ||
    value === "harness_disable"
    ? value
    : undefined;
}
