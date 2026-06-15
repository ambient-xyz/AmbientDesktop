# Plugin Dogfood Artifacts

This note explains how to run and interpret the Plugins panel dogfood lanes. Keep it CI-safe: deterministic lanes should not require network or Ambient tokens, while live lanes intentionally use the real Ambient/Pi path.

## Lanes

- `pnpm run test:e2e:plugins`
  - Deterministic Electron/CDP smoke.
  - Uses local sandboxed and privileged Pi fixtures.
  - Injects a `pi-privileged-scan-updated` event to verify chat-origin sandbox fallback scans render in the open Plugins panel without live tokens.
  - Writes screenshots and `test-results/plugins/manifest.json`.
  - Does not require an Ambient API key.
- `pnpm run test:e2e:plugins:full`
  - Deterministic baseline compare.
  - Compares only the `screenshots` entries in `test-results/plugins/manifest.json` against `test/plugin-visual-baselines`.
  - Includes `06-open-panel-fallback-event-refresh`, the deterministic baseline for the injected chat-origin privileged scan event.
  - Does not compare live-only screenshots.
- `pnpm run test:e2e:plugins:update`
  - Refreshes deterministic visual baselines.
  - Use only for intentional UI changes.
- `AMBIENT_API_KEY=... pnpm run test:e2e:plugins:chat-refresh:live`
  - Live renderer-driven Ambient/Pi smoke.
  - Opens the Plugins panel, sends real chat turns for `pi-arxiv`, verifies install, uninstall/history, and clear-history panel refreshes, then checks the `pi-ffmpeg` sandbox-fallback privileged-review path.
  - Defaults to all live scenarios. Use `pnpm run test:e2e:plugins:chat-refresh:live:arxiv` for only the faster `pi-arxiv` install/uninstall/history path, or `pnpm run test:e2e:plugins:chat-refresh:live:ffmpeg` for only the `pi-ffmpeg` fallback path.
  - Writes live-only screenshots into `test-results/plugins/manifest.json` under `liveScreenshots` and writes a compact comparable run summary to `test-results/plugins/live-dogfood-summary.json`.

## Manifest Shape

`test-results/plugins/manifest.json` has two screenshot groups:

- `screenshots`: deterministic baseline candidates. These are the only screenshots used by `test:e2e:plugins:full`.
- `liveScreenshots`: live Ambient/Pi artifacts. These are diagnostic evidence, not baseline inputs.

Each live screenshot includes `liveOnly: true`, dimensions, byte size, and SHA-256. The current live refresh lane writes:

- `07-live-chat-install-refresh.png`
- `08-live-chat-uninstall-refresh.png`
- `09-live-chat-history-clear-refresh.png`
- `10-live-chat-ffmpeg-fallback-review.png`

`test-results/plugins/live-dogfood-summary.json` is the compact live run index. It records selected scenarios, `plugin-catalog-updated` / `pi-privileged-scan-updated` counts, observed tool names with duplicate counts, and the same live screenshot hashes. Use it to compare repeated live runs before opening terminal logs.

## Reading Live Output

`pluginCatalogUpdatedCount` is a liveness signal, not an exact count of tool calls. The renderer can reach the correct final state with fewer refresh events than package mutations because some refreshes race with existing panel loads or collapse into the latest catalog read. Treat `>= 1` plus rendered install/uninstall/clear states plus empty final catalog as the success contract.

`toolNames` may contain duplicates. Pi tool messages stream and update over time, and the collector records tool metadata from both `message-created` and repeated `message-updated` events. Check membership for expected tools rather than exact counts.

Expected live tools for the `pi-arxiv` refresh smoke:

- `ambient_pi_extension_install_sandboxed`
- `ambient_pi_extension_uninstall_sandboxed`
- `ambient_pi_extension_history`
- `ambient_pi_extension_clear_history`

The same live lane also asks Pi to call `ambient_pi_extension_install_sandboxed` for `https://pi.dev/packages/pi-ffmpeg?name=bet`. That package is intentionally sandbox-blocked, so the success contract is a `pi-privileged-scan-updated` event, a rendered `Sandbox fallback: pi-ffmpeg` row, and a rendered `Privileged Scan: pi-ffmpeg` row with `From sandbox fallback`. The lane must not leave a privileged install behind.

## Native Modules

Electron visual lanes and native Vitest lanes can require different native module ABIs for `better-sqlite3` and `node-pty`.

- Before Electron/CDP lanes, run `pnpm run rebuild:native` if startup fails with `NODE_MODULE_VERSION` or `ERR_DLOPEN_FAILED`.
- Before native Node/Vitest lanes, `scripts/test-node-native.sh` already rebuilds native modules for Node.
- If a failed Electron smoke leaves the remote debugging port occupied, stop stale Electron/electron-vite processes before rerunning.

## CI Guidance

- Run deterministic lanes in normal CI.
- The `Plugin Premerge` GitHub Actions workflow runs `pnpm run typecheck` and `pnpm run test:e2e:plugins:ci` without Ambient credentials.
- The `Plugin Visual Regression` GitHub Actions workflow runs `pnpm run test:e2e:plugins:full` manually or on the weekly schedule, and uploads screenshots plus diffs when baselines drift.
- The `Plugin Live Dogfood` GitHub Actions workflow is manual-only. It requires selecting `yes` for the live-token confirmation input and configuring an `AMBIENT_API_KEY` repository secret before it will run `pnpm run test:e2e:plugins:chat-refresh:live`.
- The manual live workflow accepts `all`, `arxiv`, or `ffmpeg` so live failures can be isolated without spending tokens on the full sequence.
- Keep live lanes opt-in because they require Ambient credentials, network access, and tokens.
- Upload `test-results/plugins` as artifacts for both deterministic and live runs.
- Do not promote `liveScreenshots` to visual baselines; they prove live product behavior, not pixel-stable UI.

## Live Operator Runbook

Use the local live lane during product development:

```bash
AMBIENT_API_KEY="$(tr -d '\n' < ambient_api_key.txt)" pnpm run test:e2e:plugins:chat-refresh:live
```

For focused live debugging:

```bash
AMBIENT_API_KEY="$(tr -d '\n' < ambient_api_key.txt)" pnpm run test:e2e:plugins:chat-refresh:live:arxiv
AMBIENT_API_KEY="$(tr -d '\n' < ambient_api_key.txt)" pnpm run test:e2e:plugins:chat-refresh:live:ffmpeg
```

For timeout diagnostics, shorten only the E2E Pi stream watchdog and keep the outer harness timeout larger:

```bash
AMBIENT_API_KEY="$(tr -d '\n' < ambient_api_key.txt)" AMBIENT_PLUGIN_CHAT_REFRESH_PI_IDLE_TIMEOUT_MS=45000 AMBIENT_PLUGIN_CHAT_REFRESH_TIMEOUT_MS=90000 pnpm run test:e2e:plugins:chat-refresh:live:ffmpeg
```

On failure, the live harness writes `failure-live-chat-<scenario>.png` and includes recent `runtime-activity` events in the thrown collector JSON. A timeout with `status: "timeout"` and zero output/thinking chars means the request reached Ambient/Pi but no stream activity arrived before the watchdog fired.

Use the manual `Plugin Live Dogfood` workflow when you want a CI artifact trail for the same live Ambient/Pi behavior:

- Confirm the repository has an `AMBIENT_API_KEY` secret.
- Start the workflow from GitHub Actions with `confirm_live_tokens` set to `yes`.
- Inspect `plugin-live-dogfood-artifacts`; live screenshots are diagnostic evidence and should not be copied into visual baselines.
