# Ambient Desktop Security Repro Handoff

This directory contains a local, safe repro runner for the production security review findings F-001 through F-015. It is intended for handoff, triage, and regression planning before production launch.

## What This Adds

- A Node backend at `scripts/security-repro/server.mjs`.
- A browser frontend at `docs/security-repro-runner.html`.
- A human-readable security explainer at `docs/production-security-review.html`.
- The detailed review plan and finding record at `docs/production-security-review-plan.md`.

The runner is intentionally dependency-free and uses Node built-ins. It does not add app runtime dependencies and does not modify product code.

## How To Run

From the repo root:

```sh
node scripts/security-repro/server.mjs
```

Then open:

```text
http://127.0.0.1:17391/
```

Optional port override:

```sh
node scripts/security-repro/server.mjs --port 17400
```

Release gate:

```sh
pnpm run test:security-repro-gate
```

The backend also exposes JSON endpoints:

- `GET /api/health`
- `GET /api/repros`
- `GET /api/results`
- `POST /api/repros/F-001/run`
- `POST /api/run-all`

## Safety Model

The repro runner is deliberately constrained:

- No real secrets are required or read.
- Secret repros use fake sentinel values and report hashes, not raw values.
- Workspace repros use temporary directories under the OS temp directory.
- The terminal repro is a static IPC/source-boundary probe, not a live shell exploit.
- The workflow infinite-loop repro runs real loader timeout regressions in a child process and separately proves SIGTERM-resistant children are escalated to SIGKILL.
- The dependency and release checks are gate probes, not exploit payloads.
- Browser input cannot choose arbitrary commands or arbitrary filesystem paths; endpoints are fixed and allowlisted by finding id.
- The server binds only to `127.0.0.1` and refuses non-loopback host overrides.
- CORS is limited to loopback origins; non-local browser origins receive `403`.

This should remain a local-only handoff tool. Do not wire it into the production desktop app or expose it on a non-local interface.

## Current Finding Coverage

| ID | Issue | Repro Type | Expected Current Result |
| --- | --- | --- | --- |
| F-001 | Workspace-stored provider secrets are agent-readable | Temp workspace + static policy/source probe | Not reproduced after Phase 1D |
| F-002 | Ambient API key and process env leak to agent/tool processes | Sentinel env child-process probe + static source probe | Not reproduced after Phase 1D |
| F-003 | Workspace-writable authority state enables permission/trust/audit tampering | Temp workspace state write + static source probe | Not reproduced after Phase 2A |
| F-004 | Browser credential metadata can be tampered from the workspace | Temp credential JSON tamper probe + static source probe | Not reproduced after Phase 2B |
| F-005 | Workspace file preview/media follow symlinks outside workspace | Temp symlink escape proof + static source probe | Not reproduced after Phase 3B |
| F-006 | Main renderer is unsandboxed with broad privileged IPC | BrowserWindow/preload IPC inventory probe | Not reproduced after Phase 5C |
| F-007 | Default permission mode is full access | Static default-state probe | Not reproduced after Phase 5A |
| F-008 | External URL/window open allows `file:` and unvalidated targets | Static URL/openExternal probe | Not reproduced after Phase 5A |
| F-009 | Workflow VM runtime limits do not stop sync CPU loops | `pnpm run test:workflow-hard-kill-gate` + workflow loader source probe | Not reproduced after Phase 6E with loader timeout regressions and OS-level hard-kill proof |
| F-010 | Renderer CSP and HTML preview remain loose | Static CSP/srcDoc/sandbox probe | Not reproduced after Phase 5B |
| F-011 | Production dependency audit has open advisories | `node scripts/dependency-audit-gate.mjs --json` gate | Not reproduced after Phase 6C |
| F-012 | Release/update hardening needs a production gate | Local desktop release gate | Not reproduced after Phase 6D |
| F-013 | Terminal IPC allows renderer compromise to spawn and drive a shell | Static preload/IPC/terminal-service probe | Not reproduced after Phase 4B |
| F-014 | Generic thread settings IPC can escalate permission mode | Static IPC/schema/store probe | Not reproduced after Phase 4A |
| F-015 | Renderer-supplied project paths can rebase workspace authority | Static project path/switchWorkspace probe | Not reproduced after Phase 4D |

## Interpreting Results

The runner returns these statuses:

- `vulnerable`: the finding was reproduced or the expected vulnerable pattern is still present.
- `not-reproduced`: the specific probe no longer found the issue.
- `inconclusive`: the probe could not prove either direction.
- `error`: the harness failed before producing a meaningful result.

For static probes, `vulnerable` means the known risky source pattern is still present. It does not prove full exploitability by itself; it confirms that the reviewed trust boundary has not obviously been remediated.

`pnpm run test:security-repro-gate` fails if any F-001 through F-015 result is missing, `vulnerable`, `inconclusive`, or `error`.

## Validation Performed Before Handoff

The following checks were run locally:

```sh
node --check scripts/security-repro/server.mjs
node --check scripts/security-repro-gate.mjs
node --check scripts/workflow-hard-kill-gate.mjs
node --check scripts/workflow-hard-kill-gate-lib.mjs
pnpm run test:workflow-hard-kill-gate:unit
pnpm run test:workflow-hard-kill-gate
pnpm exec vitest run scripts/security-repro-gate.test.mjs scripts/security-repro-server.test.mjs
pnpm run test:security-repro-gate
curl -s http://127.0.0.1:17391/api/repros
curl -s -X POST http://127.0.0.1:17391/api/repros/F-005/run
curl -s -X POST http://127.0.0.1:17391/api/repros/F-013/run
curl -s -X POST http://127.0.0.1:17391/api/run-all
```

The release gate currently returns all 15 findings as `not-reproduced` against the current tree.

## Recommended Next Steps

1. Run `pnpm run test:security-repro-gate` before release signoff.
2. Keep this runner out of packaged production builds.
3. Continue converting the runner's strongest probes into focused product tests when touching a boundary.
4. Treat a full product RPC worker bridge for generated workflows as defense-in-depth beyond the current F-009 hard-kill release gate.
5. Keep F-011 accepted-risk records current before each release.

## Files To Review

- `docs/production-security-review-plan.md`: detailed plan, findings, classification research, and launch judgment.
- `docs/production-security-review.html`: standalone explainer for stakeholders.
- `docs/security-repro-runner.html`: local frontend for running repros.
- `scripts/security-repro/server.mjs`: local backend and individual repro implementations.
