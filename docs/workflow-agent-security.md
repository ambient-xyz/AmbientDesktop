# Workflow Agent Security Checklist

Workflow Agent Mode compiles user intent into a deterministic workflow artifact. The runtime must keep authority in Ambient Desktop, not in generated code or prompt text.

## Generated Source Boundary

- Generated workflow source is statically validated before execution.
- Raw imports from Node process, filesystem, network, worker, and child-process modules are blocked.
- Direct `process.env` access is blocked.
- Unbounded `while (true)` and `for (;;)` loops are blocked.
- Workflow code receives only `workflow`, `tools`, `ambient`, and descriptor-gated `connectors` bindings.

## Manifest Enforcement

- A workflow can call only tools declared in `manifest.tools`.
- Ambient model calls require `ambient.responses` in `manifest.tools`.
- `manifest.maxToolCalls`, `manifest.maxModelCalls`, and `manifest.maxRunMs` are enforced by runtime code.
- Tool descriptors carry side-effect metadata, permission scope, dry-run support, timeout, and idempotency guidance.

## Desktop Tool Bridge

- Desktop tools are descriptor-backed and audited with start/end/error events.
- Inputs are validated against descriptor schemas before handlers run.
- Workspace mode uses the same permission classifier as chat mode.
- Shell commands are routed through the existing tool runner and receive the workflow abort signal.
- Browser and file tools are exposed through first-party handlers, not raw Pi tool-call syntax.
- Plugin MCP tools keep plugin trust checks and workspace permission context.

## Review And Mutation Gates

- `workflow.requireApproval(changeSet)` pauses execution until a stored approval/rejection exists.
- `workflow.stageMutation(changeSet, apply)` records the staged mutation and does not call `apply` until the resumed run has approval.
- Approval decisions are derived from immutable run events.
- Rejected approvals fail the resumed run before mutation code applies.

## Audit And Recovery

- Runs persist events, model calls, checkpoints, approvals, source path, source hash, and report path.
- Checkpoints are stored per artifact and tagged with the run that wrote them.
- Resume attempts are explicit run events and reuse stored checkpoints/approval decisions.
- Canceled, timed-out, failed, paused, and succeeded runs all produce audit reports when possible.

## MVP Connector Boundary

- Gmail, Calendar, Slack, and other personal-data connectors are intentionally out of MVP scope.
- Connector work must define auth, scopes, account identity, pagination, rate limits, mutation idempotency, undo/compensation, data minimization, and review UX before any Gmail label-writing work begins.
- Workflow connector access is distinct from raw plugin tools: generated code uses `connectors.call(...)`, and `manifest.connectors` must grant exact connector ids, scopes, operations, account ids when known, and retention policy.
- The first built-in connector path is a harmless read-only workspace inventory connector; account connectors must use the OAuth lifecycle and connector review gates before personal data is read.
- OAuth connector token custody stays in Ambient Desktop: generated workflow code receives account handles only, while token payloads live behind the connector auth service token vault.
- OAuth connector tests must cover fake-provider connect, refresh, revoke, reconnect, missing-scope failure, and token-leak checks before any Gmail connector lands.
- Personal-data and external-write connector calls pause with `connector.review.required` until the exact connector id, account, scopes, operations, retention policy, source hash, and manifest hash are approved.
- Connector calls emit audited start/end/error events with retention-aware summaries.
- Personal-data connector grants support `dataRetention=none`, `redacted_audit`, or `run_artifact`; `redacted_audit` is the default expectation before Gmail.
- Personal-data connector input/output summaries and error details are omitted or redacted unless a workflow explicitly grants `run_artifact` retention.
