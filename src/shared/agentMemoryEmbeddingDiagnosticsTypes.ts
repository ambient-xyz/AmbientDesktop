import type { DiagnosticExportHealthStatus } from "./diagnosticHealthTypes";

export type AgentMemoryEmbeddingStatus =
  | "disabled"
  | "ready"
  | "keyword_fallback"
  | "starting"
  | "unavailable"
  | "error";

export type AgentMemoryEmbeddingReindexStatus =
  | "not_required"
  | "pending"
  | "partial"
  | "complete"
  | "error"
  | "unknown";

export interface AgentMemoryEmbeddingDiagnostics {
  enabled: boolean;
  status: AgentMemoryEmbeddingStatus;
  message: string;
  providerMode?: string;
  providerId?: string;
  providerCapabilityId?: string;
  packageName?: string;
  modelId?: string;
  modelProfileId?: string;
  dimensions?: number;
  endpoint?: string;
  runtimeId?: string;
  runtimeStatus?: string;
  running?: boolean;
  autoStartProvider?: boolean;
  preflightEnabled?: boolean;
  sendDimensions?: boolean;
  maxInputChars?: number;
  timeoutMs?: number;
  reindexStatus?: AgentMemoryEmbeddingReindexStatus;
  missingHints?: string[];
  lastError?: string;
}

export interface AgentMemoryNativeDependencyPreflightDependency {
  name: string;
  expectedVersion?: string;
  resolvable: boolean;
  version?: string;
  packageJsonPath?: string;
  status: DiagnosticExportHealthStatus;
  message: string;
}

export interface AgentMemoryNativeDependencyPreflight {
  schemaVersion: "ambient-agent-memory-native-preflight-v1";
  checkedAt: string;
  platform: string;
  arch: string;
  nodeModuleVersion?: string;
  coreModuleConfigured: boolean;
  coreModuleSpecifier?: string;
  status: DiagnosticExportHealthStatus;
  message: string;
  dependencies: AgentMemoryNativeDependencyPreflightDependency[];
  errors: string[];
}
