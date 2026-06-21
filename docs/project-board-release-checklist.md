# Project Board Release Checklist

Use this checklist when a change touches project-board planning, card execution, proof review, collaboration state, or release-critical UI. The goal is to make an intentional ship decision without rediscovering the live dogfood sequence.

## Quick Gate

Run the combined Phase 8 gate first:

```bash
pnpm run test:project-board-release-gate:phase8
```

Expected artifact:

- `test-results/project-board-release-matrix/latest-phase8.json`

This command reads the latest provider and worker matrix artifacts, checks the combined release criteria, and writes one pass/attention report. It is the default gate for docs-only changes, narrow UI copy changes, and follow-up work that does not alter provider prompts, board synthesis, Local Task execution, or worker proof handling.

The combined report includes a `freshness` section. Freshness warnings are advisory by default so archived live artifacts can still support docs-only checks. For a strict release sweep, require a clean source tree and live matrix artifacts from the current git head:

```bash
pnpm run test:project-board-release-gate:phase8-strict
```

To also enforce a maximum artifact age:

```bash
pnpm run test:project-board-release-gate:phase8-strict-24h
```

## Live Matrix Rerun Policy

Rerun the provider matrix when a change touches source classification, source scanning, board charter prompts, planning profiles, synthesis schemas, progressive records, Add Cards, timeout semantics, or provider reasoning/streaming behavior:

```bash
AMBIENT_API_KEY_FILE=/Users/Neo/Documents/ambientCoder/ambient_api_key.txt \
  pnpm run test:project-board-release-matrix:live
```

Rerun the worker matrix when a change touches Local Task ticketization, worker prompts, task-action parsing, card-session reuse, proof review, runtime-budget close policy, follow-up candidates, handoffs, claims, leases, or execution-state projection:

```bash
AMBIENT_API_KEY_FILE=/Users/Neo/Documents/ambientCoder/ambient_api_key.txt \
  pnpm run test:project-board-release-matrix:worker-live
```

For release sweeps, or when both planning and execution behavior changed, rerun both live matrices and regenerate the combined report:

```bash
AMBIENT_API_KEY_FILE=/Users/Neo/Documents/ambientCoder/ambient_api_key.txt \
  pnpm run test:project-board-release-gate:phase8-live
```

To require the freshly generated live artifacts to match the current git head:

```bash
AMBIENT_API_KEY_FILE=/Users/Neo/Documents/ambientCoder/ambient_api_key.txt \
  pnpm run test:project-board-release-gate:phase8-live-strict
```

Do not rerun expensive live matrices by default after documentation-only, test-harness-only, or purely presentational changes unless the latest artifacts are stale for the behavior under review.

## Expected Artifacts

- `test-results/project-board-release-matrix/latest.json`: provider planning matrix.
- `test-results/project-board-release-matrix/latest-worker.json`: app-boundary worker matrix.
- `test-results/project-board-release-matrix/latest-phase8.json`: combined release-gate report.
- `test-results/project-board-dogfood/runs/*`: detailed app-boundary dogfood run artifacts.
- `test-results/project-board-dogfood/latest.json`: latest focused dogfood pointer when the worker harness produced one.

The `test-results` directory is evidence, not source. It should remain ignored unless a specific fixture is intentionally promoted.

## Pass Criteria

Provider matrix should show:

- all required scenarios completed;
- every emitted card has proof expectations;
- duplicate title count is `0`;
- provider timeout observed is `false`;
- no provider error or timeout records.

Worker matrix should show:

- task-action protocol observed;
- proof-action integrity issue count is `0`;
- PM proof review completed;
- product runtime-budget closure observed when runtime budgets are part of the scenario;
- runtime splits create actionable follow-up state;
- no provider timeout.

Combined gate should show:

- `blockingIssues` is empty;
- provider and worker reports are from the intended run window;
- advisory warnings are understood before release.
- `freshness.status` is `passed` for strict release sweeps, or `passed_with_advisories` only when the reviewer intentionally accepts archived artifacts.

Current advisory warning codes such as `external_dependency` and `proof_scope_mismatch` are not default blockers. They become blockers only when the board charter/profile uses a strict quality policy or when a warned card is ticketized without durable acknowledgement.

## Triage

- Provider gate failure usually means a source classification, prompt contract, schema, progressive planning, or timeout regression.
- Worker gate failure usually means a Local Task bridge, worker prompt, task-action parser, proof review, runtime-close, follow-up, or projection regression.
- Combined gate `attention` means inspect `blockingIssues` first, then rerun only the matrix that is stale or failing.
- Freshness advisories mean the archived matrix artifacts are green but may not correspond to the current source head; rerun the affected live matrix when behavior changed.
- Missing artifacts mean run the relevant live matrix before making a release decision.

## Security

Use `ambient_api_key.txt` through `AMBIENT_API_KEY_FILE`. Do not paste API keys into prompts, command output, committed files, artifacts, or logs.
