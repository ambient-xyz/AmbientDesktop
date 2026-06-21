# Active Plan Index

Use this index to find the current plan of record, archived predecessor plans, and the validation entry points that should be considered first during simplification work.

## Active Artifacts

| Artifact | Status | Use |
| --- | --- | --- |
| [`simplificationPlanV4.html`](../simplificationPlanV4.html) | Active plan of record | Execute this phase by phase. Keep only the active phase progress summary current. |
| [`simplificationV3.html`](../simplificationV3.html) | Completed predecessor | Use as closeout evidence for V4 baselines, remaining hotspots, and provider/guardrail policy. |
| [`Agents.md`](../Agents.md) | Operative repo instructions | Provider policy, secret handling, harness rules, and guardrail expectations. |
| [`docs/simplification-validation-map.md`](simplification-validation-map.md) | Validation map | Domain-oriented local and live validation guidance for simplification work. |
| [`scripts/validation-script-inventory.mjs`](../scripts/validation-script-inventory.mjs) | Validation script index | Generates `pnpm run validation:inventory` and `pnpm run validation:recommend` output from `package.json`. |

## Archived Simplification Plans

| Artifact | Status | Notes |
| --- | --- | --- |
| [`docs/archive/simplificationPlan-2026-06-19.html`](archive/simplificationPlan-2026-06-19.html) | Superseded | Original simplification plan, retained for history. |
| [`docs/archive/simplificationV2-2026-06-19.html`](archive/simplificationV2-2026-06-19.html) | Superseded | V2 plan, retained for history after V3 became operative. |

## First Validation Entry Points

| Need | First command |
| --- | --- |
| Pick local validation for a touched domain | `pnpm run validation:recommend -- --domain <domain>` |
| Inspect validation script inventory | `pnpm run validation:inventory` |
| Check validation script inventory | `pnpm run validation:inventory:check` |
| Check V3 guardrail ratchets | `pnpm run simplification:v3:guardrails:check` |
| Check V3 scorecard | `pnpm run simplification:v3:scorecard:check` |
| Parse the active HTML plan | `python3 -m html.parser simplificationPlanV4.html` |

## Release Gates

| Area | Gate |
| --- | --- |
| IPC simplification baseline | `pnpm run test:simplification-phase0` |
| Desktop release gate | `pnpm run test:desktop-release-gate` |
| Subagents/workflows | `pnpm run test:subagents:release-gate` |
| MCP default runtime | `pnpm run test:mcp-default-runtime-release-gate` |
| Project board Phase 8 | `pnpm run test:project-board-release-gate:phase8` |

Provider-dependent validation follows `Agents.md`: while GLM 5.1 is degraded, use Ambient with Kimi (`AMBIENT_PROVIDER=ambient`, `AMBIENT_LIVE_MODEL=moonshotai/kimi-k2.7-code`). Treat GMI Cloud as explicit-request or approved-failover inventory only.
