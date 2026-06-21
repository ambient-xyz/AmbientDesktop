# Simplification Validation Map

Use this map while executing `simplificationPlanV4.html` phase by phase. Pick the smallest validation set that covers the files changed, then add live checks only when a real Ambient/Pi or provider loop is affected. The active plan and release-gate index lives in `docs/active-plan-index.md`.

Provider note, 2026-06-16: GLM 5.1 is currently degraded. Current live Ambient/Pi validation must use the Ambient provider with Kimi (`AMBIENT_PROVIDER=ambient` and `AMBIENT_LIVE_MODEL=<model>`). Do not use GLM 5.1 or GMI Cloud for operative simplification validation unless a future plan explicitly supersedes this note.

## Baseline Safety Rails

- IPC contract parity: `pnpm run test:simplification-phase0`
- Complexity inventory: `pnpm run complexity:inventory -- --limit=20`
- TypeScript changes: `pnpm run typecheck`

## Domain Validation

| Change area | Local validation | Live/provider validation |
| --- | --- | --- |
| Renderer extraction | Targeted renderer Vitest, then `pnpm run test:ui-model` when layout or interaction surfaces move. | Only run live UI dogfood when the moved surface starts, steers, or resumes a provider-backed run. |
| Main IPC split | `pnpm run test:simplification-phase0` plus focused tests for the moved domain. | Use Ambient+Kimi only for channels that start live Ambient/Pi work; mark Ambient+Kimi unavailability as blocked. |
| ProjectStore helper extraction | `pnpm exec vitest run src/main/projectStore.test.ts` plus affected project-board import/export tests. | Run the smallest project-board live smoke only when persisted planner/session state changes. |
| AgentRuntime tool extraction | `pnpm exec vitest run src/main/agentRuntime.test.ts src/main/piSessionToolActivation.test.ts src/main/workflowToolBridge.test.ts` as applicable. | Use Ambient+Kimi for affected provider/tool-loop smoke tests. |
| Project-board prompt contract consolidation | `pnpm exec vitest run src/main/projectBoardSynthesisProvider.test.ts src/main/projectBoardPlanningContract.test.ts src/main/projectBoardProofScope.test.ts`. | Use the smallest Ambient+Kimi project-board planner smoke that exercises the changed prompt path. |
| Workflow compiler prompt or runtime changes | Focused workflow compiler/runtime tests for the touched module. | Prefer Ambient+Kimi live workflow tests while GLM 5.1 degradation guidance is active. |

## Guardrails

- Preserve unrelated local changes.
- Do not expose or print local API keys, credential files, or snapshot secrets.
- Do not add or modify `.github/workflows` for simplification validation.
- Keep provider-specific behavior in adapters or descriptors; do not widen global prompts to fix local contract problems.
