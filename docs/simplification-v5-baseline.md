# Simplification V5 Baseline

Generated from latest `main` at the start of V5 implementation.

## Current Signals

| Signal | Count |
| --- | ---: |
| Source files | 4,669 |
| Flat `src/main` files | 4 |
| Nested `src/main` files | 3,307 |
| Direct `shared/types` importers | 0 |
| Relative import cycles | 83 |
| Import-boundary edges | 395 |
| Hard boundary violations | 0 |
| Package scripts | 376 |
| Package `test:*` scripts | 306 |
| Tracked root docs | 170 |
| Files at or above 800 lines | 289 |

## Import Cycle Triage

| Owner | Cycles |
| --- | ---: |
| `renderer/src` | 27 |
| `main/mcp` | 9 |
| `main/projectStore` | 5 |
| `main/tool-runtime` | 5 |
| `main/browser` | 4 |
| `main/agent-runtime` | 3 |
| `main/ambient-cli` | 3 |
| `main/ipc` | 3 |
| `main/workflow` | 3 |
| `main/workflow-compiler` | 3 |
| `shared/agentMemoryDiagnostics.ts` | 3 |
| `main/callable-workflow` | 2 |
| `main/capability-builder` | 2 |
| `main/local-runtime` | 2 |
| `shared/automationTypes.ts` | 2 |
| `shared/subagentPatternGraph.ts` | 2 |
| `main/local-deep-research` | 1 |
| `main/messaging` | 1 |
| `main/permissions` | 1 |
| `main/workflow-program` | 1 |
| `shared/desktopTypes.ts` | 1 |

## Guardrail Check Status

The current V3 guardrail baseline was not rewritten during Phase 0 because a full refresh would raise unrelated size and lint ceilings. The V5 work adds repo-surface and cycle-triage visibility on top of the existing guardrail machinery, while preserving the old baseline for later ratcheting.

`pnpm run simplification:v3:guardrails:check` currently reports pre-V5 drift on latest `main`: one new import-boundary edge, several large-file/hotspot ceiling increases, and lint warning increases. V5 implementation should reduce the V5-targeted signals without weakening those existing guardrails.
