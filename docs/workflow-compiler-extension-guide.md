# Workflow Compiler Extension Guide

This is the Phase 8 executable extension path for the Workflow Agent compiler. The source of truth lives in `src/main/workflowCompilerExtensionGuide.ts`; this document is the human checklist for adding workflow capability without growing the always-on compiler prompt.

## Extension Lanes

### `capability`: Add request-scoped capability guidance

Purpose: attach tool, connector, or Ambient CLI guidance to selected capabilities instead of global compiler prose.

Primary files:

- `src/main/desktopToolRegistry.ts`
- `src/main/workflowCompilerService.ts`
- `src/main/workflowCompilerPromptInventory.ts`
- `src/main/workflowProgramCapabilityResolver.ts`

Required steps:

- Add or update the capability descriptor with operation shape, permission boundary, and output contract.
- Add request-scoped guidance that renders only when the capability or connector is selected.
- Add a prompt inventory rule with owner `capability` and validator or migration evidence.
- Expose the capability module in compile audit so reviewers can see why it was included.

Required tests:

- `pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts`
- `pnpm exec vitest run src/main/workflowCompilerAbstractionRegression.test.ts`

Live gate: run a tiny workflow that selects the capability and a control workflow that does not; the control compile must omit the capability module.

Retirement rule: retire old global capability prose only after the request-scoped module and at least one validator or live dogfood gate cover the behavior.

### `recipe`: Add a typed workflow recipe

Purpose: capture reusable workflow shapes as selectable recipes with examples, policy implications, and validator references.

Primary files:

- `src/main/workflowCompilerRecipes.ts`
- `src/main/workflowCompilerService.ts`
- `src/main/workflowCompilerPromptInventory.ts`
- `src/renderer/src/workflowReviewUiModel.ts`

Required steps:

- Define the recipe id, applicability tags, required node kinds, preferred node kinds, compatible capabilities, budget effects, and IR example.
- Add deterministic selection and rejection reasons so the compile audit explains why the recipe did or did not apply.
- Add policy implications and validator references for gates the recipe introduces.
- Update prompt inventory migration blockers when the recipe replaces legacy prompt text.

Required tests:

- `pnpm exec vitest run src/main/workflowCompilerRecipes.test.ts`
- `pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts`

Live gate: run one tiny end-to-end workflow that selects the new recipe and reaches approval or final output with the recipe visible in Build/Review audit.

Retirement rule: retire legacy recipe prose only after selected and rejected recipe evidence, validator refs, and a live end-to-end compile agree.

### `policy`: Add a conditional policy snippet

Purpose: render safety, freshness, privacy, or permission guidance only when a request or selected capability needs it.

Primary files:

- `src/main/workflowCompilerPromptInventory.ts`
- `src/main/workflowCompilerService.ts`
- `src/main/workflowProgramTypecheck.ts`
- `docs/workflow-compiler-prompt-rule-inventory.md`

Required steps:

- Add a stable inventory id with owner `policy` and risk level.
- Write a narrow render predicate based on selected tools, selected connectors, and explicit request intent.
- Point `validatorRefs` at deterministic enforcement, or add a `migrationBlocker` that names the missing validator.
- Add prompt assembly tests that prove the policy appears only for matching requests.

Required tests:

- `pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts`
- `pnpm exec vitest run src/main/workflowCompilerAbstractionRegression.test.ts`

Live gate: run a focused dogfood with matching and non-matching requests; the matching compile must show the policy id in compile audit.

Retirement rule: policy prose can shrink only after deterministic validators enforce the dangerous edge, or a Phase gate records why live validation is sufficient.

### `validator`: Add deterministic compiler validation

Purpose: move correctness from prompt text into parse, static validation, dry-run, codegen, or renderer review gates.

Primary files:

- `src/main/workflowProgramTypecheck.ts`
- `src/main/workflowProgramDryRun.ts`
- `src/main/workflowCompilerService.ts`
- `src/shared/workflowProgramIr.ts`

Required steps:

- Add the validation at the earliest deterministic boundary that has the required data.
- Return an actionable error with node id, field path, and the rule or validator id.
- Add `validatorRefs` to any prompt inventory rules now covered by the validator.
- Expose validator ids in compile audit so reviewers can trace prompt text back to enforcement.

Required tests:

- `pnpm exec vitest run src/main/workflowCompilerPromptInventory.test.ts`
- `pnpm exec vitest run src/main/workflowProgramTypecheck.test.ts`
- `pnpm exec vitest run src/main/workflowCompilerAbstractionRegression.test.ts`

Live gate: run a tiny workflow that would violate the validator without the new rule and confirm repair or a clear compile failure.

Retirement rule: retire or narrow the corresponding prompt rule once validator coverage is in place and dogfood passes, rather than duplicating it forever.

## Retiring Prompt Text

Every prompt rule that still has `migrationBlockers` is intentionally blocked from deletion. Use `workflowCompilerPromptRetirementReport()` to count blocked rules by owner and source before a cleanup slice, then update `migrationBlockers` only when the replacement module, validator, and live gate are in place.

Rules marked owner `retire` are not product guidance. They may remain in inventory temporarily for audit history, but they should not be rendered into active compiler prompts.
