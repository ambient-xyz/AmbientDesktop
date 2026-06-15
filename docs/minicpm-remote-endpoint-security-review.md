# MiniCPM-V Remote Endpoint Security Review

Status: blocked pending review.

Remote MiniCPM-V endpoints are not enabled in Ambient Desktop yet. The current `endpointUrl` path is intentionally local-only (`localhost`, `127.0.0.1`, or `[::1]`) because visual requests can include screenshots, chat image attachments, sampled video frames, UI state, and workspace media metadata.

## Required Gates

1. Allowed hosts
   - Define the exact remote host allowlist, tenancy boundary, TLS requirement, and provider identity checks.
   - Evidence: deterministic validation rejects undeclared hosts before any request is sent.

2. User consent
   - Require explicit per-provider consent that names the remote host and states that visual media may leave the machine.
   - Evidence: permission prompt copy, grant scope, revocation behavior, and tests for denied or expired consent.

3. Media privacy
   - State which screenshots, images, sampled frames, and metadata may be uploaded.
   - Evidence: media-boundary policy, supported input types, size limits, local-only default, and blocked external-media cases.

4. Secret handling
   - Use Ambient-managed secret entry or env binding.
   - Never expose API keys in chat, tool args, artifacts, logs, descriptors, or Pi-visible summaries.
   - Evidence: secret capture flow, redaction tests, and artifact inspection showing no key material leakage.

5. Request redaction
   - Redact request bodies, image bytes, absolute paths, auth headers, and provider responses before anything is shown to Pi or saved as a preview.
   - Evidence: golden artifacts proving previews contain redacted hashes and bounded metadata only.

6. Artifact retention
   - Define how long remote-request artifacts, media copies, raw responses, and error bodies are retained.
   - Define how users delete them.
   - Evidence: retention defaults, cleanup path, uninstall behavior, and a test proving user-managed files are preserved.

7. Network egress controls
   - Route remote calls through a typed provider adapter with timeout, retry, host, method, body-size, and content-type controls.
   - Evidence: adapter tests proving no generic URL fetch path, no redirects to undeclared hosts, and clear timeout/error reporting.

8. UI copy
   - Settings, provider cards, permission prompts, and diagnostics must state the local-vs-remote distinction.
   - Evidence: reviewed copy snapshots that name the host, media privacy tradeoff, cost/privacy note, and local fallback.

## Implementation Rule

Until every gate above has owner-reviewed evidence, MiniCPM-V remote endpoints must continue to fail closed before health checks, model-list calls, image uploads, or validation requests. Product behavior should keep recommending local runtimes, Ambient-managed local endpoints, or a user-managed local OpenAI-compatible endpoint.
