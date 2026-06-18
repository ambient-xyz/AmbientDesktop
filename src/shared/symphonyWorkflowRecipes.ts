import { AMBIENT_SUBAGENTS_FEATURE_FLAG, type AmbientFeatureFlagId } from "./featureFlags";
import { buildDefaultSymphonyPatternRoleGraph, type SubagentPatternRoleGraph } from "./subagentPatternGraph";
import type { SubagentRoleId } from "./subagentRoles";
import type { CallableWorkflowSourcePreview } from "./workflowTypes";

export const SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION = "ambient-symphony-workflow-recipe-v1" as const;
export const SYMPHONY_WORKFLOW_SOURCE_PREVIEW_SCHEMA_VERSION =
  "ambient-callable-workflow-source-preview-v1" as const;

export const SYMPHONY_WORKFLOW_PATTERN_IDS = [
  "map_reduce",
  "adversarial_debate",
  "imitate_and_verify",
  "pipeline",
  "ensemble",
  "self_healing_loop",
] as const;

export type SymphonyWorkflowPatternId = typeof SYMPHONY_WORKFLOW_PATTERN_IDS[number];

export type SymphonyMetricTemplateKind =
  | "objective_metric"
  | "rubric"
  | "verifier_criteria";

export type SymphonyWorkflowRecipeVisibility = "parent_pi_visible_by_default" | "child_role_policy_required";

export interface SymphonyWorkflowChoice {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
}

export interface SymphonyWorkflowBuilderStep {
  id: string;
  question: string;
  choices: SymphonyWorkflowChoice[];
  allowCustom: true;
  impact: string;
}

export interface SymphonyMetricTemplate {
  id: string;
  kind: SymphonyMetricTemplateKind;
  label: string;
  prompt: string;
  required: true;
  customizable: true;
}

export interface SymphonyLaunchCardRequirement {
  id: string;
  label: string;
  required: true;
}

export interface SymphonyWorkflowRecipePreset {
  schemaVersion: typeof SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION;
  id: SymphonyWorkflowPatternId;
  label: string;
  summary: string;
  requiredFeatureFlag: AmbientFeatureFlagId;
  defaultCollapsedChildThreads: true;
  diagramSvg: string;
  sourcePreview: CallableWorkflowSourcePreview;
  defaultRoles: SubagentRoleId[];
  defaultRoleGraph: SubagentPatternRoleGraph;
  builderSteps: SymphonyWorkflowBuilderStep[];
  metricTemplates: SymphonyMetricTemplate[];
  launchCardRequirements: SymphonyLaunchCardRequirement[];
  hardLimits: {
    maxFanout: number;
    maxDepth: number;
    maxTokenBudget: number;
    maxLocalMemoryBytes: number;
    allowSmallSliceRun: true;
  };
  callableToolPolicy: {
    parentVisibility: SymphonyWorkflowRecipeVisibility;
    childVisibility: SymphonyWorkflowRecipeVisibility;
    inputSchema: {
      type: "object";
      additionalProperties: false;
      required: string[];
      properties: Record<string, { type: string; description: string }>;
    };
    validationRepair: "json_schema_then_repair";
  };
  recorderPolicy: {
    compactInvocationByDefault: true;
    fullTraceArtifact: true;
  };
}

const REQUIRED_LAUNCH_CARD_REQUIREMENTS: SymphonyLaunchCardRequirement[] = [
  { id: "estimated_agents", label: "Estimated agents", required: true },
  { id: "token_cost_budget", label: "Token and cost budget", required: true },
  { id: "tool_mutation_scope", label: "Tool and mutation scope", required: true },
  { id: "checkpoint_resume", label: "Checkpoint and resume behavior", required: true },
  { id: "approval_failure_handling", label: "Approval failure handling", required: true },
];

const DEFAULT_LIMITS = {
  maxFanout: 12,
  maxDepth: 2,
  maxTokenBudget: 180_000,
  maxLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
  allowSmallSliceRun: true,
} as const;

export const SYMPHONY_WORKFLOW_RECIPE_PRESETS: SymphonyWorkflowRecipePreset[] = [
  preset({
    id: "map_reduce",
    label: "Map-Reduce",
    summary: "Fan out over files, sources, or slices, then reduce schema-valid child results into one cited answer.",
    roles: ["explorer", "summarizer"],
    metricKind: "objective_metric",
    metricLabel: "Reducer success metric",
    metricPrompt: "What objective extraction schema, count, or validation check proves the reducer has enough coverage?",
    firstQuestion: "What collection should Symphony split across child threads?",
    firstChoices: [
      choice("files", "Files", "Split across selected workspace files or search results.", true),
      choice("sources", "Sources", "Split across web, connector, or artifact sources."),
      choice("records", "Records", "Split across structured records, rows, or chunks."),
    ],
  }),
  preset({
    id: "adversarial_debate",
    label: "Adversarial Debate",
    summary: "Spawn children with opposing perspectives, compare their claims, and preserve dissent before convergence.",
    roles: ["explorer", "reviewer", "summarizer"],
    metricKind: "rubric",
    metricLabel: "Debate rubric",
    metricPrompt: "Which rubric should score evidence quality, counterarguments, uncertainty, and convergence?",
    firstQuestion: "What perspectives should the child threads argue from?",
    firstChoices: [
      choice("risk-benefit", "Risk and benefit", "One child argues upside while another attacks risks.", true),
      choice("user-system", "User and system", "Compare user experience against implementation constraints."),
      choice("proposal-critique", "Proposal and critique", "Generate a proposal, then challenge it aggressively."),
    ],
  }),
  preset({
    id: "imitate_and_verify",
    label: "Imitate and Verify",
    summary: "Let one child draft the artifact while an independent verifier checks criteria, tests, and weak spots.",
    roles: ["worker", "reviewer"],
    metricKind: "verifier_criteria",
    metricLabel: "Verifier criteria",
    metricPrompt: "What acceptance checks, tests, or invariants must the verifier independently confirm?",
    firstQuestion: "What should the imitator produce before verification?",
    firstChoices: [
      choice("code", "Code change", "Draft a scoped implementation and send it to a reviewer.", true),
      choice("plan", "Plan", "Draft a plan and verify gaps, sequencing, and risks."),
      choice("content", "Content", "Draft text or structured content and verify the output shape."),
    ],
  }),
  preset({
    id: "pipeline",
    label: "Pipeline",
    summary: "Chain child stages so each output is validated before becoming the next stage's input.",
    roles: ["explorer", "worker", "reviewer", "summarizer"],
    metricKind: "objective_metric",
    metricLabel: "Stage contract metric",
    metricPrompt: "Which output contract and failure policy must every stage satisfy before the next stage starts?",
    firstQuestion: "What ordered stages should Symphony build?",
    firstChoices: [
      choice("fetch-cite-synthesize", "Fetch, cite, synthesize", "Collect evidence, cite it, then produce a final report.", true),
      choice("extract-transform-review", "Extract, transform, review", "Convert inputs to a structured intermediate and review it."),
      choice("prepare-apply-verify", "Prepare, apply, verify", "Stage mutations, apply after approval, then verify."),
    ],
  }),
  preset({
    id: "ensemble",
    label: "Ensemble",
    summary: "Generate independent alternatives, score them with a rubric, and keep the strongest option plus runners-up.",
    roles: ["explorer", "reviewer", "summarizer"],
    metricKind: "rubric",
    metricLabel: "Selection rubric",
    metricPrompt: "Which rubric should score independent drafts and decide the winner?",
    firstQuestion: "What kind of alternatives should the ensemble generate?",
    firstChoices: [
      choice("implementation-options", "Implementation options", "Generate several technical approaches before choosing.", true),
      choice("writing-drafts", "Writing drafts", "Generate multiple drafts and score them."),
      choice("plans", "Plans", "Generate competing plans and preserve tradeoffs."),
    ],
  }),
  preset({
    id: "self_healing_loop",
    label: "Self-Healing Loop",
    summary: "Run an attempt, measure it against objective checks, and iterate repair within strict budgets.",
    roles: ["worker", "reviewer"],
    metricKind: "objective_metric",
    metricLabel: "Healing objective",
    metricPrompt: "Which tests, checks, or measurable acceptance criteria decide whether the loop is healed?",
    firstQuestion: "What objective check should drive the repair loop?",
    firstChoices: [
      choice("tests", "Tests", "Run a deterministic test or verification command after each attempt.", true),
      choice("schema", "Schema", "Validate structured output or artifact contracts after each attempt."),
      choice("runtime", "Runtime check", "Exercise the product path and repair observed failures."),
    ],
  }),
];

export function listSymphonyWorkflowRecipePresets(): SymphonyWorkflowRecipePreset[] {
  return SYMPHONY_WORKFLOW_RECIPE_PRESETS.map(clonePreset);
}

export function getSymphonyWorkflowRecipePreset(id: SymphonyWorkflowPatternId): SymphonyWorkflowRecipePreset {
  const preset = SYMPHONY_WORKFLOW_RECIPE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown Symphony workflow pattern: ${id}`);
  return clonePreset(preset);
}

export function symphonyMetricTemplateKindForPattern(id: SymphonyWorkflowPatternId): SymphonyMetricTemplateKind {
  return getSymphonyWorkflowRecipePreset(id).metricTemplates[0]!.kind;
}

export function missingRequiredSymphonyMetricTemplateLabels(input: {
  patternId: SymphonyWorkflowPatternId;
  metricCustomizations?: Record<string, string> | undefined;
}): string[] {
  const recipe = getSymphonyWorkflowRecipePreset(input.patternId);
  return recipe.metricTemplates
    .filter((template) => template.required && !input.metricCustomizations?.[template.id]?.trim())
    .map((template) => template.label);
}

export function requiredSymphonyMetricTemplateErrorMessage(input: {
  missingLabels: readonly string[];
  actionLabel: string;
}): string | undefined {
  if (input.missingLabels.length === 0) return undefined;
  if (input.missingLabels.length === 1) {
    return `Complete required ${sentenceCaseLabel(input.missingLabels[0])} before ${input.actionLabel}.`;
  }
  return `Complete ${input.missingLabels.length} required metrics or rubrics before ${input.actionLabel}.`;
}

function preset(input: {
  id: SymphonyWorkflowPatternId;
  label: string;
  summary: string;
  roles: SubagentRoleId[];
  metricKind: SymphonyMetricTemplateKind;
  metricLabel: string;
  metricPrompt: string;
  firstQuestion: string;
  firstChoices: SymphonyWorkflowChoice[];
}): SymphonyWorkflowRecipePreset {
  const recipeWithoutPreview: Omit<SymphonyWorkflowRecipePreset, "sourcePreview"> = {
    schemaVersion: SYMPHONY_WORKFLOW_RECIPE_SCHEMA_VERSION,
    id: input.id,
    label: input.label,
    summary: input.summary,
    requiredFeatureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
    defaultCollapsedChildThreads: true,
    diagramSvg: patternDiagramSvg(input.label),
    defaultRoles: input.roles,
    defaultRoleGraph: buildDefaultSymphonyPatternRoleGraph(input.id),
    builderSteps: [
      {
        id: "pattern-scope",
        question: input.firstQuestion,
        choices: input.firstChoices,
        allowCustom: true,
        impact: "Defines child thread fanout, role assignment, and result aggregation.",
      },
      {
        id: "limits-and-policy",
        question: "What limits and approval policy should constrain this Symphony run?",
        choices: [
          choice("small-slice", "Small slice first", "Run a low-cost sample before launching the full workflow.", true),
          choice("full-budget", "Full budget", "Use the configured hard ceilings after launch-card confirmation."),
          choice("read-only", "Read-only", "Forbid mutations and connector writes for this recipe."),
        ],
        allowCustom: true,
        impact: "Sets fanout, depth, token, local-memory, tool, mutation, and approval bounds.",
      },
    ],
    metricTemplates: [
      {
        id: `${input.id}-metric`,
        kind: input.metricKind,
        label: input.metricLabel,
        prompt: input.metricPrompt,
        required: true,
        customizable: true,
      },
    ],
    launchCardRequirements: REQUIRED_LAUNCH_CARD_REQUIREMENTS,
    hardLimits: DEFAULT_LIMITS,
    callableToolPolicy: {
      parentVisibility: "parent_pi_visible_by_default",
      childVisibility: "child_role_policy_required",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["goal"],
        properties: {
          goal: {
            type: "string",
            description: "Concrete objective for this workflow run.",
          },
          scope: {
            type: "string",
            description: "Optional bounded scope such as files, records, source list, or artifact handles.",
          },
        },
      },
      validationRepair: "json_schema_then_repair",
    },
    recorderPolicy: {
      compactInvocationByDefault: true,
      fullTraceArtifact: true,
    },
  };
  return {
    ...recipeWithoutPreview,
    sourcePreview: symphonyWorkflowRecipeSourcePreview(recipeWithoutPreview),
  };
}

function choice(id: string, label: string, description: string, recommended = false): SymphonyWorkflowChoice {
  return { id, label, description, ...(recommended ? { recommended: true } : {}) };
}

function sentenceCaseLabel(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function patternDiagramSvg(label: string): string {
  return [
    '<svg viewBox="0 0 360 120" role="img" aria-label="Symphony pattern preview">',
    '<rect x="2" y="2" width="356" height="116" rx="8" fill="#fbfcfc" stroke="#d8dedf"/>',
    '<circle cx="58" cy="60" r="24" fill="#2f7d4c"/>',
    '<rect x="128" y="38" width="88" height="44" rx="8" fill="#e9ecfb" stroke="#c5cbed"/>',
    '<rect x="264" y="38" width="54" height="44" rx="8" fill="#fff1d9" stroke="#e4c590"/>',
    '<path d="M84 60 H126 M216 60 H262" fill="none" stroke="#4c5b61" stroke-width="3"/>',
    `<text x="172" y="66" text-anchor="middle" font-size="13" fill="#17212b">${escapeXml(label)}</text>`,
    "</svg>",
  ].join("");
}

function clonePreset(preset: SymphonyWorkflowRecipePreset): SymphonyWorkflowRecipePreset {
  return {
    ...preset,
    sourcePreview: {
      ...preset.sourcePreview,
      searchTerms: [...preset.sourcePreview.searchTerms],
    },
    defaultRoles: [...preset.defaultRoles],
    defaultRoleGraph: {
      ...preset.defaultRoleGraph,
      nodes: preset.defaultRoleGraph.nodes.map((node) => ({
        ...node,
        roleOverlayIds: [...node.roleOverlayIds],
        overlayLabels: [...node.overlayLabels],
      })),
      edges: preset.defaultRoleGraph.edges.map((edge) => ({ ...edge })),
    },
    builderSteps: preset.builderSteps.map((step) => ({
      ...step,
      choices: step.choices.map((item) => ({ ...item })),
    })),
    metricTemplates: preset.metricTemplates.map((item) => ({ ...item })),
    launchCardRequirements: preset.launchCardRequirements.map((item) => ({ ...item })),
    hardLimits: { ...preset.hardLimits },
    callableToolPolicy: {
      ...preset.callableToolPolicy,
      inputSchema: {
        ...preset.callableToolPolicy.inputSchema,
        required: [...preset.callableToolPolicy.inputSchema.required],
        properties: Object.fromEntries(
          Object.entries(preset.callableToolPolicy.inputSchema.properties).map(([key, value]) => [key, { ...value }]),
        ),
      },
    },
    recorderPolicy: { ...preset.recorderPolicy },
  };
}

function symphonyWorkflowRecipeSourcePreview(
  recipe: Omit<SymphonyWorkflowRecipePreset, "sourcePreview">,
): CallableWorkflowSourcePreview {
  return {
    schemaVersion: SYMPHONY_WORKFLOW_SOURCE_PREVIEW_SCHEMA_VERSION,
    label: `Readable source preview for Symphony ${recipe.label}`,
    format: "ambient_symphony_recipe_preview",
    executable: false,
    dslStatus: "readable_preview_only",
    text: symphonyWorkflowRecipeSourcePreviewText(recipe),
    searchTerms: symphonyWorkflowRecipeSearchTerms(recipe),
  };
}

function symphonyWorkflowRecipeSourcePreviewText(recipe: Omit<SymphonyWorkflowRecipePreset, "sourcePreview">): string {
  return [
    `symphony_recipe ${recipe.id}`,
    `title: Symphony ${recipe.label}`,
    `schema: ${recipe.schemaVersion}`,
    `feature_flag: ${recipe.requiredFeatureFlag}`,
    "dsl_status: readable_preview_only",
    "executable: false",
    `summary: ${recipe.summary}`,
    `child_threads: ${recipe.defaultCollapsedChildThreads ? "default_collapsed" : "expanded"}`,
    `roles: ${recipe.defaultRoles.join(", ")}`,
    "role_graph:",
    ...recipe.defaultRoleGraph.nodes.map((nodeItem) =>
      `  - ${nodeItem.id}: ${nodeItem.baseRole}+${nodeItem.patternRole} overlays=[${nodeItem.overlayLabels.join(" | ")}] required=${nodeItem.required}`
    ),
    "role_graph_edges:",
    ...recipe.defaultRoleGraph.edges.map((edgeItem) =>
      `  - ${edgeItem.id}: ${edgeItem.from} -> ${edgeItem.to} kind=${edgeItem.kind} required=${edgeItem.required}`
    ),
    "builder_steps:",
    ...recipe.builderSteps.map((step) =>
      `  - ${step.id}: ${step.question} choices=[${step.choices.map((choiceItem) => choiceItem.label).join(" | ")}] custom=true impact=${step.impact}`
    ),
    "metrics:",
    ...recipe.metricTemplates.map((template) =>
      `  - ${template.id}: ${template.kind} ${template.label} required=true prompt=${template.prompt}`
    ),
    "launch_card:",
    ...recipe.launchCardRequirements.map((requirement) => `  - ${requirement.id}: ${requirement.label}`),
    "limits:",
    `  max_fanout: ${recipe.hardLimits.maxFanout}`,
    `  max_depth: ${recipe.hardLimits.maxDepth}`,
    `  max_token_budget: ${recipe.hardLimits.maxTokenBudget}`,
    `  max_local_memory_bytes: ${recipe.hardLimits.maxLocalMemoryBytes}`,
    `  allow_small_slice_run: ${recipe.hardLimits.allowSmallSliceRun}`,
    "callable_tool_policy:",
    `  parent_visibility: ${recipe.callableToolPolicy.parentVisibility}`,
    `  child_visibility: ${recipe.callableToolPolicy.childVisibility}`,
    `  validation_repair: ${recipe.callableToolPolicy.validationRepair}`,
    `  required_inputs: ${recipe.callableToolPolicy.inputSchema.required.join(", ")}`,
    "recorder_policy:",
    `  compact_invocation_by_default: ${recipe.recorderPolicy.compactInvocationByDefault}`,
    `  full_trace_artifact: ${recipe.recorderPolicy.fullTraceArtifact}`,
  ].join("\n");
}

function symphonyWorkflowRecipeSearchTerms(recipe: Omit<SymphonyWorkflowRecipePreset, "sourcePreview">): string[] {
  const terms = [
    recipe.id,
    recipe.label,
    recipe.summary,
    recipe.schemaVersion,
    recipe.requiredFeatureFlag,
    "readable preview",
    "readable dsl",
    "symphony recipe",
    "callable workflow",
    "default collapsed child threads",
    ...recipe.defaultRoles,
    ...recipe.defaultRoleGraph.nodes.flatMap((nodeItem) => [
      nodeItem.id,
      nodeItem.label,
      nodeItem.baseRole,
      nodeItem.patternRole,
      ...nodeItem.overlayLabels,
    ]),
    ...recipe.builderSteps.flatMap((step) => [
      step.id,
      step.question,
      step.impact,
      ...step.choices.flatMap((choiceItem) => [choiceItem.id, choiceItem.label, choiceItem.description]),
    ]),
    ...recipe.metricTemplates.flatMap((template) => [
      template.id,
      template.kind,
      template.label,
      template.prompt,
    ]),
    ...recipe.launchCardRequirements.flatMap((requirement) => [requirement.id, requirement.label]),
  ];
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
