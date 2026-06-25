import { z } from "zod";
import type { WorkflowDiscoveryQuestion, WorkflowExplorationTraceSummary, WorkflowGraphSnapshot } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowCompilerDesktopToolFacade";
import type { WorkflowConnectorDescriptor } from "./workflowCompilerWorkflowFacade";

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

const workflowCompilerCapabilityDiscoveryQuerySchema = z.preprocess(
  (value) => (typeof value === "string" ? { query: value } : value),
  z.object({
    query: z.string().trim().min(1).max(240),
    reason: z.string().trim().max(500).optional(),
  }),
);

const workflowCompilerCapabilityDiscoverySchema = z.object({
  queries: z.array(workflowCompilerCapabilityDiscoveryQuerySchema).max(8).default([]),
  requiredToolNames: z.array(z.string().min(1).max(160)).max(20).default([]),
  requiredConnectorIds: z.array(z.string().min(1).max(160)).max(20).default([]),
  openQuestions: z.array(z.string().min(1).max(500)).max(10).default([]),
});

const DEFAULT_WORKFLOW_COMPILER_SELECTED_TOOL_LIMIT = 14;
const DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_LIMIT = 4;
const DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_OPERATION_LIMIT = 8;
const WORKFLOW_COMPILER_MIN_SELECTED_TOOL_SCORE = 8;
const WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_SCORE = 8;
const WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_OPERATION_SCORE = 6;
const WORKFLOW_COMPILER_TOOL_HINTS: Record<string, RegExp[]> = {
  bash: [/\b(bash|shell|terminal|command|script|process|pnpm|npm|node|python|pytest|vitest|test|build|render|pdf|pandoc|playwright)\b/i],
  file_read: [/\b(read|load|inspect|parse|file|workspace|document|csv|json|markdown|md|source|input)\b/i],
  local_directory_list: [
    /\b(local|downloads?|desktop|documents folder|documents directory|folder|directory|files|categorize|classify|inventory)\b/i,
  ],
  local_file_read: [
    /\b(local|downloads?|desktop|documents folder|documents directory|read|load|inspect|document|docx|xlsx|pptx|csv|json|markdown|txt)\b/i,
  ],
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
  ambient_cli_env_bind: [
    /\b(api key|apikey|secret file|env bind|environment binding|missing env|credential|token|cloud-backed|cloud api)\b/i,
  ],
  ambient_cli: [/\b(ambient cli|cli package|installed command|youtube|arxiv|transcript|local command|cloud-backed|cloud api)\b/i],
  long_context_process: [
    /\b(long[-_\s]?context|rlm|large evidence|long evidence|long fields?|many records?|deeply structured|transcripts?|meeting notes|action items?)\b/i,
  ],
  ambient_visual_analyze: [
    /\b(images?|photos?|pictures?|screenshots?|visual|vision|ocr|minicpm|classif(?:y|ication).*images?|categoriz(?:e|ation).*images?)\b/i,
  ],
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
const WORKFLOW_COMPILER_TOOL_FALLBACK_NAMES = [
  "file_read",
  "file_write",
  "local_directory_list",
  "browser_search",
  "browser_content",
  "bash",
];
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
export function workflowCompilerRequiredBuiltinToolIntents(
  input: WorkflowCompilerToolSelectionInput,
): WorkflowCompilerRequiredBuiltinToolIntent[] {
  const corpus = workflowCompilerCapabilityCorpus(input);
  const deniedToolNames = workflowCompilerDeniedToolNames(input);
  const intents = new Map<string, WorkflowCompilerRequiredBuiltinToolIntent>();
  const addIntent = (intent: WorkflowCompilerRequiredBuiltinToolIntent) => {
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
      reason: requiredByProvider
        ? `Capability discovery marked ${toolName} as required for this workflow.`
        : `The request explicitly names ${toolName}.`,
      repairHint: `Enable the built-in ${toolName} browser workflow tool or change the request/search routing so this exact browser capability is no longer required.`,
      forbiddenSubstitutes: [
        "model.call over guessed web content",
        "workspace.inventory",
        "raw Google Workspace tools",
        "local files",
        "ambient_cli",
      ],
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

export function selectWorkflowCompilerConnectorDescriptors(
  input: WorkflowCompilerConnectorSelectionInput,
): WorkflowCompilerConnectorSelection {
  const connectors = input.connectorDescriptors ?? [];
  const maxConnectors = Math.max(0, Math.floor(input.maxConnectors ?? DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_LIMIT));
  const maxOperationsPerConnector = Math.max(
    1,
    Math.floor(input.maxOperationsPerConnector ?? DEFAULT_WORKFLOW_COMPILER_SELECTED_CONNECTOR_OPERATION_LIMIT),
  );
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
    .filter(
      (item) =>
        item.connectorScore >= WORKFLOW_COMPILER_MIN_SELECTED_CONNECTOR_SCORE ||
        item.operations.length > 0 ||
        explicitConnectorIds.has(item.connector.id),
    )
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
  const exactToolNameCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
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
  const denialCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
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
  const userAuthoredCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
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
  const userAuthoredCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
  if (/\bambient\s+cli\b/i.test(userAuthoredCorpus)) return true;
  return [...WORKFLOW_COMPILER_AMBIENT_CLI_TOOL_NAMES].some((toolName) =>
    new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(toolName)}([^A-Za-z0-9_]|$)`, "i").test(userAuthoredCorpus),
  );
}

function workflowCompilerHasPersonalAccountConnectorIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
  return WORKFLOW_COMPILER_FIRST_PARTY_CONNECTOR_INTENT_PATTERNS.some((pattern) => pattern.test(userAuthoredCorpus));
}

function workflowCompilerHasGoogleConnectorIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
  return WORKFLOW_COMPILER_GOOGLE_CONNECTOR_INTENT_PATTERNS.some((pattern) => pattern.test(userAuthoredCorpus));
}

function workflowCompilerHasUserNamedGoogleWorkspaceRawToolIntent(input: WorkflowCompilerToolSelectionInput): boolean {
  const userAuthoredCorpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
  if (
    /\bgoogle_workspace_(?:install_gws|start_login|validate_account|cancel_setup|status|call|materialize_file|search_methods)\b/i.test(
      userAuthoredCorpus,
    )
  ) {
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
  const corpus = [
    input.userRequest,
    input.workspaceSummary,
    ...(input.discoveryQuestions ?? []).map((question) => question.answer?.freeform ?? ""),
  ]
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
    (/\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n]{0,120}\b(?:google\s+workspace|google tools?|google connectors?|google\s+workspace\s+tools\/connectors|gmail|google\s+mail|google\s+drive|calendar|docs|sheets|slides)\b/i.test(
      corpus,
    ) ||
      /\b(?:google\s+workspace|google tools?|google connectors?|gmail|google\s+mail|google\s+drive|calendar|docs|sheets|slides)\b[^\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i.test(
        corpus,
      ));
  if (denyGoogleWorkspace) {
    ids.add("google.gmail");
    ids.add("google.calendar");
    ids.add("google.drive");
  }
  const denyWorkspaceInventory =
    /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n]{0,120}\bworkspace[\s.]inventory\b/i.test(
      corpus,
    ) || /\bworkspace[\s.]inventory\b[^\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i.test(corpus);
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
    .map((question) =>
      [question.category, question.context, question.question, question.answer?.choiceId, question.answer?.freeform, question.graphImpact]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
  const traces = (input.explorationTraces ?? [])
    .map((trace) =>
      [
        trace.request,
        JSON.stringify(trace.capabilityManifest ?? {}),
        JSON.stringify(trace.distillation ?? {}),
        JSON.stringify(trace.observations ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    )
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
            node.connectorIds?.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ")
    : "";
  return [input.userRequest, input.workspaceSummary, ...(input.capabilityQueries ?? []), discovery, traces, graph]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function workflowCompilerExactLocalDirectoryListIntent(corpus: string): boolean {
  return (
    /\blocal_directory_list\b/i.test(corpus) ||
    /\b(?:downloads?|desktop|documents)\b[^\n]{0,120}\b(?:folder|directory|inventory|categor(?:ize|isation|ization)|classif(?:y|ication)|metadata)\b/i.test(
      corpus,
    ) ||
    /\b(?:folder|directory|inventory|categor(?:ize|isation|ization)|classif(?:y|ication)|metadata)\b[^\n]{0,120}\b(?:downloads?|desktop|documents)\b/i.test(
      corpus,
    )
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
  const searchable =
    `${connector.id} ${operation.name} ${operation.label} ${operation.description} ${operation.requiredScopes.join(" ")}`.toLowerCase();
  for (const token of searchable.split(/[^a-z0-9_.-]+/).filter((part) => part.length >= 4)) {
    if (corpus.includes(token)) score += operation.name.toLowerCase() === token ? 24 : 3;
  }
  if (
    operation.sideEffects === "read_personal_data" &&
    /\b(read|list|get|search|find|summarize|brief|agenda|drive|calendar|gmail|docs|sheets|slides)\b/i.test(corpus)
  ) {
    score += 18;
  }
  if (operation.sideEffects === "write_external" && /\b(write|send|create|update|delete|share|invite|post|mutate)\b/i.test(corpus))
    score += 18;
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

function workflowDiscoveryPromptSection(questions: WorkflowDiscoveryQuestion[] | undefined): string {
  const answered = (questions ?? []).filter((question) => question.answer);
  if (answered.length === 0) return "No answered workflow discovery questions were provided.";
  return answered
    .map((question, index) => {
      const selectedChoice = question.answer?.choiceId
        ? question.choices.find((choice) => choice.id === question.answer?.choiceId)
        : undefined;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
