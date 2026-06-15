# Dependency Advisory Policy

Ambient Desktop uses `pnpm audit --prod --json` as the local production dependency advisory source. Release validation runs `pnpm run test:dependency-audit-gate`, which parses that audit output and fails unless every current production advisory is either removed by an upgrade or documented in `build/dependency-advisory-policy.json`.

## Required Overrides

The policy requires `@mariozechner/pi-ai` as a direct dependency at `^0.73.1` so app-owned Ambient/Pi provider usage resolves to the provider package that carries patched upstream dependency ranges.

The policy also requires package-manager overrides for patched transitive advisories that would otherwise remain in the production graph:

- `@anthropic-ai/sdk` is pinned to `0.91.1` to remove `GHSA-p7fg-763f-g4gf` / `CVE-2026-41686` from the Pi stack, including `@mariozechner/pi-coding-agent`'s transitive Pi dependency.
- `fast-xml-parser` is pinned to `5.7.3` and `fast-xml-builder` is pinned to `1.2.0` to remove `GHSA-5wm8-gmm8-39j9` / `CVE-2026-44665` and `GHSA-45c6-75p6-83cc` / `CVE-2026-44664` from the AWS Bedrock XML builder path.

## Accepted Advisory

`GHSA-848j-6mx2-7j84` / `CVE-2025-14505` remains accepted until `2026-08-31` because the current upstream advisory reports no patched `elliptic` release. The reachable path is:

`.>@rivet-dev/agent-os-core>@secure-exec/nodejs>node-stdlib-browser>crypto-browserify>browserify-sign>elliptic`

This is a transitive browser crypto polyfill path under `@secure-exec/nodejs`. Ambient Desktop does not use that path to create ECDSA signatures or persist signing keys in product flows. The accepted risk is low severity, owned by Desktop Security, and must be revisited by replacing or removing the polyfill chain, or by pinning a patched `elliptic` release if upstream ships one.

The gate fails if this advisory appears on a new dependency path, changes severity, gains a patched version without an explicit policy update, or passes its review date.
