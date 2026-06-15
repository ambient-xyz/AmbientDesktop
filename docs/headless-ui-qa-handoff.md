# Headless UI QA Handoff

This brief explains the UI model harness added in this PR, how to run it, and how to triage the current findings.

## What This Adds

- A CDP/Electron UI model collector at `scripts/ui-model/collect-ui-model.mjs`.
- A local HTML report backend at `scripts/ui-model/report-server.mjs`.
- A harness README at `scripts/ui-model/README.md`.
- A longer rollout plan at `adoptMaxUIFixSuggestions.md`.
- Package scripts for core, strict, stress, all-scenario, self-test, and report-server workflows.

The harness is meant to catch layout and interaction issues quickly without making screenshots the first review artifact. It records DOM geometry, selected computed styles, accessibility nodes, DOMSnapshot data, tooltip samples, and classified violations.

## How To Run

Generate the default report:

```sh
pnpm run test:ui-model
```

Run the full deterministic suite:

```sh
pnpm run test:ui-model:all
```

Run strict mode:

```sh
pnpm run test:ui-model:strict
```

Run rule self-tests:

```sh
pnpm run test:ui-model:self-test
```

Serve the interactive report:

```sh
pnpm run test:ui-model:serve
```

Then open:

```text
http://127.0.0.1:9597/report.html
```

## Report Files

Generated files live under `test-results/ui-model/`:

- `report.html`: interactive report with per-violation repro links.
- `report.md`: Markdown report for terminal/code review.
- `summary.json`: aggregate counts by scenario, gate, and impact.
- `<scenario>.json`: full per-scenario model data.
- `electron-output.log`: Electron launch/debug output.

`test-results` remains generated output and is not part of the PR.

## Repro Links

The HTML report's "Launch repro" links call the local report server. The server:

1. Reads the saved scenario JSON.
2. Validates the requested violation id.
3. Creates an isolated repro workspace under `test-results/ui-model-repro-fixture/`.
4. Runs the collector with `--scenario=<id> --repro-violation=<id> --keep-app`.
5. Launches Electron, rebuilds the scenario state, highlights the target element, and keeps the app open.

The repro status page includes a stop button. Launching a new repro also stops the previous one.

The report server is intentionally narrow:

- It binds to `127.0.0.1`.
- It rejects non-loopback `Host` and `Origin` headers.
- It serves static files only from the configured UI-model report directory.
- It injects a random per-server nonce into repro links and rejects launch requests without it.
- It only launches repros for scenario and violation IDs already present in the saved report.
- It starts repro collectors with a scrubbed deterministic environment instead of inheriting provider secrets.

## Scenario Coverage

Core scenarios:

- Main shell at desktop, medium, and compact viewports.
- Project Board at desktop, medium, and compact viewports.

Stress scenarios:

- Project Board long names at desktop and compact viewports.
- Project Board with 25 cards at desktop and compact viewports.
- Local Tasks with 30 deterministic tasks at desktop.
- Local Tasks with long names at compact width.

Interaction scenarios:

- Settings with search active for provider, permission, and API-key rows.
- Project Board Draft Inbox with a candidate detail inspector open.
- Local Tasks with a task card edit form open.
- API-key dialog open from the provider pill with the secret input focused.
- Composer model selector open at compact width.
- Workflow Agent run console open with retained events, model calls, permissions, diagram controls, and audit evidence.
- Workflow Agent run outputs open with the retained Markdown report artifact previewed in the Files panel.

`pnpm run test:ui-model:interactions` runs only the interaction profile. `pnpm run test:ui-model:all` runs core, stress, and interaction profiles, with each scenario in a fresh Electron session and fixture workspace, then aggregates the result. This is slower than the profile-specific commands, but it avoids state contamination between heavy fixtures and non-default UI states.

## Gating Model

Each violation is classified with:

- `exposure`: `common`, `plausible-heavy`, `rare-boundary`, or `pathological`.
- `impact`: `blocker`, `major`, `accessibility`, `minor`, or `info`.
- `gate`: `fail` or `report`.

Strict mode fails common and plausible-heavy blocker, major, and accessibility findings. Minor findings remain report-only unless promoted intentionally.

The local desktop release checklist now includes `pnpm run test:ui-model:strict`, `pnpm run test:ui-model:self-test`, and `pnpm run test:ui-model:all:zero`. `pnpm run test:desktop-release-gate` verifies that those scripts, this zero-baseline ratchet, and the strict collector behavior remain documented and wired.

## Current Findings

The latest full run completed in zero-baseline mode on 2026-05-17 after the Max Polish Pass:

- 23 scenarios.
- 0 total findings.
- 0 report-only findings.
- 0 gated findings.
- Gate split: 0 report, 0 fail.

Fixed actionable findings:

- Compact main-shell composer controls fragment across three rows.
- Local Tasks info buttons are 20px, below the 24px target threshold used by the harness.
- Local Tasks tooltips can render outside the viewport.
- Project Board Draft Inbox checkbox/search controls use 13-16px native targets in stress scenarios.
- Composer send and stop buttons now expose accessible names for icon-only states.
- Settings search clear control now keeps a 24px hit area when search is active.
- API-key dialog inline text-link now keeps a 24px hit area when the dialog is open.
- Composer model selection now uses an inspectable compact-safe picker instead of a hidden native select, and its open menu anchors inside the viewport.
- Project Board Charter source/PM-review workspace now has deterministic interaction coverage, and sticky Project Board inspectors declare required scroll-container contracts for unreachable-content checks.
- Workflow Agent run evidence now has deterministic run-console and retained-artifact preview coverage.
- The deterministic workflow sample now writes a real Markdown audit artifact, and absolute workflow-state artifacts open through the local Files preview route.
- Workflow diagram zoom controls now meet the 24px target and expose descriptive labels; clipped diagram/event metadata now has title disclosure.
- Permission dialog, browser picker, and plugin import candidate states have deterministic interaction coverage.
- Statusbar Git chips expose full values while preserving compact truncation.
- Local Tasks blocker controls use compact visible dependency labels with full-value disclosure.
- Project Board dense-card descriptions and clarification summaries expose full values through titles and the existing detail inspector path.

Remaining report-only findings:

- None in the deterministic core, stress, or interaction profiles. The current baseline is 23 scenarios, 0 total findings, 0 report-only findings, and 0 gate failures.
- The optional copied-snapshot live-seeded diagnostic most recently passed its focused Project Board and Local Tasks sample with 5 scenarios, 0 total findings, and 0 gate failures.

## Reviewer Notes

- The suite intentionally uses deterministic preload API setup, not live Pi calls, because layout QA needs speed and repeatability.
- Live Ambient/Pi validation remains valuable for product behavior and can be added later as a separate live-seeded capture path.
- The report artifacts group repeated findings by surface/component/rule and list explicit UI-model annotations, so future regressions should be triaged by group before selector-by-selector review.
- The repro server is local-only and should be started manually. No GitHub Actions are added.
- The default fixture workspace is isolated from the repo workspace, so repeated runs should not pollute real `.ambient-codex` state.

## Recommended Next Work

- Keep `pnpm run test:ui-model:all:zero` green before release candidates.
- Use `pnpm run test:ui-model:all` as a report-only diagnostic lane only when deliberately collecting a new baseline.
- Use `pnpm run test:ui-model:live-seeded` for optional GMI/Ambient-backed diagnostic review against a disposable copy of real local state.
- Convert any future live Ambient/Pi layout issue into a sanitized deterministic scenario before relying on the zero-baseline ratchet.
- Add baselines/new-since-last-run reporting if the deterministic scenario count grows substantially.
