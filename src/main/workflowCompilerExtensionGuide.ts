import {
  workflowCompilerPromptRuleInventory,
  type WorkflowCompilerPromptRule,
  type WorkflowCompilerPromptRuleOwner,
  type WorkflowCompilerPromptRuleSource,
} from "./workflowCompilerPromptInventory";

export type WorkflowCompilerExtensionKind = "capability" | "recipe" | "policy" | "validator";

export interface WorkflowCompilerExtensionGuideEntry {
  kind: WorkflowCompilerExtensionKind;
  title: string;
  purpose: string;
  primaryFiles: string[];
  requiredSteps: string[];
  requiredTests: string[];
  liveGate: string;
  retirementRule: string;
}

export interface WorkflowCompilerPromptRetirementRuleSummary {
  id: string;
  owner: WorkflowCompilerPromptRuleOwner;
  source: WorkflowCompilerPromptRuleSource;
  risk: WorkflowCompilerPromptRule["risk"];
  summary: string;
  migrationBlockers: string[];
  validatorRefs: string[];
}

export interface WorkflowCompilerPromptRetirementReport {
  schemaVersion: 1;
  totalRules: number;
  blockedRuleCount: number;
  retiredRuleCount: number;
  unblockedPromptRuleCount: number;
  blockedRules: WorkflowCompilerPromptRetirementRuleSummary[];
  retiredRules: WorkflowCompilerPromptRetirementRuleSummary[];
  unblockedPromptRules: WorkflowCompilerPromptRetirementRuleSummary[];
  blockerCountsByOwner: Record<WorkflowCompilerPromptRuleOwner, number>;
  blockerCountsBySource: Record<WorkflowCompilerPromptRuleSource, number>;
}

const extensionGuideEntries: WorkflowCompilerExtensionGuideEntry[] = [
  {
    kind: "capability",
    title: "Add request-scoped capability guidance",
    purpose: "Attach tool, connector, or Ambient CLI guidance to selected capabilities instead of global compiler prose.",
    primaryFiles: [
      "src/main/desktopToolRegistry.ts",
      "src/main/workflowCompilerService.ts",
      "src/main/workflowCompilerPromptInventory.ts",
      "src/main/workflowProgramCapabilityResolver.ts",
    ],
    requiredSteps: [
      "Add or update the capability descriptor with operation shape, permission boundary, and output contract.",
      "Add request-scoped guidance that renders only when the capability or connector is selected.",
      "Add a prompt inventory rule with owner capability and validator or migration evidence.",
      "Expose the capability module in compile audit so reviewers can see why it was included.",
    ],
    requiredTests: [
      "pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts",
      "pnpm exec vitest run src/main/workflowCompilerAbstractionRegression.test.ts",
    ],
    liveGate: "Run a tiny workflow that selects the capability and a control workflow that does not; the control compile must omit the capability module.",
    retirementRule: "Retire old global capability prose only after the request-scoped module and at least one validator or live dogfood gate cover the behavior.",
  },
  {
    kind: "recipe",
    title: "Add a typed workflow recipe",
    purpose: "Capture reusable workflow shapes as selectable recipes with examples, policy implications, and validator references.",
    primaryFiles: [
      "src/main/workflowCompilerRecipes.ts",
      "src/main/workflowCompilerService.ts",
      "src/main/workflowCompilerPromptInventory.ts",
      "src/renderer/src/workflowReviewUiModel.ts",
    ],
    requiredSteps: [
      "Define the recipe id, applicability tags, required node kinds, preferred node kinds, compatible capabilities, budget effects, and IR example.",
      "Add deterministic selection and rejection reasons so the compile audit explains why the recipe did or did not apply.",
      "Add policy implications and validator references for gates the recipe introduces.",
      "Update prompt inventory migration blockers when the recipe replaces legacy prompt text.",
    ],
    requiredTests: [
      "pnpm exec vitest run src/main/workflowCompilerRecipes.test.ts",
      "pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts",
    ],
    liveGate: "Run one tiny end-to-end workflow that selects the new recipe and reaches approval or final output with the recipe visible in Build/Review audit.",
    retirementRule: "Retire legacy recipe prose only after selected and rejected recipe evidence, validator refs, and a live end-to-end compile agree.",
  },
  {
    kind: "policy",
    title: "Add a conditional policy snippet",
    purpose: "Render safety, freshness, privacy, or permission guidance only when a request or selected capability needs it.",
    primaryFiles: [
      "src/main/workflowCompilerPromptInventory.ts",
      "src/main/workflowCompilerService.ts",
      "src/main/workflowProgramTypecheck.ts",
      "docs/workflow-compiler-prompt-rule-inventory.md",
    ],
    requiredSteps: [
      "Add a stable inventory id with owner policy and risk level.",
      "Write a narrow render predicate based on selected tools, selected connectors, and explicit request intent.",
      "Point validatorRefs at deterministic enforcement, or add a migrationBlocker that names the missing validator.",
      "Add prompt assembly tests that prove the policy appears only for matching requests.",
    ],
    requiredTests: [
      "pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts",
      "pnpm exec vitest run src/main/workflowCompilerAbstractionRegression.test.ts",
    ],
    liveGate: "Run a focused dogfood with matching and non-matching requests; the matching compile must show the policy id in compile audit.",
    retirementRule: "Policy prose can shrink only after deterministic validators enforce the dangerous edge, or a Phase gate records why live validation is sufficient.",
  },
  {
    kind: "validator",
    title: "Add deterministic compiler validation",
    purpose: "Move correctness from prompt text into parse, static validation, dry-run, codegen, or renderer review gates.",
    primaryFiles: [
      "src/main/workflowProgramTypecheck.ts",
      "src/main/workflowProgramDryRun.ts",
      "src/main/workflowCompilerService.ts",
      "src/shared/workflowProgramIr.ts",
    ],
    requiredSteps: [
      "Add the validation at the earliest deterministic boundary that has the required data.",
      "Return an actionable error with node id, field path, and the rule or validator id.",
      "Add validatorRefs to any prompt inventory rules now covered by the validator.",
      "Expose validator ids in compile audit so reviewers can trace prompt text back to enforcement.",
    ],
    requiredTests: [
      "pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts",
      "pnpm exec vitest run src/main/workflowProgramTypecheck.test.ts",
      "pnpm exec vitest run src/main/workflowCompilerAbstractionRegression.test.ts",
    ],
    liveGate: "Run a tiny workflow that would violate the validator without the new rule and confirm repair or a clear compile failure.",
    retirementRule: "Retire or narrow the corresponding prompt rule once validator coverage is in place and dogfood passes, rather than duplicating it forever.",
  },
];

const promptRuleOwners: WorkflowCompilerPromptRuleOwner[] = ["core", "runtime", "capability", "policy", "recipe", "validator", "retire"];
const promptRuleSources: WorkflowCompilerPromptRuleSource[] = [
  "stable_prefix",
  "policy_rules",
  "capability_section",
  "connector_section",
  "ambient_cli_section",
  "dynamic_context",
  "discovery_prompt",
  "repair_prompt",
];

export function workflowCompilerExtensionGuide(): WorkflowCompilerExtensionGuideEntry[] {
  return extensionGuideEntries.map((entry) => ({
    ...entry,
    primaryFiles: [...entry.primaryFiles],
    requiredSteps: [...entry.requiredSteps],
    requiredTests: [...entry.requiredTests],
  }));
}

export function workflowCompilerPromptRetirementReport(
  rules: WorkflowCompilerPromptRule[] = workflowCompilerPromptRuleInventory(),
): WorkflowCompilerPromptRetirementReport {
  const blockedRules = rules.filter((rule) => rule.migrationBlockers.length > 0).map(promptRetirementRuleSummary);
  const retiredRules = rules.filter((rule) => rule.owner === "retire").map(promptRetirementRuleSummary);
  const unblockedPromptRules = rules
    .filter((rule) => rule.owner !== "retire" && rule.migrationBlockers.length === 0 && shouldTrackAsRetirementCandidate(rule))
    .map(promptRetirementRuleSummary);

  return {
    schemaVersion: 1,
    totalRules: rules.length,
    blockedRuleCount: blockedRules.length,
    retiredRuleCount: retiredRules.length,
    unblockedPromptRuleCount: unblockedPromptRules.length,
    blockedRules,
    retiredRules,
    unblockedPromptRules,
    blockerCountsByOwner: countBlockedRulesByOwner(blockedRules),
    blockerCountsBySource: countBlockedRulesBySource(blockedRules),
  };
}

function shouldTrackAsRetirementCandidate(rule: WorkflowCompilerPromptRule): boolean {
  return rule.source === "stable_prefix" || rule.source === "policy_rules";
}

function promptRetirementRuleSummary(rule: WorkflowCompilerPromptRule): WorkflowCompilerPromptRetirementRuleSummary {
  return {
    id: rule.id,
    owner: rule.owner,
    source: rule.source,
    risk: rule.risk,
    summary: rule.summary,
    migrationBlockers: [...rule.migrationBlockers],
    validatorRefs: [...rule.validatorRefs],
  };
}

function countBlockedRulesByOwner(rules: WorkflowCompilerPromptRetirementRuleSummary[]): Record<WorkflowCompilerPromptRuleOwner, number> {
  const counts = Object.fromEntries(promptRuleOwners.map((owner) => [owner, 0])) as Record<WorkflowCompilerPromptRuleOwner, number>;
  for (const rule of rules) counts[rule.owner] += 1;
  return counts;
}

function countBlockedRulesBySource(rules: WorkflowCompilerPromptRetirementRuleSummary[]): Record<WorkflowCompilerPromptRuleSource, number> {
  const counts = Object.fromEntries(promptRuleSources.map((source) => [source, 0])) as Record<WorkflowCompilerPromptRuleSource, number>;
  for (const rule of rules) counts[rule.source] += 1;
  return counts;
}
