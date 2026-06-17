---
name: ambient-tinystyler
description: Create reusable TinyStyler style profiles from user text examples and apply TinyStyler-style text transfer through Ambient CLI.
---

# Ambient TinyStyler

Use this package when the user wants local few-shot writing-style transfer from their own example texts. The v1 target is profile creation plus transfer with pretrained TinyStyler assets, not user-specific model fine-tuning.

## Discovery And Setup

- Find this package with `ambient_cli_search` using terms like `TinyStyler`, `style transfer`, `style profile`, `rewrite in this style`, or `writing style examples`.
- Call `ambient_cli_describe` before first use so model assets, command contracts, current implementation status, and artifact behavior are visible.
- Run `tinystyler_doctor --json` before profile or transfer. It is non-mutating and does not download models.
- Profile creation uses local Style-Embedding assets when the approved Python dependencies and model cache are present. Transfer generation uses local TinyStyler/T5 assets when approved dependencies and caches are present. Use `--fake` only for deterministic local validation.

## Commands

- `tinystyler_doctor --json`: reports Python/platform facts, declared Hugging Face revisions, required model assets, cache state, and safety boundaries.
- `tinystyler_profile --examples-file <path> --output-profile <path> --profile-name <name> --json`: creates a profile artifact using local Style-Embedding assets. Use `--fake` only for deterministic local validation, not for user-facing style profiles.
- `tinystyler_transfer --input-file <path>` or `--text <text>` plus `--profile <path>` or `--examples-file <path>` and `--output-file <path> --json`: writes transfer text plus bounded JSON metadata. Use `--fake` only for deterministic local validation, not user-facing transfer.

Prefer file inputs when text contains punctuation, whitespace, quotes, or user-provided examples. Do not pass long user samples as CLI arguments.

## Artifact Contract

Profiles are JSON artifacts with `schemaVersion` `ambient.tinystyler.profile.v1`, provenance, aggregate source counts, model revisions, generation defaults, safety metadata, and embedding values. Raw example text and exact source verifiers are not persisted by default; raw text requires the user to explicitly request `--include-source-text true`.

Transfer always writes the exact generated text to required `--output-file` and returns concise JSON metadata on stdout. Large outputs should be files, not chat blobs.

## Safety And Boundaries

- Treat this as style adaptation, not identity verification or impersonation.
- Never expose secret values. TinyStyler itself does not require API keys.
- Do not persist raw user examples by default.
- Do not silently fall back to prompt-only rewriting when model assets are missing.
- Optional reranking is deferred until LUAR/MIS remote-code, dependency, and runtime-cost risks are reviewed.
- If real model execution fails, report the failure class and safe next step rather than repairing output text after generation.
