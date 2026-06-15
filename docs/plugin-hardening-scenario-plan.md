# Capability Hardening Scenario Plan

This plan supersedes the first plugin-only framing. The main correction is that
release-facing scenarios should exercise Ambient product capabilities, not the
local Codex cache plugin list.

Scenario catalog: `test-scenarios/plugin-hardening-v1.yaml`

High-priority feature plan:
`docs/capability-base-export-import-plan.md`

## What Changed

Codex cache plugins are deferred. Browser Use, Computer Use, GitHub, Gmail,
Google Calendar, Google Drive, Slack, Documents, Presentations, and
Spreadsheets remain useful compatibility references, but they should not be in
the primary hardening matrix until Ambient can run them through its own plugin
control plane.

Google is a first-party `gws` connector lane. Google Workspace scenarios must
use `google_workspace_status`, `google_workspace_search_methods`,
`google_workspace_call`, and `google_workspace_materialize_file`. They require
the running Ambient app profile to be authenticated through Settings / Plugins,
and every method call should use an explicit `accountHint` when multiple local
accounts exist.

Ambient CLI and Provider Catalog are separate surfaces:

- Ambient CLI discovery covers installed/registered workspace packages such as
  `youtube-transcript`, `pi-arxiv`, `ambient-qwen3-asr`,
  `ambient-faster-whisper-stt`, and `ambient-minicpm-v-vision`.
- Provider Catalog covers recommended/onboarding options such as Brave Search,
  Piper, ElevenLabs, Cartesia, SearXNG, Scrapling, MiniCPM-V, Google Workspace,
  rich document paths, social APIs, Stripe Sandbox, and deep-research candidates.

The scenario suite should test both: installed capability discovery/use, and
catalog-to-Capability-Builder guidance.

## Credential Model

Credentialed scenarios must declare required env names and skip cleanly when
they are unavailable.

Use these rules:

- Never put secret values in chat, scenario prompts, tool args, logs, reports,
  descriptors, or Pi-visible output.
- Use `ambient_cli_secret_request` when the scenario validates Desktop secret
  entry.
- Use `ambient_cli_env_bind` only for approved workspace-local ignored secret
  files.
- Google OAuth is not copied as an API key. It belongs to the Ambient app
  profile's `gws` config/keyring state and is selected by `accountHint`.
- Scenario reports can name provider id, env var name, account handle, and
  secret-source kind, but not values.

Important credential-backed paths:

- Brave Search: `BRAVE_API_KEY`
- ElevenLabs: `ELEVENLABS_API_KEY`
- Cartesia: `CARTESIA_API_KEY`
- Google Programmable Search: `GOOGLE_SEARCH_API_KEY`,
  `GOOGLE_SEARCH_ENGINE_ID`
- Image/video/social/Stripe candidates: declared in the catalog, plan-only
  until explicitly provisioned.

## Session Portability

Treat every machine/app profile as isolated. Copying a workspace does not copy:

- Ambient-managed secret files or keychain entries.
- `gws` OAuth state.
- Browser profile cookies.
- Local model caches.
- Provider registrations under app-specific userData.
- Capability Builder generated package state unless the workspace carries it.

The runner should produce a capability/session manifest before each shard:

- machine id, OS, app build
- workspace path and Electron userData path
- registered Ambient CLI packages
- env bindings without values
- required secret env names and configured/missing status
- `gws` config root and account hints
- browser profile mode
- local model cache requirements
- declared network hosts

## Priority 0: Stable Capability Bases

Before scaling parallel hardening, build a stable capability base export/import
feature. The base should let us preserve known-good capability setup across app
builds while still running scenarios in disposable overlays.

The base feature should provide:

- redacted export of Ambient CLI packages, generated Capability Builder sources,
  provider catalog selections, env-binding names, required secret names, `gws`
  account hints, local model readiness, app build, workspace, and userData facts
- import preview that reports exact drift before mutating anything
- safe apply for portable package/source metadata, without secret values,
  browser cookies, OAuth tokens, keychain items, or model binaries
- explicit rehydration paths for credentials through `ambient_cli_secret_request`
  or approved `ambient_cli_env_bind`
- explicit Google readiness through Settings / Plugins and `gws` status, never
  by copying OAuth state
- scenario overlays that can install/remove/mutate capabilities without damaging
  the stable base

Treat this as the first product feature to harden because it turns every later
scenario into a cleaner signal: either the base is valid, or the scenario failed.

## Machine Pool

Primary Mac:

- Use for provider-secret live runs, Google `gws` runs, local model/STT/MiniCPM,
  native desktop UI, and visual app-surface dogfood.

UTM desktops:

- Use for deterministic tests, live Pi tests, provider-catalog plan-only runs,
  and non-GPU packaging/app smokes.
- Avoid local model lanes and shared desktop-control lanes.
- Provision secrets only through explicit bootstrap, never by copying chat logs.

Mac laptops:

- Use for macOS install/update/UI smoke and selected provider-secret runs after
  explicit secret/bootstrap setup.

Linux `drone`:

- Use for Linux packaging, policy-only sandbox diagnostics, deterministic tests,
  and non-GPU live Pi/provider catalog runs.
- Do not use for macOS-only desktop control or MiniCPM/local GPU lanes unless
  runtime/model assets are intentionally installed.

## Runner Shape

Minimum useful runner:

- `--list`
- `--lane <lane>`
- `--scenario <id>`
- `--max-parallel <n>`
- `--machine <local|utm-*|mac-*|drone>`
- `--dry-run`
- `--require-credentials`
- aggregate JSON at `test-results/scenario-matrix/latest.json`

Every scenario report should include:

```json
{
  "scenarioId": "brave-search-secret-bind-and-live-query",
  "lane": "provider_secret_live",
  "status": "passed",
  "phase": "ambient-cli-run",
  "reason": null,
  "machineId": "primary-mac",
  "appBuild": "0.1.25",
  "capabilities": ["search.brave"],
  "requiredCredentials": ["BRAVE_API_KEY"],
  "configuredCredentials": ["BRAVE_API_KEY"],
  "toolCalls": [],
  "approvals": [],
  "screenshots": [],
  "artifacts": [],
  "changedFiles": [],
  "leftovers": [],
  "redactionIssues": []
}
```

## First Execution Slice

Start with stable-base scenarios, then continue into low-mutation product
capability scenarios.

Priority 0:

1. `capability-base-export-redacted-manifest`
2. `capability-base-import-preview-drift-report`
3. `capability-base-apply-portable-package-state`
4. `capability-base-overlay-mutation-isolation`
5. `capability-base-google-gws-readiness`
6. `capability-base-secret-rehydration-redaction`
7. `capability-base-cross-machine-dry-run`

Priority 1, once the base export/import path is usable:

1. `provider-catalog-settings-cards-plan-only`
2. `ambient-cli-discovery-first-party`
3. `office-extraction-preview-local-files`
4. `rich-document-provider-catalog-plan`
5. `google-gws-status-and-account-hints` if the current app profile is already
   authenticated
6. `pi-arxiv-install-use-uninstall`
7. `pi-ffmpeg-sandbox-fallback-review`
8. `brave-search-secret-bind-and-live-query` only when the Brave secret is
   intentionally provisioned for that workspace/app profile

Then add the provider-secret and local-model lanes one at a time.
