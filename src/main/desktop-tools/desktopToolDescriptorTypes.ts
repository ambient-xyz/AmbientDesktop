import type { AmbientPluginRuntime } from "../../shared/pluginTypes";

export type DesktopToolSource = "first-party" | "plugin-mcp" | "pi-builtin";

export type DesktopToolSideEffect =
  | "none"
  | "read-external"
  | "write-external"
  | "write-workspace"
  | "control-browser"
  | "run-process"
  | "plugin-defined";

export type DesktopToolIdempotency = "required" | "recommended" | "not-supported";

export interface DesktopToolPaginationDescriptor {
  itemsPath?: string;
  nextPageTokenPath?: string;
  pageTokenInputPath?: string;
  pageSizeInputPath?: string;
  queryInputPath?: string;
  defaultPageSize: number;
  maxPageSize: number;
  queryFanOut?: boolean;
}

export type WorkflowCapabilityGuidanceRisk = "low" | "medium" | "high";

export interface WorkflowCapabilityGuidanceDescriptor {
  id: string;
  summary: string;
  text: string;
  applicabilityTags: string[];
  risk: WorkflowCapabilityGuidanceRisk;
  validatorRefs: string[];
}

export interface DesktopToolDescriptor {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  workflowGuidance?: WorkflowCapabilityGuidanceDescriptor[];
  inputSchema: unknown;
  outputSchema?: unknown;
  source: DesktopToolSource;
  sideEffects: DesktopToolSideEffect;
  permissionScope: string;
  supportsDryRun: boolean;
  supportsUndo: boolean;
  idempotency: DesktopToolIdempotency;
  defaultTimeoutMs: number;
  pagination?: DesktopToolPaginationDescriptor;
  runtimeSupport?: AmbientPluginRuntime[];
}

export interface PiToolRegistrationFields {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
}


export interface PluginMcpDescriptorInput {
  registeredName: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
}
