# Login Automation Rollout Notes

Updated: 2026-05-01

Provider note: Example Model is currently degraded. Current live rollout validation must use the Ambient provider with Kimi (`AMBIENT_PROVIDER=ambient`, `AMBIENT_LIVE_MODEL=example/model-id`).

## Rollout Switch

Brokered browser login is enabled by default. Launch Ambient with:

```sh
AMBIENT_BROWSER_LOGIN_BROKER=0
```

to disable stored browser credential management and keep `browser_login` out of Pi's registered tool surface for that app instance.

## User-Visible States

The Browser panel now separates three authentication paths:

- Isolated profile: default managed browser state with no user cookies.
- Copied Chrome profile: explicit copy of a signed-in Chrome profile that can be cleared later.
- Stored credentials: brokered login records that expose metadata to the UI and Pi, but keep passwords in main-process encrypted storage.

The brokered path always requires action-time confirmation before a stored password is filled.

## Live Validation

Use these commands during rollout:

```sh
pnpm run test:browser-login
pnpm run test:browser-login:live
```

`test:browser-login` runs a local managed-Chrome fixture without Ambient tokens. `test:browser-login:live` spends Ambient tokens and verifies Kimi on Ambient can choose `browser_login` for a local stored credential without leaking the fixture password.

## Connector Direction

Prefer OAuth/API connectors for durable, high-value account workflows:

- Gmail
- GitHub
- Slack
- Google Drive
- Calendar

Use browser login for:

- Sites without usable APIs.
- Local QA and fixture testing.
- Temporary low-volume user-guided web tasks.
- Handoff-heavy workflows where the user remains present.

If a workflow repeatedly logs into the same high-value service, build or use a connector with scoped operations instead of expanding browser automation.
