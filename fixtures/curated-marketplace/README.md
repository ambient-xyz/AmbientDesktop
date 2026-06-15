# Ambient Curated Marketplace Fixture

This directory models the first Ambient-curated Codex-compatible marketplace artifact.

- `source.json` is the human-edited source definition.
- `marketplace.json` is the generated artifact suitable for mirroring to an OVH static host.
- `marketplace.signature.json` is the generated detached signature metadata. Ambient verifies it before exposing the curated source unless the source is explicitly marked as a local/dev unsigned catalog.

Build the artifact:

```sh
pnpm run build:curated-marketplace
```

Validate that the checked-in artifact is current:

```sh
pnpm run validate:curated-marketplace
```

The publishing workflow is intentionally static-host friendly: validate locally, upload the generated `marketplace.json` and `marketplace.signature.json` to the configured OVH/static host path, then point Ambient at that URL with `AMBIENT_CODEX_CURATED_MARKETPLACE_URL` or the built-in default source URL. The checked-in fixture uses a precomputed test signature and a public fixture key; production publishing should set `AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_KEY_ID`, `AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PUBLIC_KEY`, and `AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PRIVATE_KEY`, while clients should trust the matching public key through `AMBIENT_CODEX_CURATED_MARKETPLACE_KEY_ID` and `AMBIENT_CODEX_CURATED_MARKETPLACE_PUBLIC_KEY`.
