import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import {
  workflowCompilerExtensionGuide,
  workflowCompilerPromptRetirementReport,
  type WorkflowCompilerExtensionKind,
} from "./workflowCompilerExtensionGuide";
import { buildWorkflowProgramIrPromptParts } from "./workflowCompilerService";
import { fixtureWorkflowConnector } from "../workflowConnectors";
import {
  buildWorkflowCompilerPolicyPromptRules,
  workflowCompilerPromptRuleInventory,
} from "./workflowCompilerPromptInventory";

const allToolDescriptors = firstPartyDesktopToolDescriptors();

function selectedTools(names: string[]) {
  const wanted = new Set(names);
  const tools = allToolDescriptors.filter((tool) => wanted.has(tool.name));
  expect(tools.map((tool) => tool.name).sort()).toEqual([...wanted].sort());
  return tools;
}

function connectorDescriptor(id: string) {
  const fixture = fixtureWorkflowConnector().descriptor;
  return {
    ...fixture,
    id,
    label: id,
    description: `${id} test connector`,
  };
}

describe("workflow compiler prompt rule inventory", () => {
  it("classifies prompt rules with stable ids, owners, risks, and migration evidence", () => {
    const inventory = workflowCompilerPromptRuleInventory();
    const ids = inventory.map((rule) => rule.id);
    const owners = new Set(inventory.map((rule) => rule.owner));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    expect(ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
    expect([...owners].sort()).toEqual(expect.arrayContaining(["capability", "core", "retire", "runtime", "validator"]));
    expect(inventory.every((rule) => rule.summary.trim().length > 12)).toBe(true);
    expect(inventory.every((rule) => rule.text.trim().length > 0)).toBe(true);

    const highRiskRules = inventory.filter((rule) => rule.risk === "high");
    expect(highRiskRules.length).toBeGreaterThan(10);
    expect(highRiskRules.every((rule) => rule.validatorRefs.length > 0 || rule.migrationBlockers.length > 0)).toBe(true);
  });

  it("keeps the human inventory document in sync with executable rule ids", () => {
    const doc = readFileSync(join(process.cwd(), "docs/workflow-compiler-prompt-rule-inventory.md"), "utf8");

    for (const rule of workflowCompilerPromptRuleInventory()) {
      expect(doc, `Missing prompt inventory doc row for ${rule.id}`).toContain(`\`${rule.id}\``);
    }
  });

  it("keeps the extension guide executable and documented", () => {
    const doc = readFileSync(join(process.cwd(), "docs/workflow-compiler-extension-guide.md"), "utf8");
    const guide = workflowCompilerExtensionGuide();
    const kinds = guide.map((entry) => entry.kind).sort();
    const expectedKinds: WorkflowCompilerExtensionKind[] = ["capability", "policy", "recipe", "validator"];

    expect(kinds).toEqual(expectedKinds);
    expect(new Set(kinds).size).toBe(kinds.length);

    for (const entry of guide) {
      expect(doc, `Missing extension guide section for ${entry.kind}`).toContain(`\`${entry.kind}\``);
      expect(entry.title.trim().length).toBeGreaterThan(12);
      expect(entry.purpose.trim().length).toBeGreaterThan(20);
      expect(entry.primaryFiles.length).toBeGreaterThanOrEqual(3);
      expect(entry.requiredSteps.length).toBeGreaterThanOrEqual(3);
      expect(entry.requiredTests.some((command) => command.includes("workflowCompilerPromptInventory.test.ts"))).toBe(true);
      expect(entry.liveGate).toMatch(/\btiny\b|\bdogfood\b|\bworkflow\b/i);
      expect(entry.retirementRule).toMatch(/\bretire\b|\bRetire\b|\bshrink\b/);
      for (const filePath of entry.primaryFiles) {
        expect(doc, `Missing documented primary file for ${entry.kind}: ${filePath}`).toContain(`\`${filePath}\``);
        expect(existsSync(join(process.cwd(), filePath)), `Extension guide primary file does not exist: ${filePath}`).toBe(true);
      }
      for (const command of entry.requiredTests) {
        expect(doc, `Missing documented required test for ${entry.kind}: ${command}`).toContain(`\`${command}\``);
      }
    }
  });

  it("reports Phase 8 prompt retirement blockers by owner and source", () => {
    const report = workflowCompilerPromptRetirementReport();
    const inventory = workflowCompilerPromptRuleInventory();
    const blockedIds = report.blockedRules.map((rule) => rule.id);
    const retiredIds = report.retiredRules.map((rule) => rule.id);

    expect(report.schemaVersion).toBe(1);
    expect(report.totalRules).toBe(inventory.length);
    expect(report.blockedRuleCount).toBe(report.blockedRules.length);
    expect(report.retiredRuleCount).toBe(report.retiredRules.length);
    expect(report.unblockedPromptRuleCount).toBe(report.unblockedPromptRules.length);
    expect(blockedIds).toEqual([]);
    expect(blockedIds).not.toContain("recipe-gmail-metadata-first-detail-gate");
    expect(blockedIds).not.toContain("policy-current-data-evidence");
    expect(blockedIds).not.toContain("recipe-movie-night-current-showtimes");
    expect(blockedIds).not.toContain("policy-google-workspace-read-only-methods");
    expect(blockedIds).not.toContain("policy-google-workspace-account-time-window");
    expect(blockedIds).not.toContain("validator-google-workspace-read-payload-ban");
    expect(blockedIds).not.toContain("recipe-large-collection-pattern");
    expect(blockedIds).not.toContain("runtime-recovery-fanout-contract");
    expect(blockedIds).not.toContain("recipe-source-quality-dedupe");
    expect(blockedIds).not.toContain("capability-long-context-static-enforcement");
    expect(blockedIds).not.toContain("capability-long-context-preprocess");
    expect(blockedIds).not.toContain("policy-long-context-preserve-source-outputs");
    expect(blockedIds).not.toContain("recipe-google-transcript-action-items");
    expect(blockedIds).not.toContain("capability-local-directory-skipped-metadata");
    expect(blockedIds).not.toContain("capability-visual-loop-map-tool-call-shape");
    expect(blockedIds).not.toContain("capability-visual-analysis-required");
    expect(blockedIds).not.toContain("capability-visual-fanout");
    expect(blockedIds).not.toContain("capability-visual-model-role");
    expect(blockedIds).not.toContain("capability-ambient-cli-describe-before-run");
    expect(blockedIds).not.toContain("policy-ambient-cli-missing-env-setup");
    expect(blockedIds).not.toContain("policy-ambient-cli-secret-redaction");
    expect(blockedIds).not.toContain("capability-browser-user-action-intervention");
    expect(blockedIds).not.toContain("capability-browser-login-intervention");
    expect(blockedIds).not.toContain("runtime-browser-lower-level-handoff");
    expect(blockedIds).not.toContain("capability-browser-default-wait-behavior");
    expect(blockedIds).not.toContain("runtime-browser-user-action-resume");
    expect(blockedIds).not.toContain("capability-browser-recovery-provenance");
    expect(blockedIds).not.toContain("runtime-local-file-output-as-mutation-stage");
    expect(blockedIds).not.toContain("validator-file-write-availability");
    expect(blockedIds).not.toContain("validator-budget-static-minimum");
    expect(blockedIds).not.toContain("validator-large-budget-ceiling");
    expect(retiredIds).toEqual(
      expect.arrayContaining([
        "policy-google-workspace-read-only-methods",
        "policy-google-workspace-account-time-window",
        "validator-google-workspace-read-payload-ban",
        "recipe-large-collection-pattern",
        "runtime-recovery-fanout-contract",
        "recipe-source-quality-dedupe",
        "capability-long-context-static-enforcement",
        "capability-long-context-preprocess",
        "policy-long-context-preserve-source-outputs",
        "recipe-google-transcript-action-items",
        "capability-local-directory-skipped-metadata",
        "capability-visual-loop-map-tool-call-shape",
        "capability-visual-analysis-required",
        "capability-visual-fanout",
        "capability-visual-model-role",
        "capability-ambient-cli-describe-before-run",
        "policy-ambient-cli-missing-env-setup",
        "policy-ambient-cli-secret-redaction",
        "capability-browser-user-action-intervention",
        "capability-browser-login-intervention",
        "runtime-browser-lower-level-handoff",
        "capability-browser-default-wait-behavior",
        "runtime-browser-user-action-resume",
        "capability-browser-recovery-provenance",
        "runtime-local-file-output-as-mutation-stage",
        "validator-file-write-availability",
        "validator-budget-static-minimum",
        "validator-large-budget-ceiling",
        "recipe-movie-night-current-showtimes",
        "recipe-gmail-metadata-first-detail-gate",
        "policy-current-data-evidence",
      ]),
    );
    expect(report.blockerCountsByOwner.policy ?? 0).toBe(0);
    expect(report.blockerCountsByOwner.recipe ?? 0).toBe(0);
    expect(report.blockerCountsByOwner.capability ?? 0).toBe(0);
    expect(report.blockerCountsBySource.stable_prefix).toBe(0);
    expect(report.blockerCountsBySource.policy_rules ?? 0).toBe(0);
    expect(report.blockedRules.every((rule) => rule.migrationBlockers.length > 0)).toBe(true);
    expect(report.retiredRules.every((rule) => rule.owner === "retire")).toBe(true);
    expect(report.unblockedPromptRules.every((rule) => rule.owner !== "retire" && rule.migrationBlockers.length === 0)).toBe(true);
  });

  it("uses the executable policy inventory to assemble the current compiler prompt rules", () => {
    const tools = selectedTools([
      "ambient_cli",
      "ambient_cli_describe",
      "ambient_cli_env_bind",
      "ambient_cli_secret_request",
      "ambient_visual_analyze",
      "browser_content",
      "browser_search",
      "file_write",
      "google_workspace_call",
      "google_workspace_materialize_file",
      "google_workspace_status",
      "local_directory_list",
      "long_context_process",
    ]);
    const connectors = [connectorDescriptor("google.drive"), connectorDescriptor("google.calendar"), connectorDescriptor("google.gmail")];
    const promptParts = buildWorkflowProgramIrPromptParts({
      userRequest: "Create a compact Google Meet transcript action-item and Gmail triage workflow.",
      workspaceSummary: "Workflow prompt inventory test.",
      toolDescriptors: tools,
      connectorDescriptors: connectors,
    });
    const prompt = promptParts.prompt;
    const moduleIds = promptParts.promptAssembly.modules.map((module) => module.id);
    const selectedToolNames = new Set(tools.map((tool) => tool.name));
    const selectedConnectorIds = new Set(connectors.map((connector) => connector.id));
    const policyRules = buildWorkflowCompilerPolicyPromptRules({
      selectedToolNames,
      selectedConnectorIds,
      userRequest: "Create a compact Google Meet transcript action-item and Gmail triage workflow.",
    });

    expect(policyRules).toEqual([]);
    expect(policyRules.map((rule) => rule.id)).not.toContain("recipe-gmail-metadata-first-detail-gate");
    expect(policyRules.map((rule) => rule.id)).not.toContain("policy-current-data-evidence");
    expect(policyRules.map((rule) => rule.id)).not.toContain("runtime-local-file-output-as-mutation-stage");
    expect(policyRules.map((rule) => rule.id)).not.toContain("validator-file-write-availability");
    expect(policyRules.map((rule) => rule.id)).not.toContain("validator-budget-static-minimum");
    expect(policyRules.map((rule) => rule.id)).not.toContain("validator-large-budget-ceiling");
    expect(policyRules.map((rule) => rule.id)).not.toContain("policy-google-workspace-read-only-methods");
    expect(policyRules.map((rule) => rule.id)).not.toContain("policy-google-workspace-account-time-window");
    expect(policyRules.map((rule) => rule.id)).not.toContain("validator-google-workspace-read-payload-ban");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-local-directory-skipped-metadata");
    expect(policyRules.map((rule) => rule.id)).not.toContain("recipe-google-transcript-action-items");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-long-context-static-enforcement");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-long-context-preprocess");
    expect(policyRules.map((rule) => rule.id)).not.toContain("policy-long-context-preserve-source-outputs");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-visual-loop-map-tool-call-shape");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-visual-analysis-required");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-visual-fanout");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-visual-model-role");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-ambient-cli-describe-before-run");
    expect(policyRules.map((rule) => rule.id)).not.toContain("policy-ambient-cli-missing-env-setup");
    expect(policyRules.map((rule) => rule.id)).not.toContain("policy-ambient-cli-secret-redaction");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-browser-user-action-intervention");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-browser-login-intervention");
    expect(policyRules.map((rule) => rule.id)).not.toContain("runtime-browser-lower-level-handoff");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-browser-default-wait-behavior");
    expect(policyRules.map((rule) => rule.id)).not.toContain("runtime-browser-user-action-resume");
    expect(policyRules.map((rule) => rule.id)).not.toContain("capability-browser-recovery-provenance");
    expect(moduleIds).toContain("capability-guidance-ambient-cli-describe-before-run");
    expect(moduleIds).toContain("capability-guidance-ambient-cli-missing-env-setup");
    expect(moduleIds).toContain("capability-guidance-ambient-cli-secret-redaction");
    expect(moduleIds).toContain("recipe-google_meeting_transcript_action_items");
    expect(moduleIds).toContain("capability-guidance-google-workspace-read-only-method-policy");
    expect(moduleIds).toContain("capability-guidance-long-context-preprocess");
    expect(moduleIds).toContain("capability-guidance-local-directory-skipped-metadata");
    expect(moduleIds).toContain("capability-guidance-visual-analysis-required");
    expect(moduleIds).toContain("capability-guidance-visual-loop-map-tool-call-shape");
    expect(moduleIds).toContain("capability-guidance-visual-model-role");
    expect(moduleIds).toContain("capability-guidance-file-write-staged-mutation");
    expect(moduleIds).toContain("recipe-metadata_first_personal_data_review");
    expect(prompt).toContain("Google Workspace workflow guidance");
    expect(prompt).toContain("sideEffect metadata_read or personal_content_read");
    expect(prompt).toContain("Calendar list/freebusy calls must include timeMin, timeMax, and timeZone");
    expect(prompt).toContain("google.read_only_payload_rejected");
    expect(prompt).toContain("Long-context workflow guidance");
    expect(prompt).toContain("Local-directory workflow guidance");
    expect(prompt).toContain("Visual-analysis workflow guidance");
    expect(prompt).toContain("Ambient CLI workflow guidance");
    expect(prompt).toContain("Ambient CLI missing-env workflow guidance");
    expect(prompt).toContain("Ambient CLI secret workflow guidance");
    expect(prompt).toContain("File write workflow guidance");
    expect(prompt).toContain("ambient_cli.secret_value_rejected");
    expect(prompt).toContain('{"fromHandle":"listImages.entries"}');
    expect(prompt).toContain("Recipe google_meeting_transcript_action_items");
    expect(prompt).toContain("google.calendar listEvents");
    expect(prompt).toContain("google.drive search");
    expect(prompt).toContain('{"id":{"fromItem":"file","path":"id"}}');
    expect(prompt).toContain('exportMimeType:"text/plain"');
    expect(prompt).toContain("maxContentChars:4000");
    expect(prompt).toContain("never use bare field-name strings");
    expect(prompt).not.toContain("Google transcript action-item pattern:");
    expect(prompt).not.toContain("Long-field enforcement:");
    expect(prompt).not.toContain("Long-context rule:");
    expect(prompt).not.toContain("Long-context preservation rule:");
    expect(prompt).not.toContain("Local directory skipped-metadata rule:");
    expect(prompt).not.toContain("Visual-analysis rule:");
    expect(prompt).not.toContain("Visual fan-out rule:");
    expect(prompt).not.toContain("Model-role rule:");
    expect(prompt).not.toContain("Ambient CLI execution must depend on a matching ambient_cli_describe node");
    expect(prompt).not.toContain("Ambient CLI missing-env rule:");
    expect(prompt).not.toContain("Ambient CLI secret rule:");
    expect(prompt).not.toContain("Google Workspace methods in this compiler path must be read-only");
    expect(prompt).not.toContain("Every google_workspace_call must carry accountHint");
    expect(prompt).not.toContain("Read-only google_workspace_call nodes must not include write payload fields");
    expect(prompt).not.toContain("If local file output is needed, represent file_write as mutation.stage nodes");
    expect(prompt).not.toContain("If file_write is not listed in Selected Desktop workflow capabilities");
    expect(prompt).not.toContain("Budget rule:");
    expect(prompt).not.toContain("Large-budget ceiling rule:");
    for (const rule of policyRules) {
      expect(rule.owner, `Retired rule ${rule.id} must not render in active compiler prompts`).not.toBe("retire");
      expect(prompt, `Compiler prompt omitted policy rule ${rule.id}`).toContain(rule.text);
    }
  });

  it("omits conditional capability guidance when the capability was not selected", () => {
    const selectedToolNames = new Set(["file_read"]);
    const ids = buildWorkflowCompilerPolicyPromptRules({ selectedToolNames }).map((rule) => rule.id);

    expect(ids).not.toContain("policy-google-workspace-read-only-methods");
    expect(ids).not.toContain("policy-google-workspace-account-time-window");
    expect(ids).not.toContain("validator-google-workspace-read-payload-ban");
    expect(ids).not.toContain("capability-local-directory-skipped-metadata");
    expect(ids).not.toContain("capability-visual-analysis-required");
    expect(ids).not.toContain("capability-long-context-preprocess");
    expect(ids).not.toContain("capability-browser-user-action-intervention");
    expect(ids).not.toContain("capability-browser-recovery-provenance");
    expect(ids).not.toContain("capability-ambient-cli-describe-before-run");
    expect(ids).not.toContain("policy-ambient-cli-missing-env-setup");
    expect(ids).not.toContain("policy-ambient-cli-secret-redaction");
    expect(ids).not.toContain("recipe-gmail-metadata-first-detail-gate");
    expect(ids).not.toContain("runtime-local-file-output-as-mutation-stage");
    expect(ids).not.toContain("validator-file-write-availability");
    expect(ids).not.toContain("validator-budget-static-minimum");
    expect(ids).not.toContain("validator-large-budget-ceiling");
  });

  it("assembles browser workflow guidance from selected capability descriptors", () => {
    const tools = selectedTools(["browser_nav", "browser_content"]);
    const selectedToolNames = new Set(tools.map((tool) => tool.name));
    const policyIds = buildWorkflowCompilerPolicyPromptRules({
      selectedToolNames,
      userRequest: "Read https://example.com and https://www.iana.org/help/example-domains with managed browser tools.",
    }).map((rule) => rule.id);
    const promptParts = buildWorkflowProgramIrPromptParts({
      userRequest: "Read https://example.com and https://www.iana.org/help/example-domains with managed browser tools.",
      workspaceSummary: "Workflow prompt browser module test.",
      toolDescriptors: tools,
      connectorDescriptors: [],
    });
    const moduleIds = promptParts.promptAssembly.modules.map((module) => module.id);
    const sourceProvenanceModule = promptParts.promptAssembly.modules.find((module) => module.id === "capability-guidance-browser-source-provenance");

    expect(policyIds).not.toContain("capability-browser-user-action-intervention");
    expect(policyIds).not.toContain("capability-browser-recovery-provenance");
    expect(moduleIds).toEqual(
      expect.arrayContaining([
        "capability-guidance-browser-default-wait-behavior",
        "capability-guidance-browser-source-provenance",
        "capability-guidance-browser-user-action-intervention",
        "capability-selected-desktop-tools",
      ]),
    );
    expect(sourceProvenanceModule?.ruleIds).toEqual(["browser-source-provenance"]);
    expect(sourceProvenanceModule?.selectedToolNames).toEqual(["browser_content", "browser_nav"]);
    expect(promptParts.prompt).toContain("Browser recovery provenance rule");
    expect(promptParts.prompt).not.toContain("Gmail metadata-first detail gate rule");
    expect(moduleIds.some((id) => ["gmail", "google-workspace", "visual-analysis"].some((fragment) => id.includes(fragment)))).toBe(false);
  });

  it("records a minimal prompt assembly without unrelated browser, Gmail, current-web, or visual modules", () => {
    const promptParts = buildWorkflowProgramIrPromptParts({
      userRequest: "Read the local project note with file_read, classify it, ask for review, then return the final card in the output.",
      workspaceSummary: "Workflow prompt module test.",
      toolDescriptors: selectedTools(["file_read"]),
      connectorDescriptors: [],
    });
    const moduleIds = promptParts.promptAssembly.modules.map((module) => module.id);
    const forbiddenFragments = ["browser", "gmail", "google-workspace", "current-data", "movie-night", "visual"];
    const exampleModule = promptParts.promptAssembly.modules.find((module) => module.id === "core-workflow-program-ir-example");

    expect(moduleIds).toEqual(expect.arrayContaining(["core-workflow-program-ir-semantics", "capability-selected-desktop-tools", "dynamic-user-request"]));
    expect(moduleIds).not.toContain("recipe-core-collection-and-recovery");
    expect(moduleIds.some((id) => forbiddenFragments.some((fragment) => id.includes(fragment)))).toBe(false);
    expect(exampleModule?.reason).toContain("compact neutral JSON shape");
    expect(exampleModule?.chars).toBeLessThan(1500);
    expect(promptParts.prompt).not.toContain("Browser recovery provenance rule");
    expect(promptParts.prompt).not.toContain("Gmail metadata-first detail gate rule");
    expect(promptParts.prompt).not.toContain("Visual-analysis rule");
    expect(promptParts.prompt).not.toContain("Scottsdale");
    expect(promptParts.prompt).not.toContain("read-gmail-pages");
    expect(promptParts.prompt).not.toContain("google.gmail");
    expect(promptParts.prompt).not.toContain("scottsdale-real-estate-research-report");
    expect(promptParts.prompt).not.toContain("Large collection pattern:");
    expect(promptParts.prompt).not.toContain("Recovery fan-out rule:");
    expect(promptParts.promptAssembly.total.moduleCount).toBe(promptParts.promptAssembly.modules.length);
    expect(promptParts.promptAssembly.modules.every((module) => module.reason.trim().length > 12 && module.chars > 0 && module.estimatedTokens > 0)).toBe(true);
  });

  it("assembles selected typed recipe modules for current web report exports", () => {
    const promptParts = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Create a current public web research report from 100 source candidates, render a PDF, and store it in the Documents folder.",
      workspaceSummary: "Workflow typed recipe module test.",
      toolDescriptors: selectedTools(["browser_search", "file_write"]),
      connectorDescriptors: [],
    });
    const moduleIds = promptParts.promptAssembly.modules.map((module) => module.id);
    const currentWebModule = promptParts.promptAssembly.modules.find((module) => module.id === "recipe-current_web_research");
    const exportModule = promptParts.promptAssembly.modules.find((module) => module.id === "recipe-staged_document_export");

    expect(promptParts.selectedRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["current_web_research", "large_collection_summarization", "staged_document_export"]),
    );
    expect(moduleIds).toEqual(
      expect.arrayContaining(["recipe-current_web_research", "recipe-large_collection_summarization", "recipe-staged_document_export"]),
    );
    expect(moduleIds).not.toContain("recipe-core-collection-and-recovery");
    expect(currentWebModule?.selectedRecipeIds).toEqual(["current_web_research"]);
    expect(exportModule?.selectedRecipeIds).toEqual(["staged_document_export"]);
    expect(promptParts.prompt).toContain("Recipe current_web_research");
    expect(promptParts.prompt).toContain('collection.dedupe strategy:"url_canonical"');
    expect(promptParts.prompt).toContain("Recipe staged_document_export");
    expect(promptParts.prompt).toContain("document.render");
    expect(promptParts.prompt).toContain("mutation.stage");
    expect(promptParts.prompt).toContain('"fromHandle":"searchSources.items"');
    expect(promptParts.prompt).toContain('"fromHandle":"dedupeSources.items"');
    expect(promptParts.prompt).toContain('"fromHandle":"render.artifactPath"');
    expect(promptParts.prompt).toContain('"fromHandle":"stageWrite.path"');
    expect(promptParts.prompt).toContain("use connector.paginate for connector pages or tool.paginate");
    expect(promptParts.prompt).not.toContain("Large collection pattern:");
    expect(promptParts.prompt).not.toContain("Source-quality rule:");
    expect(promptParts.prompt).not.toContain("Scottsdale");
    expect(promptParts.prompt).not.toContain("read-gmail-pages");
    expect(promptParts.prompt).not.toContain("google.gmail");
  });

  it("assembles movie-night current showtimes as a typed recipe instead of prompt policy prose", () => {
    const promptParts = buildWorkflowProgramIrPromptParts({
      userRequest: [
        "Recommend whether a couple in Scottsdale should go to a movie tonight.",
        "Use current public web evidence from browser_search for showtimes, currently playing movies, reviews, runtime, genre, and theater travel friction.",
        "Ask for preferences before the final go/no-go recommendation.",
      ].join(" "),
      workspaceSummary: "Workflow typed movie-night recipe module test.",
      toolDescriptors: selectedTools(["browser_search"]),
      connectorDescriptors: [],
    });
    const moduleIds = promptParts.promptAssembly.modules.map((module) => module.id);
    const movieModule = promptParts.promptAssembly.modules.find((module) => module.id === "recipe-movie_night_current_showtimes");

    expect(promptParts.selectedRecipes.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["current_web_research", "movie_night_current_showtimes", "large_collection_summarization"]),
    );
    expect(moduleIds).toEqual(
      expect.arrayContaining(["recipe-current_web_research", "recipe-movie_night_current_showtimes", "recipe-large_collection_summarization"]),
    );
    expect(movieModule?.selectedRecipeIds).toEqual(["movie_night_current_showtimes"]);
    expect(promptParts.prompt).toContain("Recipe movie_night_current_showtimes");
    expect(promptParts.prompt).toContain("review.input for the user's preference profile");
    expect(promptParts.prompt).toContain("Do not rely on model knowledge for current showtimes");
    expect(promptParts.prompt).not.toContain("Movie-night recommendation pattern:");
    expect(moduleIds).not.toContain("policy-recipe-movie-night-current-showtimes");
  });
});
