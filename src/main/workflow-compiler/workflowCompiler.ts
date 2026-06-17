import { z } from "zod";
import type {
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphNodeType,
  WorkflowGraphSnapshot,
  WorkflowManifest,
  WorkflowSourceRange,
  WorkflowSourceRangeKind,
  WorkflowSpec,
} from "../../shared/types";
import type { AmbientCliCapabilitySearchResponse } from "../ambientCliPackages";
import type { DesktopToolDescriptor } from "../desktopToolRegistry";
import {
  validateWorkflowConnectorManifest,
  workflowConnectorCompilerSection,
  type WorkflowConnectorDescriptor,
} from "../workflowConnectors";
import { MAX_WORKFLOW_SOURCE_CHARS, validateWorkflowSourceIsolation } from "../workflowSourceValidation";

export interface WorkflowCompilerToolSelectionInput {
  userRequest: string;
  workspaceSummary?: string;
  toolDescriptors: DesktopToolDescriptor[];
  capabilityQueries?: string[];
  requiredToolNames?: string[];
  blockedToolNames?: string[];
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  maxTools?: number;
}

export interface WorkflowCompilerToolSelection {
  selectedToolDescriptors: DesktopToolDescriptor[];
  selectedToolNames: string[];
  availableToolCount: number;
}

export interface WorkflowCompilerRequiredBuiltinToolIntent {
  toolName: string;
  label: string;
  reason: string;
  repairHint: string;
  forbiddenSubstitutes: string[];
}

export interface WorkflowCompilerConnectorSelectionInput {
  userRequest: string;
  workspaceSummary?: string;
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  capabilityQueries?: string[];
  requiredConnectorIds?: string[];
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  maxConnectors?: number;
  maxOperationsPerConnector?: number;
}

export interface WorkflowCompilerConnectorSelection {
  selectedConnectorDescriptors: WorkflowConnectorDescriptor[];
  selectedConnectorIds: string[];
  selectedOperationCount: number;
  availableConnectorCount: number;
  availableOperationCount: number;
}

export interface WorkflowCompilerCapabilityDiscoveryPlan {
  queries: Array<{ query: string; reason?: string }>;
  requiredToolNames: string[];
  requiredConnectorIds: string[];
  openQuestions: string[];
}

export interface WorkflowCompilerAmbientCliCapability {
  capabilityId: string;
  registryPluginId: string;
  packageId: string;
  packageName: string;
  command: string;
  description?: string;
  availability: "available" | "unavailable";
  risk: string[];
  missingEnv: string[];
  whyMatched: string[];
}

export interface WorkflowCompilerOutput {
  title: string;
  spec: WorkflowSpec;
  manifest: WorkflowManifest;
  graph?: {
    summary: string;
    nodes: WorkflowGraphNode[];
    edges: WorkflowGraphEdge[];
  };
  source: string;
  previewSummary: string;
  dryRunStrategy: string;
  openQuestions: string[];
}

export interface ValidatedWorkflowCompilerOutput {
  output: WorkflowCompilerOutput;
  toolNames: string[];
}

function optionalWorkflowGraphText(max: number) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, z.string().max(max).optional());
}

const workflowGraphNodeSchema = z.object({
  id: z.string().min(1).max(160),
  type: z.preprocess(
    normalizeWorkflowGraphNodeType,
    z.enum([
      "request",
      "data_source",
      "deterministic_step",
      "agent_exploration",
      "model_call",
      "connector_call",
      "review_gate",
      "mutation",
      "output",
      "error_handler",
    ]),
  ),
  label: z.string().min(1).max(240),
  description: optionalWorkflowGraphText(4000),
  modelRole: optionalWorkflowGraphText(2000),
  dataSummary: optionalWorkflowGraphText(2000),
  inputSummary: optionalWorkflowGraphText(2000),
  outputSummary: optionalWorkflowGraphText(2000),
  toolNames: z.array(z.string().min(1)).max(100).optional(),
  connectorIds: z.array(z.string().min(1)).max(100).optional(),
  retryPolicy: optionalWorkflowGraphText(2000),
  retentionPolicy: optionalWorkflowGraphText(2000),
  reviewPolicy: optionalWorkflowGraphText(2000),
  runState: z.enum(["pending", "active", "completed", "paused", "failed", "skipped", "retrying"]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

const workflowGraphEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(160),
  target: z.string().min(1).max(160),
  type: z.preprocess(normalizeWorkflowGraphEdgeType, z.enum(["data_flow", "control_flow", "condition", "retry", "resume"])),
  label: z.string().max(240).optional(),
  dataSummary: optionalWorkflowGraphText(2000),
  runState: z.enum(["pending", "active", "completed", "paused", "failed", "skipped", "retrying"]).optional(),
});

const compilerOutputSchema = z.object({
  title: z.string().min(1).max(240),
  spec: z.object({
    goal: z.string().min(1),
    summary: z.string().optional(),
    successCriteria: z.array(z.string()).optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
  }),
  manifest: z.object({
    tools: z.array(z.string().min(1)).max(100),
    pluginCapabilities: z
      .array(
        z.object({
          capabilityId: z.string().min(1),
          pluginId: z.string().min(1),
          pluginName: z.string().min(1),
          serverName: z.string().min(1),
          toolName: z.string().min(1),
          registeredName: z.string().min(1),
        }),
      )
      .optional(),
    ambientCliCapabilities: z
      .array(
        z.object({
          capabilityId: z.string().min(1),
          registryPluginId: z.string().min(1),
          packageId: z.string().min(1),
          packageName: z.string().min(1),
          command: z.string().min(1),
        }),
      )
      .optional(),
    googleWorkspaceMethods: z
      .array(
        z.object({
          methodId: z.string().min(1),
          accountHint: z.string().min(1).optional(),
          accountProvenance: z.enum(["literal", "google_workspace_status", "unspecified"]),
          service: z.string().min(1),
          resource: z.string(),
          method: z.string().min(1),
          httpMethod: z.string().min(1),
          path: z.string().min(1).optional(),
          scopes: z.array(z.string().min(1)).default([]),
          sideEffect: z.enum(["metadata_read", "personal_content_read", "draft_write", "data_mutation", "sharing_mutation", "external_communication", "unknown"]),
          dataRetention: z.enum(["none", "redacted_audit", "run_artifact"]),
          dryRunSupported: z.boolean(),
          catalogVersion: z.string().min(1).optional(),
          requiresTimeRange: z.boolean().optional(),
          materializesFile: z.boolean().optional(),
        }),
      )
      .optional(),
    mutationPolicy: z.enum(["read_only", "staged_until_approved", "apply_after_approval"]),
    defaultIdleTimeoutMs: z.number().int().positive().optional(),
    maxToolCalls: z.number().int().nonnegative().optional(),
    maxModelCalls: z.number().int().nonnegative().optional(),
    maxConnectorCalls: z.number().int().nonnegative().optional(),
    maxRunMs: z.number().int().positive().optional(),
    requiresReviewBelowConfidence: z.number().min(0).max(1).optional(),
    connectors: z
      .array(
        z.object({
          connectorId: z.string().min(1),
          accountId: z.string().min(1).optional(),
          scopes: z.array(z.string().min(1)).default([]),
          operations: z.array(z.string().min(1)).default([]),
          dataRetention: z.enum(["none", "redacted_audit", "run_artifact"]),
        }),
      )
      .optional(),
  }),
  graph: z
    .object({
      summary: z.string().min(1).max(10_000),
      nodes: z.array(workflowGraphNodeSchema).min(1).max(200),
      edges: z.array(workflowGraphEdgeSchema).max(400),
    })
    .optional(),
  source: z.string().min(1).max(MAX_WORKFLOW_SOURCE_CHARS),
  previewSummary: z.string().min(1).max(10_000),
  dryRunStrategy: z.string().min(1).max(10_000),
  openQuestions: z.array(z.string()).default([]),
});

const workflowCompilerCapabilityDiscoveryQuerySchema = z.preprocess(
  (value) => (typeof value === "string" ? { query: value } : value),
  z.object({
    query: z.string().trim().min(1).max(240),
    reason: z.string().trim().max(500).optional(),
  }),
);

const workflowCompilerCapabilityDiscoverySchema = z.object({
  queries: z
    .array(workflowCompilerCapabilityDiscoveryQuerySchema)
    .max(8)
    .default([]),
  requiredToolNames: z.array(z.string().min(1).max(160)).max(20).default([]),
  requiredConnectorIds: z.array(z.string().min(1).max(160)).max(20).default([]),
  openQuestions: z.array(z.string().min(1).max(500)).max(10).default([]),
});

const ambientToolNames = new Set(["ambient.responses"]);
const DEFAULT_WORKFLOW_COMPILER_SELECTED_TOOL_LIMIT = 14;
const DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_LIMIT = 4;
const DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_OPERATION_LIMIT = 8;
const WORKFLOW_COMPILER_MIN_SELECTED_TOOL_SCORE = 8;
const WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_SCORE = 8;
const WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_OPERATION_SCORE = 6;
const WORKFLOW_GRAPH_CANONICAL_NODE_WIDTH = 220;
const WORKFLOW_GRAPH_CANONICAL_NODE_HEIGHT = 92;
const WORKFLOW_GRAPH_CANONICAL_COLUMN_GAP = 300;
const WORKFLOW_GRAPH_CANONICAL_ROW_GAP = 132;
const WORKFLOW_GRAPH_NODE_TYPE_LAYOUT_PRIORITY: Record<WorkflowGraphNodeType, number> = {
  request: 0,
  data_source: 1,
  deterministic_step: 2,
  agent_exploration: 3,
  connector_call: 4,
  model_call: 5,
  review_gate: 6,
  mutation: 7,
  error_handler: 8,
  output: 9,
};
const WORKFLOW_COMPILER_TOOL_HINTS: Record<string, RegExp[]> = {
  bash: [
    /\b(bash|shell|terminal|command|script|process|pnpm|npm|node|python|pytest|vitest|test|build|render|pdf|pandoc|playwright)\b/i,
  ],
  file_read: [/\b(read|load|inspect|parse|file|workspace|document|csv|json|markdown|md|source|input)\b/i],
  local_directory_list: [/\b(local|downloads?|desktop|documents folder|documents directory|folder|directory|files|categorize|classify|inventory)\b/i],
  local_file_read: [/\b(local|downloads?|desktop|documents folder|documents directory|read|load|inspect|document|docx|xlsx|pptx|csv|json|markdown|txt)\b/i],
  file_write: [/\b(write|save|store|create|pdf|documents folder|export|artifact|file writing|write .*file|save .*file|store .*file)\b/i],
  media_download: [/\b(download|media|image|video|audio|asset|thumbnail)\b/i],
  browser_search: [/\b(search|web|internet|online|find|lookup|venue|event|upcoming|performance|music|restaurant|site)\b/i],
  browser_nav: [/\b(browser|web|site|page|url|navigate|open|venue|event|upcoming|performance)\b/i],
  browser_content: [/\b(browser|web|site|page|content|extract|scrape|read page|venue|event|upcoming|performance)\b/i],
  browser_eval: [/\b(browser|evaluate|dom|javascript|interactive|web app)\b/i],
  browser_keypress: [/\b(browser|keyboard|keypress|type|form|login)\b/i],
  browser_login: [/\b(login|sign in|authenticate|account|captcha|mfa)\b/i],
  browser_screenshot: [/\b(screenshot|visual|capture|page image|browser proof)\b/i],
  browser_pick: [/\b(pick|select element|choose element|browser element)\b/i],
  ambient_cli_search: [/\b(ambient cli|cli package|installed command|youtube|arxiv|transcript|local command|capability search)\b/i],
  ambient_cli_describe: [/\b(ambient cli|cli package|installed command|youtube|arxiv|transcript|local command|describe|preflight)\b/i],
  ambient_cli_secret_request: [/\b(api key|apikey|secret|credential|token|missing env|environment requirement|cloud-backed|cloud api)\b/i],
  ambient_cli_env_bind: [/\b(api key|apikey|secret file|env bind|environment binding|missing env|credential|token|cloud-backed|cloud api)\b/i],
  ambient_cli: [/\b(ambient cli|cli package|installed command|youtube|arxiv|transcript|local command|cloud-backed|cloud api)\b/i],
  long_context_process: [
    /\b(long[-_\s]?context|rlm|large evidence|long evidence|long fields?|many records?|deeply structured|transcripts?|meeting notes|action items?)\b/i,
  ],
  ambient_visual_analyze: [/\b(images?|photos?|pictures?|screenshots?|visual|vision|ocr|minicpm|classif(?:y|ication).*images?|categoriz(?:e|ation).*images?)\b/i],
  ambient_visual_minicpm_setup: [
    /\b(?:set\s*up|setup|install|repair|validate|uninstall|clean\s+up|bind)\b[^\n]{0,100}\b(?:minicpm|visual provider|vision provider|visual analysis provider)\b/i,
    /\b(?:minicpm|visual provider|vision provider|visual analysis provider)\b[^\n]{0,100}\b(?:set\s*up|setup|install|repair|validate|uninstall|clean\s+up|bind)\b/i,
    /\bambient_visual_minicpm_setup\b/i,
  ],
  google_workspace_status: [/\b(google(?:\s+workspace)?|gmail|calendar|drive|docs|sheets|slides)\b/i],
  google_workspace_call: [/\b(google(?:\s+workspace)?|gmail|calendar|drive|docs|sheets|slides)\b/i],
  google_workspace_materialize_file: [/\b(google(?:\s+workspace)?|drive|docs|sheets|slides)\b/i],
};
const WORKFLOW_COMPILER_TOOL_SEARCH_TOKEN_IGNORES: Record<string, Set<string>> = {
  google_workspace_status: new Set(["workspace", "status", "tool", "read"]),
  google_workspace_call: new Set(["workspace", "call", "tool", "read"]),
  google_workspace_materialize_file: new Set(["workspace", "materialize", "file", "tool", "read", "export"]),
  google_workspace_search_methods: new Set(["workspace", "search", "methods", "tool", "read"]),
};
const WORKFLOW_COMPILER_TOOL_FALLBACK_NAMES = ["file_read", "file_write", "local_directory_list", "browser_search", "browser_content", "bash"];
const WORKFLOW_COMPILER_BROWSER_SOURCE_TOOLS = new Set(["browser_search", "browser_nav", "browser_content", "browser_login"]);
const WORKFLOW_COMPILER_BROWSER_BUILTIN_TOOL_INTENTS: Array<{
  toolName:
    | "browser_search"
    | "browser_nav"
    | "browser_content"
    | "browser_eval"
    | "browser_keypress"
    | "browser_login"
    | "browser_screenshot"
    | "browser_pick";
  label: string;
}> = [
  { toolName: "browser_search", label: "Browser search" },
  { toolName: "browser_nav", label: "Browser navigation" },
  { toolName: "browser_content", label: "Browser page content" },
  { toolName: "browser_eval", label: "Browser DOM evaluation" },
  { toolName: "browser_keypress", label: "Browser keypress" },
  { toolName: "browser_login", label: "Browser login" },
  { toolName: "browser_screenshot", label: "Browser screenshot" },
  { toolName: "browser_pick", label: "Browser element picker" },
];
const WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES = new Set([
  "ambient_cli_package_preview",
  "ambient_cli_package_install",
  "ambient_cli_package_install_pi_catalog",
  "ambient_cli_search",
  "ambient_cli_describe",
  "ambient_cli_secret_request",
  "ambient_cli_env_bind",
  "ambient_cli",
  "ambient_cli_package_uninstall",
]);
const WORKFLOW_COMPILER_TOOL_COMPANIONS: Record<string, string[]> = {
  browser_search: ["browser_screenshot"],
  browser_nav: ["browser_screenshot"],
  browser_content: ["browser_screenshot"],
  browser_login: ["browser_nav", "browser_content", "browser_pick", "browser_screenshot"],
  local_directory_list: ["local_file_read"],
  local_file_read: ["local_directory_list"],
  ambient_cli_search: ["ambient_cli_describe"],
  ambient_cli_describe: ["ambient_cli", "ambient_cli_secret_request", "ambient_cli_env_bind"],
  ambient_cli_secret_request: ["ambient_cli_describe"],
  ambient_cli_env_bind: ["ambient_cli_describe", "ambient_cli"],
  ambient_cli: ["ambient_cli_search", "ambient_cli_describe", "ambient_cli_secret_request", "ambient_cli_env_bind"],
};
const WORKFLOW_COMPILER_GOOGLE_TOOL_NAMES = new Set([
  "google_workspace_install_gws",
  "google_workspace_start_login",
  "google_workspace_import_oauth_client",
  "google_workspace_validate_account",
  "google_workspace_cancel_setup",
  "google_workspace_status",
  "google_workspace_call",
  "google_workspace_materialize_file",
  "google_workspace_search_methods",
]);
const WORKFLOW_COMPILER_VISUAL_TOOL_NAMES = new Set(["ambient_visual_analyze", "ambient_visual_minicpm_setup"]);
const WORKFLOW_COMPILER_VISUAL_EVIDENCE_INTENT_PATTERNS = [
  /\b(images?|photos?|pictures?|screenshots?|ocr|video[-\s]?frames?|ui review|game visual review|design comparison|minicpm|vision provider|visual provider|visual[-\s]?analysis|visual[-\s]?understanding)\b/i,
  /\b(?:inspect|analy[sz]e|categorize|classify|compare|summarize|extract|read)\b[^.\n]{0,80}\b(?:image|photo|picture|screenshot|visual|video frame)\b/i,
  /\b(?:image|photo|picture|screenshot|visual|video frame)\b[^.\n]{0,80}\b(?:inspect|analy[sz]e|categorize|classify|compare|summary|ocr|extract|read)\b/i,
  /\b(?:ambient_visual_analyze|ambient_visual_minicpm_setup)\b/i,
];
const WORKFLOW_COMPILER_VISUAL_PROVIDER_SETUP_INTENT_PATTERNS = [
  /\b(?:set\s*up|setup|install|repair|validate|uninstall|clean\s+up|bind)\b[^\n]{0,100}\b(?:minicpm|visual provider|vision provider|visual analysis provider)\b/i,
  /\b(?:minicpm|visual provider|vision provider|visual analysis provider)\b[^\n]{0,100}\b(?:set\s*up|setup|install|repair|validate|uninstall|clean\s+up|bind)\b/i,
  /\bambient_visual_minicpm_setup\b/i,
];
const WORKFLOW_COMPILER_FIRST_PARTY_CONNECTOR_INTENT_PATTERNS = [
  /\b(?:gmail|google\s+mail|inbox|email|google\s+calendar|google\s+drive|google\s+docs|google\s+sheets|google\s+slides)\b/i,
  /\bslack\b/i,
  /\bgithub\s+(?:issues?|pull\s+requests?|prs?|notifications?|repositories?|repos?)\b/i,
  /\b(?:issues?|pull\s+requests?|prs?|notifications?)\b[^\n]{0,80}\bgithub\b/i,
  /\bgithub\s+connector\b/i,
];
const WORKFLOW_COMPILER_GOOGLE_CONNECTOR_INTENT_PATTERNS = [
  /\b(?:gmail|google\s+mail|inbox|email|google\s+calendar|google\s+drive|google\s+docs|google\s+sheets|google\s+slides)\b/i,
  /\bgoogle\.(?:gmail|calendar|drive)\b/i,
  /\bgoogle\s+meet(?:ing|ings)?\b/i,
  /\bgoogle\s+meet\s+transcripts?\b/i,
];
const WORKFLOW_COMPILER_NEGATED_TOOL_GROUPS: Array<{ tools: string[]; patterns: RegExp[] }> = [
  {
    tools: [...WORKFLOW_COMPILER_GOOGLE_TOOL_NAMES],
    patterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:google|google\s+workspace|google\s+drive|drive|gmail|calendar|docs|sheets|slides)\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,120}\b(?:google|google\s+workspace|google\s+drive|drive|gmail|calendar|docs|sheets|slides)\b/i,
      /\b(?:google|google\s+workspace|google\s+drive|drive|gmail|calendar|docs|sheets|slides)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits)\b/i,
    ],
  },
  {
    tools: [...WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES],
    patterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:ambient\s+cli|ambient[_\s-]?cli|cli package|cli packages|installed cli|external cli)\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,240}\b(?:ambient\s+cli|ambient[_\s-]?cli|cli package|cli packages|installed cli|external cli)\b/i,
      /\b(?:ambient\s+cli|ambient[_\s-]?cli|cli package|cli packages|installed cli|external cli)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    tools: [...WORKFLOW_COMPILER_VISUAL_TOOL_NAMES],
    patterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:visual analysis|visual[-\s]?analysis|vision|image analysis|screenshot analysis|ocr)\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,180}\b(?:visual analysis|visual[-\s]?analysis|vision|image analysis|screenshot analysis|ocr)\b/i,
      /\b(?:visual analysis|visual[-\s]?analysis|vision|image analysis|screenshot analysis|ocr)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    tools: ["file_write"],
    patterns: [
      /\bread[-\s]?only\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:file[_\s-]?write|file writes?|local writes?|workspace writes?|write files?|writing files?|save files?|saving files?|store files?|mutations?)\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,120}\b(?:file[_\s-]?write|file writes?|local writes?|workspace writes?|write files?|writing files?|save files?|saving files?|store files?|mutations?)\b/i,
      /\b(?:file[_\s-]?write|file writes?|local writes?|workspace writes?|write files?|writing files?|save files?|saving files?|store files?|mutations?)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    tools: ["file_read", "local_file_read", "local_directory_list"],
    patterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:file reads?|local file reads?|local files?|file tools?|workspace inventory|local[_\s-]?file[_\s-]?read|local[_\s-]?directory[_\s-]?list|file[_\s-]?read)\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,120}\b(?:file reads?|local file reads?|local files?|file tools?|workspace inventory|local[_\s-]?file[_\s-]?read|local[_\s-]?directory[_\s-]?list|file[_\s-]?read)\b/i,
      /\b(?:file reads?|local file reads?|local files?|file tools?|workspace inventory|local[_\s-]?file[_\s-]?read|local[_\s-]?directory[_\s-]?list|file[_\s-]?read)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    tools: ["browser_search"],
    patterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:browser[_\s-]?search|web\s+search|search(?:es|ing)?)\b/i,
      /\b(?:do\s+not|don't|dont|without|avoid|exclude|skip)\b[^;\n]{0,120}\b(?:browser[_\s-]?search|web\s+search|search(?:es|ing)?)\b/i,
      /\b(?:browser[_\s-]?search|web\s+search|search(?:es|ing)?)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    tools: [
      "browser_search",
      "browser_nav",
      "browser_local_preview",
      "browser_content",
      "browser_eval",
      "browser_keypress",
      "browser_login",
      "browser_screenshot",
      "browser_pick",
    ],
    patterns: [
      /\b(?:do\s+not|don't|dont|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:browser|web\s+access|internet|network|online)\b/i,
      /\b(?:do\s+not|don't|dont|without|avoid|exclude)\b[^;\n]{0,120}\b(?:browser|web\s+access|internet|network|online)\b/i,
      /\b(?:browser|web\s+access|internet|network|online)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    tools: ["bash"],
    patterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\s+(?:(?:use|using)\s+)?(?:shell|bash|terminal|command\s+line|raw\s+process|process)\b/i,
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,120}\b(?:shell|bash|terminal|command\s+line|raw\s+process|process)\b/i,
      /\b(?:shell|bash|terminal|command\s+line|raw\s+process|process)\s+(?:is|are)?\s*(?:not|unavailable|out\s+of\s+scope|off\s+limits)\b/i,
    ],
  },
];
const workflowPrimitiveNames = new Set([
  "step",
  "batch",
  "paginateTool",
  "paginateConnector",
  "mapCollection",
  "dedupeCollection",
  "chunkCollection",
  "renderDocument",
  "mapModel",
  "reduceModel",
  "checkpoint",
  "resumePoint",
  "askUser",
  "requireApproval",
  "stageMutation",
  "skipItem",
  "emit",
  "abortSignal",
  "recovery",
]);

export function workflowCompilerRequiredBuiltinToolIntents(input: WorkflowCompilerToolSelectionInput): WorkflowCompilerRequiredBuiltinToolIntent[] {
  const corpus = workflowCompilerCapabilityCorpus(input);
  const deniedToolNames = workflowCompilerDeniedToolNames(input);
  const intents = new Map<string, WorkflowCompilerRequiredBuiltinToolIntent>();
  const addIntent = (intent: WorkflowCompilerRequiredBuiltinToolIntent) => {
    const requiredByProvider = (input.requiredToolNames ?? []).includes(intent.toolName);
    const exactToolMention = workflowCompilerExactToolNameMention(corpus, intent.toolName);
    if (workflowCompilerToolNameIsDenied(corpus, intent.toolName)) return;
    if (deniedToolNames.has(intent.toolName) && !exactToolMention) return;
    intents.set(intent.toolName, intent);
  };

  if (workflowCompilerHasVisualEvidenceIntent(input)) {
    if (workflowCompilerHasVisualProviderSetupIntent(input)) {
      addIntent({
        toolName: "ambient_visual_minicpm_setup",
        label: "MiniCPM visual-provider setup",
        reason: "The request asks to install, validate, repair, or bind the visual provider.",
        repairHint: "Enable the first-party MiniCPM setup capability or remove the visual-provider setup requirement before compiling.",
        forbiddenSubstitutes: ["ambient_cli", "bash", "model.call", "browser_screenshot"],
      });
    } else {
      addIntent({
        toolName: "ambient_visual_analyze",
        label: "Visual analysis",
        reason: "The request requires actual visual evidence from images, screenshots, OCR, or video frames.",
        repairHint: "Enable or repair the first-party MiniCPM visual analysis capability before compiling this visual workflow.",
        forbiddenSubstitutes: ["model.call over filenames", "local_directory_list metadata", "browser_screenshot only", "ambient_cli"],
      });
    }
  }

  if (!workflowCompilerExactWorkspaceFileReadOnlyIntent(input) && workflowCompilerExactLocalDirectoryListIntent(corpus)) {
    addIntent({
      toolName: "local_directory_list",
      label: "Local directory inventory",
      reason: "The request explicitly names local_directory_list or a local Downloads/Desktop/Documents metadata inventory.",
      repairHint: "Enable the built-in local_directory_list workflow tool or change the request to use a different explicit data source.",
      forbiddenSubstitutes: ["workspace.inventory", "browser_search", "google.drive", "model.call over guessed filenames"],
    });
  }

  for (const toolName of ["file_read", "local_file_read"] as const) {
    if (!workflowCompilerExactToolNameMention(corpus, toolName)) continue;
    addIntent({
      toolName,
      label: toolName === "file_read" ? "Workspace file read" : "Local file read",
      reason: `The request explicitly names ${toolName}.`,
      repairHint: `Enable the built-in ${toolName} workflow tool or change the request to remove that exact tool requirement.`,
      forbiddenSubstitutes: ["workspace.inventory", "browser_search", "model.call over filenames"],
    });
  }

  const blockedToolNames = new Set(input.blockedToolNames ?? []);
  for (const { toolName, label } of WORKFLOW_COMPILER_BROWSER_BUILTIN_TOOL_INTENTS) {
    const requiredByProvider = (input.requiredToolNames ?? []).includes(toolName);
    const exactToolMention = workflowCompilerExactToolNameMention(corpus, toolName);
    if (!requiredByProvider && !exactToolMention) continue;
    if (blockedToolNames.has(toolName) && requiredByProvider && !exactToolMention) continue;
    addIntent({
      toolName,
      label,
      reason: requiredByProvider ? `Capability discovery marked ${toolName} as required for this workflow.` : `The request explicitly names ${toolName}.`,
      repairHint: `Enable the built-in ${toolName} browser workflow tool or change the request/search routing so this exact browser capability is no longer required.`,
      forbiddenSubstitutes: ["model.call over guessed web content", "workspace.inventory", "raw Google Workspace tools", "local files", "ambient_cli"],
    });
  }

  return [...intents.values()];
}

export function selectWorkflowCompilerToolDescriptors(input: WorkflowCompilerToolSelectionInput): WorkflowCompilerToolSelection {
  const maxTools = Math.max(1, Math.floor(input.maxTools ?? DEFAULT_WORKFLOW_COMPILER_SELECTED_TOOL_LIMIT));
  const descriptorsByName = new Map(input.toolDescriptors.map((tool) => [tool.name, tool]));
  const explicitToolNames = workflowCompilerExplicitToolNames(input);
  const deniedToolNames = workflowCompilerDeniedToolNames(input);
  for (const toolName of input.blockedToolNames ?? []) deniedToolNames.add(toolName);
  for (const toolName of workflowCompilerIntentDeniedToolNames(input, explicitToolNames)) deniedToolNames.add(toolName);
  for (const toolName of input.requiredToolNames ?? []) {
    if (!deniedToolNames.has(toolName)) explicitToolNames.add(toolName);
  }
  const capabilityQueries = [...new Set((input.capabilityQueries ?? []).map((query) => query.trim()).filter(Boolean))].slice(0, 8);
  const corpus = workflowCompilerCapabilityCorpus(input);
  const scored = input.toolDescriptors
    .map((tool, index) => ({
      tool,
      index,
      score: workflowCompilerToolScore(tool, corpus, explicitToolNames),
    }))
    .filter((item) => item.score >= WORKFLOW_COMPILER_MIN_SELECTED_TOOL_SCORE && !deniedToolNames.has(item.tool.name))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = new Map<string, DesktopToolDescriptor>();
  for (const name of explicitToolNames) {
    if (deniedToolNames.has(name)) continue;
    const tool = descriptorsByName.get(name);
    if (tool) selected.set(name, tool);
  }
  for (const query of capabilityQueries) {
    const queryCorpus = query.toLowerCase();
    const queryMatches = input.toolDescriptors
      .map((tool, index) => ({ tool, index, score: workflowCompilerToolScore(tool, queryCorpus, explicitToolNames) }))
      .filter((item) => item.score >= WORKFLOW_COMPILER_MIN_SELECTED_TOOL_SCORE && !deniedToolNames.has(item.tool.name))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 4);
    for (const item of queryMatches) {
      if (selected.size >= maxTools) break;
      selected.set(item.tool.name, item.tool);
    }
  }
  for (const item of scored) {
    if (selected.size >= maxTools) break;
    selected.set(item.tool.name, item.tool);
  }
  addWorkflowCompilerToolCompanions(selected, descriptorsByName, explicitToolNames, deniedToolNames, maxTools);
  if (selected.size === 0) {
    for (const name of WORKFLOW_COMPILER_TOOL_FALLBACK_NAMES) {
      if (deniedToolNames.has(name)) continue;
      const tool = descriptorsByName.get(name);
      if (tool) selected.set(name, tool);
      if (selected.size >= Math.min(maxTools, 5)) break;
    }
  }
  return {
    selectedToolDescriptors: [...selected.values()],
    selectedToolNames: [...selected.keys()],
    availableToolCount: input.toolDescriptors.length,
  };
}

export function selectWorkflowCompilerConnectorDescriptors(input: WorkflowCompilerConnectorSelectionInput): WorkflowCompilerConnectorSelection {
  const connectors = input.connectorDescriptors ?? [];
  const maxConnectors = Math.max(0, Math.floor(input.maxConnectors ?? DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_LIMIT));
  const maxOperationsPerConnector = Math.max(1, Math.floor(input.maxOperationsPerConnector ?? DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_OPERATION_LIMIT));
  const availableOperationCount = connectors.reduce((sum, connector) => sum + connector.operations.length, 0);
  if (!connectors.length || maxConnectors === 0) {
    return {
      selectedConnectorDescriptors: [],
      selectedConnectorIds: [],
      selectedOperationCount: 0,
      availableConnectorCount: connectors.length,
      availableOperationCount,
    };
  }

  const explicitConnectorIds = workflowCompilerExplicitConnectorIds(input);
  const deniedConnectorIds = workflowCompilerDeniedConnectorIds(input);
  for (const connectorId of input.requiredConnectorIds ?? []) {
    if (!deniedConnectorIds.has(connectorId)) explicitConnectorIds.add(connectorId);
  }
  const corpus = workflowCompilerCapabilityCorpus(input);
  const scored = connectors
    .map((connector, index) => {
      const connectorScore = workflowCompilerConnectorScore(connector, corpus, explicitConnectorIds);
      const operations = workflowCompilerSelectedConnectorOperations({
        connector,
        connectorScore,
        corpus,
        explicit: explicitConnectorIds.has(connector.id),
        maxOperations: maxOperationsPerConnector,
      });
      const operationScore = operations.reduce((sum, item) => sum + item.score, 0);
      return { connector, index, connectorScore, operations, score: connectorScore + operationScore };
    })
    .filter((item) => !deniedConnectorIds.has(item.connector.id))
    .filter((item) => item.connectorScore >= WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_SCORE || item.operations.length > 0 || explicitConnectorIds.has(item.connector.id))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxConnectors);

  const selectedConnectorDescriptors = scored.map(({ connector, operations }) => ({
    ...connector,
    operations: operations.map((item) => item.operation),
  }));
  return {
    selectedConnectorDescriptors,
    selectedConnectorIds: selectedConnectorDescriptors.map((connector) => connector.id),
    selectedOperationCount: selectedConnectorDescriptors.reduce((sum, connector) => sum + connector.operations.length, 0),
    availableConnectorCount: connectors.length,
    availableOperationCount,
  };
}

function workflowCompilerExplicitToolNames(input: WorkflowCompilerToolSelectionInput): Set<string> {
  const names = new Set<string>();
  const exactToolNameCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  for (const tool of input.toolDescriptors) {
    if (new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(tool.name)}([^A-Za-z0-9_]|$)`, "i").test(exactToolNameCorpus)) {
      names.add(tool.name);
    }
  }
  for (const node of input.graphSnapshot?.nodes ?? []) {
    for (const toolName of node.toolNames ?? []) names.add(toolName);
  }
  const visit = (value: unknown, depth: number) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === "string")) {
        for (const item of value) names.add(item);
      }
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.tools)) visit(record.tools, depth + 1);
    if (record.recommendedManifest) visit(record.recommendedManifest, depth + 1);
    if (record.manifest) visit(record.manifest, depth + 1);
    if (record.capabilityManifest) visit(record.capabilityManifest, depth + 1);
    if (record.distillation) visit(record.distillation, depth + 1);
  };
  for (const trace of input.explorationTraces ?? []) {
    visit(trace.capabilityManifest, 0);
    visit(trace.distillation, 0);
  }
  return names;
}

function workflowCompilerDeniedToolNames(input: WorkflowCompilerToolSelectionInput): Set<string> {
  const denialCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  const denied = new Set<string>();
  for (const group of WORKFLOW_COMPILER_NEGATED_TOOL_GROUPS) {
    if (!group.patterns.some((pattern) => pattern.test(denialCorpus))) continue;
    for (const toolName of group.tools) denied.add(toolName);
  }
  for (const tool of input.toolDescriptors) {
    if (workflowCompilerToolNameIsDenied(denialCorpus, tool.name)) denied.add(tool.name);
  }
  return denied;
}

function workflowCompilerToolNameIsDenied(corpus: string, toolName: string): boolean {
  if (!corpus) return false;
  const escaped = escapeRegExp(toolName);
  const deniedBeforeTool = new RegExp(
    `\\b(?:do\\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\\b[^.;\\n]{0,120}\\b(?:use|using|call|calling|run|running|invoke|invoking)?\\s*${escaped}\\b`,
    "i",
  );
  return deniedBeforeTool.test(corpus);
}

function workflowCompilerIntentDeniedToolNames(input: WorkflowCompilerToolSelectionInput, explicitToolNames: Set<string>): Set<string> {
  const denied = new Set<string>();
  if (workflowCompilerExactWorkspaceFileReadOnlyIntent(input)) {
    for (const toolName of WORKFLOW_COMPILER_GOOGLE_TOOL_NAMES) denied.add(toolName);
    for (const toolName of WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES) denied.add(toolName);
    if (!explicitToolNames.has("local_directory_list")) denied.add("local_directory_list");
    if (!explicitToolNames.has("local_file_read")) denied.add("local_file_read");
  }
  if (!workflowCompilerHasVisualEvidenceIntent(input)) {
    for (const toolName of WORKFLOW_COMPILER_VISUAL_TOOL_NAMES) denied.add(toolName);
  }
  if (explicitToolNames.has("browser_search") && !workflowCompilerHasUserNamedAmbientCliIntent(input)) {
    for (const toolName of WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES) denied.add(toolName);
  }
  if (workflowCompilerHasPersonalAccountConnectorIntent(input) && !workflowCompilerHasUserNamedAmbientCliIntent(input)) {
    for (const toolName of WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES) denied.add(toolName);
  }
  if (workflowCompilerHasGoogleConnectorIntent(input) && !workflowCompilerHasUserNamedGoogleWorkspaceRawToolIntent(input)) {
    for (const toolName of WORKFLOW_COMPILER_GOOGLE_TOOL_NAMES) denied.add(toolName);
  }
  return denied;
}

function workflowCompilerExactWorkspaceFileReadOnlyIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  if (!workflowCompilerExactToolNameMention(userAuthoredCorpus, "file_read")) return false;
  const localFileSignal =
    /\bworkspace[-\s]?local\b/i.test(userAuthoredCorpus) ||
    /\brelative paths?\b/i.test(userAuthoredCorpus) ||
    /\bknown workspace\b/i.test(userAuthoredCorpus) ||
    /\bdogfood-notes\/[^\s]+\.md\b/i.test(userAuthoredCorpus);
  if (!localFileSignal) return false;
  const deniesAlternateDiscovery =
    /\b(?:do\s+not|don't|dont|without|no|avoid|exclude|skip)\b[^;\n]{0,200}\b(?:workspace\.inventory|browser|search|connector listing|connectors?|google|gmail|drive|ambient\s+cli)\b/i.test(
      userAuthoredCorpus,
    ) ||
    /\b(?:workspace\.inventory|browser|search|connector listing|connectors?|google|gmail|drive|ambient\s+cli)\b[^;\n]{0,120}\b(?:forbidden|disallowed|not allowed)\b/i.test(
      userAuthoredCorpus,
    );
  return deniesAlternateDiscovery;
}

function workflowCompilerHasUserNamedAmbientCliIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  if (/\bambient\s+cli\b/i.test(userAuthoredCorpus)) return true;
  return [...WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES].some((toolName) =>
    new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(toolName)}([^A-Za-z0-9_]|$)`, "i").test(userAuthoredCorpus),
  );
}

function workflowCompilerHasPersonalAccountConnectorIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  return WORKFLOW_COMPILER_FIRST_PARTY_CONNECTOR_INTENT_PATTERNS.some((pattern) => pattern.test(userAuthoredCorpus));
}

function workflowCompilerHasGoogleConnectorIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  return WORKFLOW_COMPILER_GOOGLE_CONNECTOR_INTENT_PATTERNS.some((pattern) => pattern.test(userAuthoredCorpus));
}

function workflowCompilerHasUserNamedGoogleWorkspaceRawToolIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  if (/\bgoogle_workspace_(?:install_gws|start_login|validate_account|cancel_setup|status|call|materialize_file|search_methods)\b/i.test(userAuthoredCorpus)) {
    return true;
  }
  return /\b(?:raw\s+google\s+workspace|google\s+workspace\s+raw)\s+tools?\b/i.test(userAuthoredCorpus);
}

function workflowCompilerHasVisualEvidenceIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const discovery = (input.discoveryQuestions ?? [])
    .map((question) => [question.answer?.choiceId, question.answer?.freeform].filter(Boolean).join(" "))
    .join(" ");
  const graph = input.graphSnapshot
    ? input.graphSnapshot.nodes
        .map((node) =>
          [
            node.id,
            node.type,
            node.label,
            node.description,
            node.modelRole,
            node.dataSummary,
            node.inputSummary,
            node.outputSummary,
            node.toolNames?.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ")
    : "";
  const intentCorpus = [input.userRequest, input.workspaceSummary, discovery, graph].filter(Boolean).join("\n");
  return WORKFLOW_COMPILER_VISUAL_EVIDENCE_INTENT_PATTERNS.some((pattern) => pattern.test(intentCorpus));
}

function workflowCompilerHasVisualProviderSetupIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const discovery = (input.discoveryQuestions ?? [])
    .map((question) => [question.answer?.choiceId, question.answer?.freeform].filter(Boolean).join(" "))
    .join(" ");
  const graph = input.graphSnapshot
    ? input.graphSnapshot.nodes
        .map((node) =>
          [
            node.id,
            node.type,
            node.label,
            node.description,
            node.modelRole,
            node.dataSummary,
            node.inputSummary,
            node.outputSummary,
            node.toolNames?.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ")
    : "";
  const intentCorpus = [input.userRequest, input.workspaceSummary, discovery, graph].filter(Boolean).join("\n");
  return WORKFLOW_COMPILER_VISUAL_PROVIDER_SETUP_INTENT_PATTERNS.some((pattern) => pattern.test(intentCorpus));
}

function workflowCompilerExplicitConnectorIds(input: WorkflowCompilerConnectorSelectionInput): Set<string> {
  const ids = new Set<string>();
  for (const node of input.graphSnapshot?.nodes ?? []) {
    for (const connectorId of node.connectorIds ?? []) ids.add(connectorId);
  }
  const visit = (value: unknown, depth: number) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const connectorId = record.connectorId ?? record.id;
    if (typeof connectorId === "string" && connectorId.includes(".")) ids.add(connectorId);
    if (Array.isArray(record.connectors)) {
      for (const connector of record.connectors) {
        if (typeof connector === "string") ids.add(connector);
        else visit(connector, depth + 1);
      }
    }
    if (record.recommendedManifest) visit(record.recommendedManifest, depth + 1);
    if (record.manifest) visit(record.manifest, depth + 1);
    if (record.capabilityManifest) visit(record.capabilityManifest, depth + 1);
    if (record.distillation) visit(record.distillation, depth + 1);
  };
  for (const trace of input.explorationTraces ?? []) {
    visit(trace.capabilityManifest, 0);
    visit(trace.distillation, 0);
  }
  return ids;
}

export function workflowCompilerDeniedConnectorIds(input: WorkflowCompilerConnectorSelectionInput): Set<string> {
  const corpus = [input.userRequest, input.workspaceSummary, ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? "")]
    .filter(Boolean)
    .join("\n");
  const explicitGoogleConnectorUse =
    /\bconnector(?:\.(?:paginate|map))?\b[^\n]{0,180}\b(?:connectorId\s+)?google\.(?:gmail|calendar|drive)\b/i.test(corpus) ||
    /\b(?:connectorId|connector\s+id)\s+google\.(?:gmail|calendar|drive)\b/i.test(corpus) ||
    /\buse\b[^\n]{0,160}\bgoogle\s+(?:gmail|calendar|drive)\b/i.test(corpus);
  const deniesOnlyGoogleWorkspaceRawTools =
    /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip)\b[^\n]{0,120}\bgoogle\s+workspace\s+raw\s+tools?\b/i.test(corpus);
  const ids = new Set<string>();
  const denyGoogleWorkspace =
    (!explicitGoogleConnectorUse || !deniesOnlyGoogleWorkspaceRawTools) &&
    (/\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n]{0,120}\b(?:google\s+workspace|google tools?|google connectors?|google\s+workspace\s+tools\/connectors|gmail|google\s+mail|google\s+drive|calendar|docs|sheets|slides)\b/i.test(corpus) ||
      /\b(?:google\s+workspace|google tools?|google connectors?|gmail|google\s+mail|google\s+drive|calendar|docs|sheets|slides)\b[^\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i.test(corpus));
  if (denyGoogleWorkspace) {
    ids.add("google.gmail");
    ids.add("google.calendar");
    ids.add("google.drive");
  }
  const denyWorkspaceInventory =
    /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n]{0,120}\bworkspace[\s.]inventory\b/i.test(corpus) ||
    /\bworkspace[\s.]inventory\b[^\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i.test(corpus);
  if (denyWorkspaceInventory) {
    ids.add("workspace.inventory");
  }
  if (workflowCompilerExactLocalDirectoryListIntent(workflowCompilerCapabilityCorpus(input))) {
    ids.add("workspace.inventory");
  }
  return ids;
}

function workflowCompilerCapabilityCorpus(input: WorkflowCompilerToolSelectionInput | WorkflowCompilerConnectorSelectionInput): string {
  const discovery = (input.discoveryQuestions ?? [])
    .map((question) => [
      question.category,
      question.context,
      question.question,
      question.answer?.choiceId,
      question.answer?.freeform,
      question.graphImpact,
    ].filter(Boolean).join(" "))
    .join(" ");
  const traces = (input.explorationTraces ?? [])
    .map((trace) => [
      trace.request,
      JSON.stringify(trace.capabilityManifest ?? {}),
      JSON.stringify(trace.distillation ?? {}),
      JSON.stringify(trace.observations ?? []),
    ].filter(Boolean).join(" "))
    .join(" ");
  const graph = input.graphSnapshot
    ? input.graphSnapshot.nodes
        .map((node) => [
          node.id,
          node.type,
          node.label,
          node.description,
          node.modelRole,
          node.dataSummary,
          node.inputSummary,
          node.outputSummary,
          node.toolNames?.join(" "),
          node.connectorIds?.join(" "),
        ].filter(Boolean).join(" "))
        .join(" ")
    : "";
  return [input.userRequest, input.workspaceSummary, ...(input.capabilityQueries ?? []), discovery, traces, graph].filter(Boolean).join("\n").toLowerCase();
}

function workflowCompilerExactLocalDirectoryListIntent(corpus: string): boolean {
  return (
    /\blocal_directory_list\b/i.test(corpus) ||
    /\b(?:downloads?|desktop|documents)\b[^\n]{0,120}\b(?:folder|directory|inventory|categor(?:ize|isation|ization)|classif(?:y|ication)|metadata)\b/i.test(corpus) ||
    /\b(?:folder|directory|inventory|categor(?:ize|isation|ization)|classif(?:y|ication)|metadata)\b[^\n]{0,120}\b(?:downloads?|desktop|documents)\b/i.test(corpus)
  );
}

function workflowCompilerExactToolNameMention(corpus: string, toolName: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(toolName)}([^A-Za-z0-9_]|$)`, "i").test(corpus);
}

function workflowCompilerToolScore(tool: DesktopToolDescriptor, corpus: string, explicitToolNames: Set<string>): number {
  let score = explicitToolNames.has(tool.name) ? 120 : 0;
  const searchable = `${tool.name} ${tool.label} ${tool.description} ${tool.permissionScope}`.toLowerCase();
  const ignoredTokens = WORKFLOW_COMPILER_TOOL_SEARCH_TOKEN_IGNORES[tool.name] ?? new Set<string>();
  for (const token of searchable.split(/[^a-z0-9_]+/).filter((part) => part.length >= 4)) {
    if (ignoredTokens.has(token)) continue;
    if (corpus.includes(token)) score += tool.name === token ? 18 : 2;
  }
  for (const hint of WORKFLOW_COMPILER_TOOL_HINTS[tool.name] ?? []) {
    if (hint.test(corpus)) score += 45;
  }
  if (tool.source === "plugin-mcp" && score > 0) score += 12;
  return score;
}

function addWorkflowCompilerToolCompanions(
  selected: Map<string, DesktopToolDescriptor>,
  descriptorsByName: Map<string, DesktopToolDescriptor>,
  explicitToolNames: Set<string>,
  deniedToolNames: Set<string>,
  maxTools: number,
): void {
  const companions = new Set<string>();
  for (const selectedToolName of selected.keys()) {
    for (const companion of WORKFLOW_COMPILER_TOOL_COMPANIONS[selectedToolName] ?? []) companions.add(companion);
  }
  for (const companion of companions) {
    if (selected.has(companion)) continue;
    if (deniedToolNames.has(companion)) continue;
    const descriptor = descriptorsByName.get(companion);
    if (!descriptor) continue;
    if (selected.size >= maxTools) {
      const removable = [...selected.keys()]
        .reverse()
        .find((toolName) => !explicitToolNames.has(toolName) && !WORKFLOW_COMPILER_BROWSER_SOURCE_TOOLS.has(toolName));
      if (!removable) continue;
      selected.delete(removable);
    }
    selected.set(companion, descriptor);
  }
}

function workflowCompilerConnectorScore(connector: WorkflowConnectorDescriptor, corpus: string, explicitConnectorIds: Set<string>): number {
  let score = explicitConnectorIds.has(connector.id) ? 160 : 0;
  const searchable = `${connector.id} ${connector.label} ${connector.description} ${connector.auth.providerId ?? ""}`.toLowerCase();
  for (const token of searchable.split(/[^a-z0-9_.-]+/).filter((part) => part.length >= 4)) {
    if (corpus.includes(token)) score += connector.id.toLowerCase() === token ? 24 : 3;
  }
  return score;
}

function workflowCompilerSelectedConnectorOperations(input: {
  connector: WorkflowConnectorDescriptor;
  connectorScore: number;
  corpus: string;
  explicit: boolean;
  maxOperations: number;
}): Array<{ operation: WorkflowConnectorDescriptor["operations"][number]; score: number; index: number }> {
  const scored = input.connector.operations
    .map((operation, index) => ({
      operation,
      index,
      score: workflowCompilerConnectorOperationScore(input.connector, operation, input.corpus, input.connectorScore, input.explicit),
    }))
    .filter((item) => item.score >= WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_OPERATION_SCORE || input.explicit)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  if (scored.length > 0) return scored.slice(0, input.maxOperations);
  if (input.connectorScore < WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_SCORE) return [];
  return input.connector.operations
    .map((operation, index) => ({ operation, index, score: input.connectorScore }))
    .sort((left, right) => {
      const leftRead = left.operation.sideEffects === "none" || left.operation.sideEffects === "read_personal_data";
      const rightRead = right.operation.sideEffects === "none" || right.operation.sideEffects === "read_personal_data";
      if (leftRead !== rightRead) return leftRead ? -1 : 1;
      return left.index - right.index;
    })
    .slice(0, input.maxOperations);
}

function workflowCompilerConnectorOperationScore(
  connector: WorkflowConnectorDescriptor,
  operation: WorkflowConnectorDescriptor["operations"][number],
  corpus: string,
  connectorScore: number,
  explicitConnector: boolean,
): number {
  let score = explicitConnector ? 80 : Math.min(20, connectorScore);
  const searchable = `${connector.id} ${operation.name} ${operation.label} ${operation.description} ${operation.requiredScopes.join(" ")}`.toLowerCase();
  for (const token of searchable.split(/[^a-z0-9_.-]+/).filter((part) => part.length >= 4)) {
    if (corpus.includes(token)) score += operation.name.toLowerCase() === token ? 24 : 3;
  }
  if (operation.sideEffects === "read_personal_data" && /\b(read|list|get|search|find|summarize|brief|agenda|drive|calendar|gmail|docs|sheets|slides)\b/i.test(corpus)) {
    score += 18;
  }
  if (operation.sideEffects === "write_external" && /\b(write|send|create|update|delete|share|invite|post|mutate)\b/i.test(corpus)) score += 18;
  if (operation.supportsDryRun) score += 2;
  return score;
}

export function buildWorkflowCompilerCapabilityDiscoveryPrompt(input: {
  userRequest: string;
  workspaceSummary?: string;
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
}): string {
  return [
    "You are helping the Ambient Desktop workflow compiler discover the minimal capabilities needed before source generation.",
    "Return only JSON with: queries, requiredToolNames, requiredConnectorIds, openQuestions.",
    "Do not generate the workflow artifact or source code in this phase.",
    "",
    "The runtime will execute your search queries against safe capability metadata, then provide only selected tool and connector descriptors to the final compiler.",
    "Use broad capability search queries such as web research, browser page content, file write, PDF/report rendering, Gmail search, Calendar read, Drive read, Slack read, shell command, or installed Ambient CLI command.",
    "If you know an exact built-in tool name from prior context, include it in requiredToolNames. If you know an exact connector id from prior graph/context, include it in requiredConnectorIds. Otherwise prefer queries.",
    "Exact local tool rule: if the request or discovery answers name local_directory_list, include local_directory_list in requiredToolNames and do not replace it with workspace.inventory unless the user explicitly asks for workspace inventory.",
    "Return at most 6 queries, 8 requiredToolNames, and 4 requiredConnectorIds.",
    "",
    "Available built-in tool name hints: file_read, file_write, local_directory_list, local_file_read, bash, browser_search, browser_nav, browser_content, browser_login, browser_pick, browser_screenshot, ambient_cli, long_context_process, ambient_visual_analyze, ambient_visual_minicpm_setup.",
    "",
    "Workflow discovery answers:",
    workflowDiscoveryPromptSection(input.discoveryQuestions),
    "",
    "Workflow exploration traces:",
    workflowExplorationPromptSection(input.explorationTraces),
    "",
    "Current workflow graph IR:",
    workflowGraphPromptSection(input.graphSnapshot),
    "",
    "Workspace summary:",
    input.workspaceSummary?.trim() || "No workspace summary provided.",
    "",
    "User request:",
    input.userRequest,
  ].join("\n");
}

export function validateWorkflowCompilerCapabilityDiscoveryOutput(raw: unknown): WorkflowCompilerCapabilityDiscoveryPlan {
  const parsed = workflowCompilerCapabilityDiscoverySchema.parse(raw);
  return {
    queries: parsed.queries.map((item) => ({
      query: item.query.replace(/\s+/g, " ").trim(),
      ...(item.reason?.trim() ? { reason: item.reason.replace(/\s+/g, " ").trim() } : {}),
    })),
    requiredToolNames: [...new Set(parsed.requiredToolNames.map((name) => name.trim()).filter(Boolean))],
    requiredConnectorIds: [...new Set(parsed.requiredConnectorIds.map((id) => id.trim()).filter(Boolean))],
    openQuestions: parsed.openQuestions.map((question) => question.replace(/\s+/g, " ").trim()).filter(Boolean),
  };
}

function normalizeWorkflowGraphNodeType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    input: "request",
    trigger: "request",
    user_request: "request",
    source: "data_source",
    data: "data_source",
    file_source: "data_source",
    web_source: "data_source",
    browser_source: "data_source",
    step: "deterministic_step",
    task: "deterministic_step",
    action: "deterministic_step",
    tool: "deterministic_step",
    tool_call: "deterministic_step",
    browser: "deterministic_step",
    browser_action: "deterministic_step",
    browser_call: "deterministic_step",
    exploration: "agent_exploration",
    exploratory_agent: "agent_exploration",
    agent: "agent_exploration",
    agentic: "agent_exploration",
    agent_node: "agent_exploration",
    agent_run: "agent_exploration",
    llm: "model_call",
    llm_call: "model_call",
    model: "model_call",
    ambient: "model_call",
    ambient_call: "model_call",
    ambient_model_call: "model_call",
    ai_call: "model_call",
    connector: "connector_call",
    mcp_call: "connector_call",
    plugin_call: "connector_call",
    review: "review_gate",
    approval: "review_gate",
    approval_gate: "review_gate",
    human_review: "review_gate",
    write: "mutation",
    side_effect: "mutation",
    side_effect_step: "mutation",
    report: "output",
    result: "output",
    final_output: "output",
    error: "error_handler",
    failure_handler: "error_handler",
  };
  return aliases[normalized] ?? normalized;
}

function normalizeWorkflowGraphEdgeType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    data: "data_flow",
    dataflow: "data_flow",
    control: "control_flow",
    sequence: "control_flow",
    dependency: "control_flow",
    depends_on: "control_flow",
    conditional: "condition",
    branch: "condition",
    decision: "condition",
    retry_flow: "retry",
    resume_flow: "resume",
  };
  return aliases[normalized] ?? normalized;
}

export function validateWorkflowCompilerOutput(
  raw: unknown,
  toolDescriptors: DesktopToolDescriptor[],
  connectorDescriptors: WorkflowConnectorDescriptor[] = [],
): ValidatedWorkflowCompilerOutput {
  const output = compilerOutputSchema.parse(raw);
  const allowedTools = new Set([...toolDescriptors.map((tool) => tool.name), ...ambientToolNames]);

  for (const toolName of output.manifest.tools) {
    if (!allowedTools.has(toolName)) throw new Error(`Compiler output declares unavailable tool: ${toolName}`);
  }
  validateWorkflowPluginCapabilities(output.manifest);
  validateWorkflowAmbientCliCapabilities(output.manifest);
  validateWorkflowGoogleWorkspaceMethodGrants(output.manifest);
  validateWorkflowConnectorManifest(output.manifest, connectorDescriptors);
  validateWorkflowMutationPolicyAlignment(output.source, output.manifest, output.graph, connectorDescriptors);

  validateWorkflowSourceReferences(output.source, output.manifest);
  validateWorkflowSourceConnectorReferences(output.source, output.manifest, connectorDescriptors);
  validateWorkflowSourceGoogleWorkspaceReferences(output.source, output.manifest);
  if (output.graph) {
    validateWorkflowGraphOutput(output.graph, output.manifest);
    validateWorkflowSourceGraphMappings(output.source, output.graph);
  }

  return {
    output,
    toolNames: output.manifest.tools,
  };
}

export function validateWorkflowGraphOutput(
  graph: NonNullable<WorkflowCompilerOutput["graph"]>,
  manifest: WorkflowManifest,
): void {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) throw new Error(`Compiler output graph declares duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    for (const toolName of node.toolNames ?? []) {
      if (!manifest.tools.includes(toolName)) throw new Error(`Compiler output graph node ${node.id} references undeclared tool: ${toolName}`);
    }
    for (const connectorId of node.connectorIds ?? []) {
      if (!manifest.connectors?.some((connector) => connector.connectorId === connectorId)) {
        throw new Error(`Compiler output graph node ${node.id} references undeclared connector: ${connectorId}`);
      }
    }
    if (node.type === "model_call") {
      if (!manifest.tools.includes("ambient.responses")) throw new Error(`Compiler output graph node ${node.id} requires undeclared tool: ambient.responses`);
      if (!node.modelRole?.trim()) throw new Error(`Compiler output graph model node ${node.id} is missing modelRole`);
      if (!node.inputSummary?.trim()) throw new Error(`Compiler output graph model node ${node.id} is missing inputSummary`);
      if (!node.outputSummary?.trim()) throw new Error(`Compiler output graph model node ${node.id} is missing outputSummary`);
      if (!node.retryPolicy?.trim()) throw new Error(`Compiler output graph model node ${node.id} is missing retryPolicy`);
    }
    if (node.type === "connector_call" && !node.connectorIds?.length) {
      throw new Error(`Compiler output graph connector node ${node.id} is missing connectorIds`);
    }
    if (node.type === "mutation" && manifest.mutationPolicy === "read_only") {
      throw new Error(`Compiler output graph mutation node ${node.id} requires a non-read-only mutation policy`);
    }
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) throw new Error(`Compiler output graph edge ${edge.id} references missing source node: ${edge.source}`);
    if (!nodeIds.has(edge.target)) throw new Error(`Compiler output graph edge ${edge.id} references missing target node: ${edge.target}`);
  }
}

export function validateWorkflowSourceGraphMappings(
  source: string,
  graph: Pick<NonNullable<WorkflowCompilerOutput["graph"]>, "nodes">,
): void {
  if (!graph) return;
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const mappings = workflowSourceGraphMappings(source);

  for (const nodeId of mappings.allNodeIds) {
    if (!graphNodeIds.has(nodeId)) {
      throw new Error(`Compiler output source maps to unknown graph node id: ${nodeId}`);
    }
  }

  for (const node of graph.nodes) {
    if (node.type === "model_call" && !mappings.modelCallNodeIds.has(node.id)) {
      throw new Error(`Compiler output graph model node ${node.id} is not mapped to generated source with ambient.call nodeId metadata`);
    }
    if (node.type === "connector_call") {
      const connectorIds = mappings.connectorCallNodeIds.get(node.id);
      if (!connectorIds) {
        throw new Error(`Compiler output graph connector node ${node.id} is not mapped to generated source with connectors.call nodeId metadata`);
      }
      if (node.connectorIds?.length && !node.connectorIds.some((connectorId) => connectorIds.has(connectorId))) {
        throw new Error(`Compiler output graph connector node ${node.id} maps to source calls for different connector ids`);
      }
    }
    if (node.type === "review_gate" && !mappings.reviewGateNodeIds.has(node.id)) {
      throw new Error(
        `Compiler output graph review gate node ${node.id} is not mapped to generated source with workflow.requireApproval or workflow.askUser nodeId metadata`,
      );
    }
    if (node.type === "mutation" && !mappings.mutationNodeIds.has(node.id)) {
      throw new Error(`Compiler output graph mutation node ${node.id} is not mapped to generated source with workflow.stageMutation nodeId metadata`);
    }
  }
}

export function workflowGraphWithSourceMappings<T extends Pick<NonNullable<WorkflowCompilerOutput["graph"]>, "nodes">>(source: string, graph: T): T {
  const mappings = workflowSourceGraphMappings(source);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      sourceRanges: mappings.sourceRangesByNodeId.get(node.id) ?? node.sourceRanges,
    })),
  };
}

export function canonicalizeWorkflowGraphLayout<T extends { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] }>(graph: T): T {
  const ranks = workflowGraphCanonicalRanks(graph.nodes, graph.edges);
  const originalIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const columns = new Map<number, WorkflowGraphNode[]>();
  for (const node of graph.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    columns.set(rank, [...(columns.get(rank) ?? []), node]);
  }
  for (const [rank, nodes] of columns) {
    columns.set(
      rank,
      [...nodes].sort(
        (left, right) =>
          WORKFLOW_GRAPH_NODE_TYPE_LAYOUT_PRIORITY[left.type] - WORKFLOW_GRAPH_NODE_TYPE_LAYOUT_PRIORITY[right.type] ||
          (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0) ||
          left.id.localeCompare(right.id),
      ),
    );
  }
  const rowByNodeId = new Map<string, number>();
  for (const [rank, nodes] of [...columns.entries()].sort((left, right) => left[0] - right[0])) {
    nodes.forEach((node, row) => rowByNodeId.set(node.id, row));
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      x: (ranks.get(node.id) ?? 0) * WORKFLOW_GRAPH_CANONICAL_COLUMN_GAP,
      y: (rowByNodeId.get(node.id) ?? 0) * WORKFLOW_GRAPH_CANONICAL_ROW_GAP,
      width: WORKFLOW_GRAPH_CANONICAL_NODE_WIDTH,
      height: WORKFLOW_GRAPH_CANONICAL_NODE_HEIGHT,
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

function workflowGraphCanonicalRanks(nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const ranks = new Map(nodes.map((node) => [node.id, 0]));
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const ready = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const visited = new Set<string>();
  while (ready.length > 0) {
    ready.sort((left, right) => (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0) || left.localeCompare(right));
    const nodeId = ready.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, (ranks.get(nodeId) ?? 0) + 1));
      incomingCount.set(target, Math.max(0, (incomingCount.get(target) ?? 0) - 1));
      if ((incomingCount.get(target) ?? 0) === 0) ready.push(target);
    }
  }

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const predecessorRanks = edges
      .filter((edge) => edge.target === node.id && edge.source !== node.id && ranks.has(edge.source))
      .map((edge) => ranks.get(edge.source) ?? 0);
    ranks.set(node.id, predecessorRanks.length ? Math.max(...predecessorRanks) + 1 : Math.floor((originalIndex.get(node.id) ?? 0) / 2));
  }

  return ranks;
}

function workflowDiscoveryPromptSection(questions: WorkflowDiscoveryQuestion[] | undefined): string {
  const answered = (questions ?? []).filter((question) => question.answer);
  if (answered.length === 0) return "No answered workflow discovery questions were provided.";
  return answered
    .map((question, index) => {
      const selectedChoice = question.answer?.choiceId ? question.choices.find((choice) => choice.id === question.answer?.choiceId) : undefined;
      return [
        `${index + 1}. [${question.category}] ${question.question}`,
        `   context: ${question.context}`,
        selectedChoice ? `   selected: ${selectedChoice.label} - ${selectedChoice.description}` : undefined,
        question.answer?.freeform ? `   freeform: ${question.answer.freeform}` : undefined,
        question.graphImpact ? `   graph impact: ${question.graphImpact}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    })
    .join("\n");
}

function workflowExplorationPromptSection(traces: WorkflowExplorationTraceSummary[] | undefined): string {
  if (!traces?.length) return "No workflow exploration traces were provided.";
  return JSON.stringify(
    traces.slice(0, 3).map((trace) => ({
      id: trace.id,
      explorationId: trace.explorationId,
      explorationNodeId: trace.explorationNodeId,
      request: trace.request,
      model: trace.model,
      observationCount: trace.observations.length,
      observations: trace.observations,
      distillation: trace.distillation,
      createdAt: trace.createdAt,
    })),
    null,
    2,
  );
}

export function workflowAmbientCliCapabilitiesFromSearch(
  response: AmbientCliCapabilitySearchResponse,
): WorkflowCompilerAmbientCliCapability[] {
  return response.results.flatMap((result) =>
    result.commands.map((command) => ({
      capabilityId: command.capabilityId,
      registryPluginId: result.registryPluginId,
      packageId: result.packageId,
      packageName: result.packageName,
      command: command.name,
      ...(command.description ? { description: command.description } : {}),
      availability: result.availability,
      risk: command.risk,
      missingEnv: result.missingEnv,
      whyMatched: result.whyMatched,
    })),
  );
}

function workflowGraphPromptSection(snapshot: WorkflowGraphSnapshot | undefined): string {
  if (!snapshot) return "No workflow graph snapshot was provided. Emit a graph derived from the request and validated output.";
  return JSON.stringify(
    {
      id: snapshot.id,
      version: snapshot.version,
      source: snapshot.source,
      summary: snapshot.summary,
      nodes: snapshot.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        description: node.description,
        modelRole: node.modelRole,
        dataSummary: node.dataSummary,
        inputSummary: node.inputSummary,
        outputSummary: node.outputSummary,
        toolNames: node.toolNames,
        connectorIds: node.connectorIds,
        retryPolicy: node.retryPolicy,
        retentionPolicy: node.retentionPolicy,
        reviewPolicy: node.reviewPolicy,
      })),
      edges: snapshot.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        label: edge.label,
        dataSummary: edge.dataSummary,
      })),
    },
    null,
    2,
  );
}

function validateWorkflowPluginCapabilities(manifest: WorkflowManifest): void {
  const seen = new Set<string>();
  for (const grant of manifest.pluginCapabilities ?? []) {
    if (!manifest.tools.includes(grant.registeredName)) {
      throw new Error(`Compiler output declares plugin capability for undeclared tool: ${grant.registeredName}`);
    }
    if (seen.has(grant.registeredName)) {
      throw new Error(`Compiler output declares duplicate plugin capability: ${grant.registeredName}`);
    }
    seen.add(grant.registeredName);
  }
}

function validateWorkflowAmbientCliCapabilities(manifest: WorkflowManifest): void {
  const grants = manifest.ambientCliCapabilities ?? [];
  if (grants.length > 0 && !manifest.tools.includes("ambient_cli")) {
    throw new Error("Compiler output declares Ambient CLI capabilities without declaring tool: ambient_cli");
  }
  const seen = new Set<string>();
  for (const grant of grants) {
    if (seen.has(grant.capabilityId)) {
      throw new Error(`Compiler output declares duplicate Ambient CLI capability: ${grant.capabilityId}`);
    }
    seen.add(grant.capabilityId);
    const expectedSuffix = `:tool:${grant.command}`;
    if (!grant.capabilityId.endsWith(expectedSuffix)) {
      throw new Error(`Compiler output Ambient CLI capability does not match command ${grant.command}: ${grant.capabilityId}`);
    }
  }
}

function validateWorkflowGoogleWorkspaceMethodGrants(manifest: WorkflowManifest): void {
  const grants = manifest.googleWorkspaceMethods ?? [];
  if (grants.length > 0 && !manifest.tools.includes("google_workspace_call")) {
    throw new Error("Compiler output declares Google Workspace method grants without declaring tool: google_workspace_call");
  }
  const seen = new Set<string>();
  for (const grant of grants) {
    const key = `${grant.accountHint ?? ""}\0${grant.accountProvenance}\0${grant.methodId}`;
    if (seen.has(key)) {
      throw new Error(`Compiler output declares duplicate Google Workspace method grant: ${grant.methodId}`);
    }
    seen.add(key);
    if (grant.accountProvenance === "literal" && !grant.accountHint?.trim()) {
      throw new Error(`Compiler output Google Workspace method grant ${grant.methodId} declares literal account provenance without accountHint`);
    }
    if (!grant.scopes.length) {
      throw new Error(`Compiler output Google Workspace method grant ${grant.methodId} is missing scopes`);
    }
    if (grant.sideEffect !== "metadata_read" && grant.sideEffect !== "personal_content_read") {
      throw new Error(`Compiler output Google Workspace method grant ${grant.methodId} is not read-only: ${grant.sideEffect}`);
    }
  }
}

function validateWorkflowMutationPolicyAlignment(
  source: string,
  manifest: WorkflowManifest,
  graph: WorkflowCompilerOutput["graph"] | undefined,
  connectorDescriptors: WorkflowConnectorDescriptor[],
): void {
  if (manifest.mutationPolicy === "read_only") return;
  const sourceStagesMutation = sourceCallArguments(source, "workflow", "stageMutation").length > 0;
  const graphHasMutation = graph?.nodes.some((node) => node.type === "mutation") ?? false;
  const grantWritesExternally = (manifest.connectors ?? []).some((grant) => {
    const descriptor = connectorDescriptors.find((candidate) => candidate.id === grant.connectorId);
    return grant.operations.some((operationName) => descriptor?.operations.find((operation) => operation.name === operationName)?.sideEffects === "write_external");
  });
  if (!sourceStagesMutation && !graphHasMutation && !grantWritesExternally) {
    throw new Error("Compiler output uses a non-read-only mutation policy without a staged mutation or write connector operation.");
  }
}

export function validateWorkflowSourceReferences(source: string, manifest: WorkflowManifest): void {
  validateWorkflowSourceIsolation(source);
  validateWorkflowPrimitiveReferences(source);
  validateWorkflowRuntimeInputResumeSafety(source, manifest);
  validateWorkflowStageMutationResumeSafety(source, manifest);
  validateWorkflowFileReadResultContract(source);
  if (sourceUsesAmbientCall(source) && !manifest.tools.includes("ambient.responses")) {
    throw new Error("Compiler output source references undeclared Ambient call tool: ambient.responses");
  }
  if (/\bambient\s*\[\s*(?!["']call["']\s*\])/.test(source)) {
    throw new Error("Compiler output source uses dynamic Ambient SDK reference.");
  }
  validateWorkflowSourceAmbientReferences(source);
  for (const toolName of sourceToolReferences(source)) {
    if (!manifest.tools.includes(toolName)) {
      throw new Error(`Compiler output source references undeclared tool: ${toolName}`);
    }
  }
  validateWorkflowSourceAmbientCliReferences(source, manifest);
}

function validateWorkflowRuntimeInputResumeSafety(source: string, manifest: WorkflowManifest): void {
  const askUserCalls = sourceCallArguments(source, "workflow", "askUser");
  if (askUserCalls.length === 0) return;

  const resumePointCalls = workflowResumeProtectedCalls(source);
  const expensiveCalls = workflowExpensiveSourceCalls(source, manifest);

  for (const askUserCall of askUserCalls) {
    const unprotectedPriorCall = expensiveCalls.find((call) => call.end < askUserCall.start && !hasResumePointForPriorCall(resumePointCalls, call, askUserCall.start));
    if (unprotectedPriorCall) {
      throw new Error(
        `Compiler output uses workflow.askUser after ${unprotectedPriorCall.label} without wrapping that prior work in workflow.resumePoint. Put every model/connector/tool read that can run before the prompt inside workflow.resumePoint so resumed runs do not repeat the work or change the prompt data.`,
      );
    }
  }
}

function validateWorkflowStageMutationResumeSafety(source: string, manifest: WorkflowManifest): void {
  const stageMutationCalls = sourceCallArguments(source, "workflow", "stageMutation");
  if (stageMutationCalls.length === 0) return;

  const resumePointCalls = workflowResumeProtectedCalls(source);
  const expensiveCalls = workflowExpensiveSourceCalls(source, manifest);

  for (const stageMutationCall of stageMutationCalls) {
    const unprotectedPriorCall = expensiveCalls.find((call) => call.end < stageMutationCall.start && !hasResumePointForPriorCall(resumePointCalls, call, stageMutationCall.start));
    if (unprotectedPriorCall) {
      throw new Error(
        `Compiler output uses workflow.stageMutation after ${unprotectedPriorCall.label} without wrapping that prior work in workflow.resumePoint. Put every model/connector/tool read that can run before the mutation approval inside workflow.resumePoint so resumed runs do not repeat the work or change the mutation payload.`,
      );
    }
  }
}

function validateWorkflowFileReadResultContract(source: string): void {
  for (const toolName of ["file_read", "local_file_read"]) {
    const fileReadCalls = sourceCallArguments(source, "tools", toolName);
    for (const call of fileReadCalls) {
      const priorSource = source.slice(Math.max(0, call.start - 80), call.start);
      const variableMatch = priorSource.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s*)?$/);
      if (!variableMatch) continue;
      const variableName = variableMatch[1];
      const afterCall = source.slice(call.end, Math.min(source.length, call.end + 900));
      const rawStringRejection = new RegExp(`typeof\\s+${escapeRegExp(variableName)}\\s*!==\\s*["']string["']`);
      if (rawStringRejection.test(afterCall)) {
        throw new Error(
          `Compiler output treats tools.${toolName} result ${variableName} as a raw string. tools.${toolName} returns { path, content, truncated, kind }; read ${variableName}.content after validating it is a string.`,
        );
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function workflowExpensiveSourceCalls(source: string, manifest: WorkflowManifest): Array<SourceCallArguments & { label: string }> {
  const expensiveCalls: Array<SourceCallArguments & { label: string }> = [
    ...sourceCallArguments(source, "ambient", "call").map((call) => ({ ...call, label: "ambient.call" })),
    ...sourceCallArguments(source, "connectors", "call").map((call) => ({ ...call, label: "connectors.call" })),
  ];
  for (const toolName of manifest.tools) {
    if (toolName === "ambient.responses") continue;
    if (!/^[A-Za-z_$][\w$]*$/.test(toolName)) continue;
    expensiveCalls.push(...sourceCallArguments(source, "tools", toolName).map((call) => ({ ...call, label: `tools.${toolName}` })));
  }
  return expensiveCalls.sort((left, right) => left.end - right.end);
}

function workflowResumeProtectedCalls(source: string): SourceCallArguments[] {
  return [
    ...sourceCallArguments(source, "workflow", "resumePoint"),
    ...sourceCallArguments(source, "workflow", "paginateTool"),
    ...sourceCallArguments(source, "workflow", "paginateConnector"),
    ...sourceCallArguments(source, "workflow", "mapModel"),
    ...sourceCallArguments(source, "workflow", "reduceModel"),
  ];
}

function hasResumePointForPriorCall(resumePointCalls: SourceCallArguments[], priorCall: SourceCallArguments, beforeIndex: number): boolean {
  return resumePointCalls.some((resumePointCall) => {
    if (resumePointCall.end >= beforeIndex) return false;
    const wrapsPriorCall = resumePointCall.start < priorCall.start && resumePointCall.end > priorCall.end;
    return wrapsPriorCall;
  });
}

function validateWorkflowSourceAmbientReferences(source: string): void {
  if (!sourceUsesAmbientCall(source)) return;
  for (const call of sourceCallArguments(source, "ambient", "call")) {
    const argument = call.args[0];
    if (!literalPropertyValueFromObjectArgument(argument, "task")) {
      throw new Error("Compiler output source uses ambient.call without a literal task field.");
    }
    if (!objectArgumentHasProperty(argument, "input")) {
      throw new Error("Compiler output source uses ambient.call without an input field.");
    }
    if (!objectArgumentHasProperty(argument, "schema")) {
      throw new Error(
        "Compiler output source uses ambient.call without a schema field. Use ambient.call({ task, nodeId, input: { ...data, outputContract: {...} }, schema: { parse(value) { ... } }, retry: { maxAttempts: 2, onInvalid: 'retry' } }).",
      );
    }
    if (!ambientCallHasOutputContract(argument)) {
      throw new Error(
        "Compiler output source uses ambient.call without outputContract or expectedOutput in the call input. Put the contract inside input, not beside it: ambient.call({ task, input: { ...data, outputContract: {...} }, schema: { parse(value) { ... } } }).",
      );
    }
  }
}

function ambientCallHasOutputContract(argument: string | undefined): boolean {
  const inputValue = objectArgumentPropertyValue(argument, "input");
  return objectArgumentHasProperty(inputValue, "outputContract") || objectArgumentHasProperty(inputValue, "expectedOutput");
}

function sourceToolReferences(source: string): string[] {
  const references = new Set<string>();
  const searchable = sourceWithoutQuotedStringsAndComments(source);
  for (const match of searchable.matchAll(/\btools\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    references.add(match[1]);
  }
  for (const match of source.matchAll(/\btools\s*\[\s*["']([^"']+)["']\s*\]/g)) {
    references.add(match[1]);
  }
  if (/\btools\s*\[\s*(?!["'])/.test(source)) throw new Error("Compiler output source uses dynamic tool reference.");
  return [...references];
}

function validateWorkflowSourceAmbientCliReferences(source: string, manifest: WorkflowManifest): void {
  const calls = sourceCallArguments(source, "tools", "ambient_cli");
  if (calls.length === 0) return;
  if (!manifest.tools.includes("ambient_cli")) {
    throw new Error("Compiler output source references Ambient CLI without declaring tool: ambient_cli");
  }
  if (!manifest.ambientCliCapabilities?.length) {
    throw new Error("Compiler output source references Ambient CLI without a matching manifest Ambient CLI capability grant.");
  }
  for (const call of calls) {
    const argument = call.args[0];
    const packageName = literalPropertyValueFromObjectArgument(argument, "packageName");
    const packageId = literalPropertyValueFromObjectArgument(argument, "packageId");
    const command = literalPropertyValueFromObjectArgument(argument, "command");
    if (!command || (!packageName && !packageId)) {
      throw new Error("Compiler output source uses tools.ambient_cli without literal packageName/packageId and command fields.");
    }
    const grant = manifest.ambientCliCapabilities.find(
      (candidate) => candidate.command === command && (candidate.packageId === packageId || candidate.packageName === packageName),
    );
    if (!grant) {
      const packageLabel = packageName ?? packageId ?? "unknown-package";
      throw new Error(`Compiler output source references undeclared Ambient CLI command: ${packageLabel}.${command}`);
    }
  }
}

function validateWorkflowPrimitiveReferences(source: string): void {
  const searchable = sourceWithoutQuotedStringsAndComments(source);
  for (const match of searchable.matchAll(/\bworkflow\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    if (!workflowPrimitiveNames.has(match[1])) {
      throw new Error(`Compiler output source references unknown workflow SDK primitive: ${match[1]}`);
    }
  }
  for (const match of source.matchAll(/\bworkflow\s*\[\s*["']([^"']+)["']\s*\]/g)) {
    if (!workflowPrimitiveNames.has(match[1])) {
      throw new Error(`Compiler output source references unknown workflow SDK primitive: ${match[1]}`);
    }
  }
  if (/\bworkflow\s*\[\s*(?!["'])/.test(source)) {
    throw new Error("Compiler output source uses dynamic workflow SDK reference.");
  }
}

function sourceUsesAmbientCall(source: string): boolean {
  const searchable = sourceWithoutQuotedStringsAndComments(source);
  return /\bambient\.call\s*\(/.test(searchable) || /\bambient\s*\[\s*["']call["']\s*\]\s*\(/.test(source);
}

export function validateWorkflowSourceConnectorReferences(
  source: string,
  manifest: WorkflowManifest,
  connectorDescriptors: WorkflowConnectorDescriptor[] = [],
): void {
  if (/\bconnectors\s*\[\s*(?!["']call["']\s*\])/.test(source)) {
    throw new Error("Compiler output source uses dynamic connector SDK reference.");
  }
  if (!sourceUsesConnectorCall(source)) return;
  if (!manifest.connectors?.length) {
    throw new Error("Compiler output source references connectors.call but manifest.connectors is empty.");
  }

  const references = sourceConnectorReferences(source);
  if (references.length === 0) {
    throw new Error("Compiler output source uses connectors.call without literal connectorId and operation fields.");
  }
  const connectorGrants = new Map(manifest.connectors.map((grant) => [grant.connectorId, grant]));
  const connectorDescriptorsById = new Map(connectorDescriptors.map((descriptor) => [descriptor.id, descriptor]));
  for (const reference of references) {
    const grant = connectorGrants.get(reference.connectorId);
    if (!grant) {
      throw new Error(`Compiler output source references undeclared connector: ${reference.connectorId}`);
    }
    if (!grant.operations.includes(reference.operation)) {
      throw new Error(`Compiler output source references undeclared connector operation: ${reference.connectorId}.${reference.operation}`);
    }
    const descriptor = connectorDescriptorsById.get(reference.connectorId);
    if (!descriptor?.operations.some((operation) => operation.name === reference.operation)) {
      throw new Error(`Compiler output source references unavailable connector operation: ${reference.connectorId}.${reference.operation}`);
    }
  }
}

export function validateWorkflowSourceGoogleWorkspaceReferences(source: string, manifest: WorkflowManifest): void {
  const calls = sourceCallArguments(source, "tools", "google_workspace_call");
  if (calls.length === 0) return;
  if (!manifest.tools.includes("google_workspace_call")) {
    throw new Error("Compiler output source references google_workspace_call without declaring tool: google_workspace_call");
  }
  if (!manifest.googleWorkspaceMethods?.length) {
    throw new Error("Compiler output source references google_workspace_call without matching manifest Google Workspace method grants.");
  }
  for (const call of calls) {
    const argument = call.args[0];
    const methodId = literalPropertyValueFromObjectArgument(argument, "methodId");
    if (!methodId) {
      throw new Error("Compiler output source uses google_workspace_call without a literal methodId field.");
    }
    const accountHint = literalPropertyValueFromObjectArgument(argument, "accountHint");
    const grant = manifest.googleWorkspaceMethods.find((candidate) => {
      if (candidate.methodId !== methodId) return false;
      if (!accountHint) return true;
      return candidate.accountHint === accountHint;
    });
    if (!grant) {
      throw new Error(`Compiler output source references undeclared Google Workspace method: ${methodId}`);
    }
  }
}

interface WorkflowSourceGraphMappings {
  allNodeIds: Set<string>;
  modelCallNodeIds: Set<string>;
  connectorCallNodeIds: Map<string, Set<string>>;
  reviewGateNodeIds: Set<string>;
  mutationNodeIds: Set<string>;
  sourceRangesByNodeId: Map<string, WorkflowSourceRange[]>;
}

function workflowSourceGraphMappings(source: string): WorkflowSourceGraphMappings {
  const mappings: WorkflowSourceGraphMappings = {
    allNodeIds: new Set(),
    modelCallNodeIds: new Set(),
    connectorCallNodeIds: new Map(),
    reviewGateNodeIds: new Set(),
    mutationNodeIds: new Set(),
    sourceRangesByNodeId: new Map(),
  };

  for (const call of sourceCallArguments(source, "ambient", "call")) {
    const nodeId = literalPropertyValueFromObjectArgument(call.args[0], "nodeId");
    if (!nodeId) continue;
    mappings.allNodeIds.add(nodeId);
    mappings.modelCallNodeIds.add(nodeId);
    addSourceRange(mappings, nodeId, sourceRangeForCall(source, call, "ambient_call"));
  }

  for (const reference of sourceConnectorReferences(source)) {
    if (!reference.nodeId) continue;
    mappings.allNodeIds.add(reference.nodeId);
    const connectorIds = mappings.connectorCallNodeIds.get(reference.nodeId) ?? new Set<string>();
    connectorIds.add(reference.connectorId);
    mappings.connectorCallNodeIds.set(reference.nodeId, connectorIds);
    addSourceRange(mappings, reference.nodeId, sourceRangeForCall(source, reference.call, "connector_call"));
  }

  for (const call of sourceCallArguments(source, "workflow", "requireApproval")) {
    const nodeId = literalPropertyValueFromObjectArgument(call.args[1], "nodeId");
    if (!nodeId) continue;
    mappings.allNodeIds.add(nodeId);
    mappings.reviewGateNodeIds.add(nodeId);
    addSourceRange(mappings, nodeId, sourceRangeForCall(source, call, "review_gate"));
  }

  for (const call of sourceCallArguments(source, "workflow", "stageMutation")) {
    const nodeId = literalPropertyValueFromObjectArgument(call.args[2], "nodeId");
    if (!nodeId) continue;
    mappings.allNodeIds.add(nodeId);
    mappings.mutationNodeIds.add(nodeId);
    addSourceRange(mappings, nodeId, sourceRangeForCall(source, call, "mutation"));
  }

  for (const call of sourceCallArguments(source, "workflow", "askUser")) {
    const nodeId = literalPropertyValueFromObjectArgument(call.args[2], "nodeId");
    if (!nodeId) continue;
    mappings.allNodeIds.add(nodeId);
    mappings.reviewGateNodeIds.add(nodeId);
    addSourceRange(mappings, nodeId, sourceRangeForCall(source, call, "review_gate"));
  }
  for (const call of sourceCallArguments(source, "workflow", "step")) {
    addLiteralNodeId(mappings, call.args[1], sourceRangeForCall(source, call, "workflow_step"));
  }
  for (const call of sourceCallArguments(source, "workflow", "batch")) {
    addLiteralNodeId(mappings, call.args[1], sourceRangeForCall(source, call, "workflow_batch"));
  }
  for (const call of sourceCallArguments(source, "workflow", "checkpoint")) {
    addLiteralStringNodeId(mappings, call.args[0], sourceRangeForCall(source, call, "workflow_checkpoint"));
  }
  for (const call of sourceCallArguments(source, "workflow", "emit")) {
    addLiteralNodeIdForProperty(mappings, call.args[0], "graphNodeId", sourceRangeForCall(source, call, "workflow_emit"));
  }
  for (const assignment of sourceOutputAssignmentRanges(source)) {
    addSourceRange(mappings, assignment.nodeId, sourceRangeForSpan(source, assignment.start, assignment.end, "output_assignment"));
  }

  return mappings;
}

function addLiteralNodeId(mappings: WorkflowSourceGraphMappings, argument: string | undefined, range: WorkflowSourceRange): void {
  addLiteralNodeIdForProperty(mappings, argument, "nodeId", range);
}

function addLiteralNodeIdForProperty(mappings: WorkflowSourceGraphMappings, argument: string | undefined, propertyName: string, range: WorkflowSourceRange): void {
  const nodeId = literalPropertyValueFromObjectArgument(argument, propertyName);
  if (!nodeId) return;
  // Wrapper step/batch ids are useful source anchors, but only primitive calls are trace-critical.
  addSourceRange(mappings, nodeId, range);
}

function addLiteralStringNodeId(mappings: WorkflowSourceGraphMappings, argument: string | undefined, range: WorkflowSourceRange): void {
  const nodeId = literalStringValueFromArgument(argument);
  if (!nodeId) return;
  addSourceRange(mappings, nodeId, range);
}

function addSourceRange(mappings: WorkflowSourceGraphMappings, nodeId: string, range: WorkflowSourceRange): void {
  mappings.sourceRangesByNodeId.set(nodeId, [...(mappings.sourceRangesByNodeId.get(nodeId) ?? []), range]);
}

function sourceOutputAssignmentRanges(source: string): Array<{ nodeId: string; start: number; end: number }> {
  const ranges: Array<{ nodeId: string; start: number; end: number }> = [];
  const pattern = /\boutputs\s*\[\s*["']([^"']+)["']\s*\]\s*=/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const statementEnd = source.indexOf("\n", match.index);
    ranges.push({
      nodeId: match[1],
      start: match.index,
      end: statementEnd < 0 ? pattern.lastIndex : statementEnd,
    });
  }
  return ranges;
}

function sourceConnectorReferences(source: string): Array<{ connectorId: string; operation: string; nodeId?: string; call: SourceCallArguments }> {
  const references: Array<{ connectorId: string; operation: string; nodeId?: string; call: SourceCallArguments }> = [];
  for (const call of sourceCallArguments(source, "connectors", "call")) {
    const connectorId = literalPropertyValueFromObjectArgument(call.args[0], "connectorId");
    const operation = literalPropertyValueFromObjectArgument(call.args[0], "operation");
    if (connectorId && operation) {
      references.push({
        connectorId,
        operation,
        nodeId: literalPropertyValueFromObjectArgument(call.args[0], "nodeId"),
        call,
      });
    }
  }
  return references;
}

function sourceUsesConnectorCall(source: string): boolean {
  const searchable = sourceWithoutQuotedStringsAndComments(source);
  return /\bconnectors\.call\s*\(/.test(searchable) || /\bconnectors\s*\[\s*["']call["']\s*\]\s*\(/.test(source);
}

function sourceWithoutQuotedStringsAndComments(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      output += "  ";
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        output += " ";
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      output += "  ";
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        output += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      if (index < source.length) {
        output += "  ";
        index += 2;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      const quote = char;
      output += " ";
      index += 1;
      while (index < source.length) {
        const inner = source[index];
        output += inner === "\n" ? "\n" : " ";
        index += inner === "\\" ? 2 : 1;
        if (inner === quote) break;
      }
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

interface SourceCallArguments {
  args: string[];
  start: number;
  end: number;
}

function sourceCallArguments(source: string, receiver: "ambient" | "connectors" | "workflow" | "tools", method: string): SourceCallArguments[] {
  const calls: SourceCallArguments[] = [];
  const pattern = new RegExp(`\\b${receiver}\\s*(?:\\.${method}|\\[\\s*["']${method}["']\\s*\\])\\s*\\(`, "g");
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const openParenIndex = pattern.lastIndex - 1;
    const closeParenIndex = findMatchingDelimiter(source, openParenIndex, "(", ")");
    if (closeParenIndex < 0) continue;
    calls.push({ args: splitTopLevelDelimited(source.slice(openParenIndex + 1, closeParenIndex)), start: match.index, end: closeParenIndex + 1 });
    pattern.lastIndex = closeParenIndex + 1;
  }
  return calls;
}

function sourceRangeForCall(source: string, call: SourceCallArguments, kind: WorkflowSourceRangeKind): WorkflowSourceRange {
  return sourceRangeForSpan(source, call.start, call.end, kind);
}

function sourceRangeForSpan(source: string, start: number, end: number, kind: WorkflowSourceRangeKind): WorkflowSourceRange {
  const startPosition = sourcePositionForIndex(source, start);
  const endPosition = sourcePositionForIndex(source, end);
  return {
    kind,
    start,
    end,
    startLine: startPosition.line,
    startColumn: startPosition.column,
    endLine: endPosition.line,
    endColumn: endPosition.column,
    snippet: source.slice(start, end).trim(),
  };
}

function sourcePositionForIndex(source: string, index: number): { line: number; column: number } {
  const bounded = Math.max(0, Math.min(index, source.length));
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < bounded; cursor += 1) {
    if (source[cursor] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function literalPropertyValueFromObjectArgument(argument: string | undefined, propertyName: string): string | undefined {
  return literalStringValueFromArgument(objectArgumentPropertyValue(argument, propertyName));
}

function literalStringValueFromArgument(argument: string | undefined): string | undefined {
  const trimmed = argument?.trim();
  if (!trimmed) return undefined;
  const quote = trimmed[0];
  if (quote !== `"` && quote !== `'`) return undefined;
  let value = "";
  let escaped = false;
  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      value += unescapeJavascriptStringChar(char);
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return trimmed.slice(index + 1).trim().length === 0 ? value.trim() || undefined : undefined;
    }
    value += char;
  }
  return undefined;
}

function unescapeJavascriptStringChar(char: string): string {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  if (char === "b") return "\b";
  if (char === "f") return "\f";
  if (char === "v") return "\v";
  if (char === "0") return "\0";
  return char;
}

function objectArgumentPropertyValue(argument: string | undefined, propertyName: string): string | undefined {
  const trimmed = argument?.trim();
  if (!trimmed?.startsWith("{")) return undefined;
  const closeBraceIndex = findMatchingDelimiter(trimmed, 0, "{", "}");
  if (closeBraceIndex < 0) return undefined;
  for (const member of splitTopLevelDelimited(trimmed.slice(1, closeBraceIndex))) {
    const normalized = member.trim();
    const unquotedPrefix = new RegExp(`^${propertyName}\\s*:\\s*`).exec(normalized);
    if (unquotedPrefix) return normalized.slice(unquotedPrefix[0].length).trim();
    const quotedPrefix = new RegExp(`^["']${propertyName}["']\\s*:\\s*`).exec(normalized);
    if (quotedPrefix) return normalized.slice(quotedPrefix[0].length).trim();
  }
  return undefined;
}

function objectArgumentHasProperty(argument: string | undefined, propertyName: string): boolean {
  const trimmed = argument?.trim();
  if (!trimmed?.startsWith("{")) return false;
  const closeBraceIndex = findMatchingDelimiter(trimmed, 0, "{", "}");
  if (closeBraceIndex < 0) return false;
  for (const member of splitTopLevelDelimited(trimmed.slice(1, closeBraceIndex))) {
    const normalized = member.trim();
    if (normalized === propertyName) return true;
    if (new RegExp(`^${propertyName}\\s*:`).test(normalized)) return true;
    if (new RegExp(`^["']${propertyName}["']\\s*:`).test(normalized)) return true;
  }
  return false;
}

function splitTopLevelDelimited(input: string): string[] {
  const parts: string[] = [];
  let partStart = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  const state = sourceScanState();

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (advanceSourceScanState(state, char, next)) {
      if (state.skipNext) index += 1;
      continue;
    }
    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      parts.push(input.slice(partStart, index).trim());
      partStart = index + 1;
    }
  }
  const tail = input.slice(partStart).trim();
  if (tail) parts.push(tail);
  return parts;
}

function findMatchingDelimiter(source: string, openIndex: number, openChar: "{" | "(", closeChar: "}" | ")"): number {
  if (source[openIndex] !== openChar) return -1;
  const state = sourceScanState();
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (advanceSourceScanState(state, char, next)) {
      if (state.skipNext) index += 1;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

interface SourceScanState {
  quote?: string;
  escape: boolean;
  lineComment: boolean;
  blockComment: boolean;
  skipNext: boolean;
}

function sourceScanState(): SourceScanState {
  return {
    escape: false,
    lineComment: false,
    blockComment: false,
    skipNext: false,
  };
}

function advanceSourceScanState(state: SourceScanState, char: string, next: string | undefined): boolean {
  state.skipNext = false;
  if (state.lineComment) {
    if (char === "\n") state.lineComment = false;
    return true;
  }
  if (state.blockComment) {
    if (char === "*" && next === "/") {
      state.blockComment = false;
      state.skipNext = true;
    }
    return true;
  }
  if (state.quote) {
    if (state.escape) {
      state.escape = false;
      return true;
    }
    if (char === "\\") {
      state.escape = true;
      return true;
    }
    if (char === state.quote) state.quote = undefined;
    return true;
  }
  if (char === "/" && next === "/") {
    state.lineComment = true;
    state.skipNext = true;
    return true;
  }
  if (char === "/" && next === "*") {
    state.blockComment = true;
    state.skipNext = true;
    return true;
  }
  if (char === '"' || char === "'" || char === "`") {
    state.quote = char;
    return true;
  }
  return false;
}
