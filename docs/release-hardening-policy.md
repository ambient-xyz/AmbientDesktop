# Ambient Desktop Release Hardening Policy

This document records the local release/update security contract enforced by `pnpm run test:desktop-release-gate`.

## Production Update Feeds

- Packaged production builds use Ambient-owned update feeds only:
  - `https://updates.ambient.xyz/desktop/stable`
  - `https://updates.ambient.xyz/desktop/beta`
- Runtime environment variables such as `AMBIENT_DESKTOP_UPDATE_URL` and `AMBIENT_DESKTOP_UPDATE_BASE_URL` are ignored for packaged production update feeds.
- Update feed overrides are allowed only in development contexts where desktop updates are already disabled.
- The desktop update publisher must require an explicit upload host, user, and SSH key for real uploads. Repository defaults must not name a private host, username, or local key path.
- Published update directories must include `release.json` and `SHA256SUMS` so bootstrap recovery and manual audit paths can verify release intent and file hashes.

## macOS Entitlements

The packaged app uses macOS hardened runtime. The following entitlements are currently approved exceptions:

- `com.apple.security.cs.allow-jit`: required by Electron's Chromium/V8 runtime for normal renderer and preload execution.
- `com.apple.security.cs.allow-unsigned-executable-memory`: retained for Electron and native Node module runtime initialization until packaged smoke coverage proves it can be removed.
- `com.apple.security.cs.disable-library-validation`: retained because native modules such as `better-sqlite3` and `node-pty` are loaded from app resources.

These exceptions are tracked in `build/release-hardening-policy.json` with owner, rationale, and review date. Adding a new entitlement or changing one of these entitlements must update that policy file and pass the local release gate.

## Release Signing And Notarization

Unsigned local builds are acceptable before cutting a release. Release artifacts intended for distribution must be signed and notarized through the macOS release process before upload to the production update feed. The local release gate records this policy explicitly so release candidates cannot silently drift into an undocumented unsigned-publish path.

## Local UI Model Gate

Before a desktop release candidate is cut, run the local headless UI gate:

- `pnpm run test:ui-model:strict`: strict core UI model gate. This must report 0 gate failures.
- `pnpm run test:ui-model:self-test`: detector self-test that injects known bad DOM defects and proves the rules still fire.
- `pnpm run test:ui-model:all:zero`: full core, stress, and interaction profile zero-baseline ratchet. This must report 0 findings, 0 report-only findings, and 0 gate failures before a release candidate is cut.

The strict lane gates common and plausible-heavy blocker, major, and accessibility findings. The all-profile zero-baseline lane is stricter: after the 2026-05-17 polish pass, any deterministic UI-model finding is treated as release-candidate triage debt. `pnpm run test:ui-model:all` remains available as a report-only diagnostic command when deliberately collecting a new baseline.
