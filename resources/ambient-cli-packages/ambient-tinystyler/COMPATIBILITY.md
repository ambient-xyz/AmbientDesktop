# TinyStyler Compatibility Note

Reviewed on 2026-06-16 for the Ambient TinyStyler bundled Ambient CLI package.

## Upstream Revisions

| Source | Revision | Purpose |
| --- | --- | --- |
| `tinystyler/tinystyler` | `2a879107b2ec342e57170b82cdc344d5179fa32b` | TinyStyler helper code and transfer weights. |
| `google/t5-v1_1-large` | `a98b0fcd0b8137ded40cdf0c0cf0ee884e7c9726` | T5 backbone loaded by TinyStyler inference. |
| `AnnaWegmann/Style-Embedding` | `d7d0f5ca829316a8f5695e49dfce80b86db5e76c` | Style embedding model for example-text profiles. |
| `zacharyhorvitz/TinyStyler` | `128e735520f215eb6cd55ac10760b68f8b33f269` | Upstream repository and example implementation. |

## Declared Model Assets

| Asset | Size | SHA-256 | Notes |
| --- | ---: | --- | --- |
| `tinystyler_model_weights.pt` | 3,136,036,422 bytes | `8b60d2c32bb46fc0ffe3329a48c3664a794f1c195257365d5dc3753732ea6acd` | PyTorch pickle weight file; load only from declared cache path after reviewed download. |
| `google/t5-v1_1-large/pytorch_model.bin` | 3,132,858,253 bytes | `329243624cf70001991b9f0410d222a618bd33188eadc9890259b60cbc78f944` | T5 backbone weights required before TinyStyler transfer weights are applied. |
| `google/t5-v1_1-large/config.json` | 607 bytes | `d0b3d0e585673b63c9218e0c526ac6f487e949c66c678e23172f2dbfa5ec73ee` | T5 config required for local transfer model construction. |
| `google/t5-v1_1-large/spiece.model` | 791,656 bytes | `d60acb128cf7b7f2536e8f38a5b18a05535c9e14c7a355904270e15b0945ea86` | T5 SentencePiece tokenizer model required for local transfer. |
| `google/t5-v1_1-large/tokenizer_config.json` | 1,857 bytes | `b971dce1d2805c2a66da8657156e7114a30501c6ba602fc947c8bf607a3ead2d` | T5 tokenizer config required for local transfer. |
| `google/t5-v1_1-large/special_tokens_map.json` | 1,786 bytes | `4720c0fddbe4c5991334f85ad7073d9bd0a294a8ba4641a2f8dab614ca825949` | T5 special-token map required for local transfer. |
| `AnnaWegmann/Style-Embedding/pytorch_model.bin` | 498,669,047 bytes | `3186cd80660a7169a911bace4d54416cf5771a319a22f84c3a79a961ecb0c6f5` | Embedding model weights for target-style vectors. |
| `AnnaWegmann/Style-Embedding/config.json` | 718 bytes | `2ed20b6297d7f5652f3a381221ce42cc592b7ebde6b61e3604df385904224311` | RoBERTa config required for local profile extraction. |
| `AnnaWegmann/Style-Embedding/tokenizer.json` | 1,356,048 bytes | `82139106e603ee4e1d5bc99d056ccbed5a92bc24848b1b5a7137c26e00d0dbf6` | Tokenizer required for local profile extraction. |
| `AnnaWegmann/Style-Embedding/tokenizer_config.json` | 354 bytes | `72824f8b68a49929f38b29c0d2e6f7664ea68846b5447791fc83bf1ad1778127` | Tokenizer config required for local profile extraction. |
| `AnnaWegmann/Style-Embedding/special_tokens_map.json` | 239 bytes | `378eb3bf733eb16e65792d7e3fda5b8a4631387ca04d2015199c4d4f22ae554d` | Tokenizer special-token map required for local profile extraction. |

Real transfer expects the declared `models/tinystyler_model_weights.pt` and `models/google-t5-v1_1-large/*` files above. Real profile extraction expects the declared `models/style-embedding/*` files above at minimum.

## Decisions

- v1 uses pretrained profile creation and transfer only; user-specific fine-tuning is out of scope.
- Real Style-Embedding profile extraction and local TinyStyler transfer are implemented when approved dependencies and local model assets are present. The wrapper also exposes deterministic fake/fixture validation paths so Ambient CLI discovery, descriptor parsing, artifacts, and safety behavior can be validated without downloading multi-GB assets.
- Optional reranking is deferred because the public helper path can add heavier style/similarity dependencies and remote-code review work.
- Profiles default to embedding values and aggregate counts only. Raw example text requires an explicit opt-in, and exact source verifiers are not persisted by default.
- The package has no API-key requirement and should use local execution first.

## Deferred Optional Polish

These controls are intentionally out of the v1 baseline and should land behind explicit package feature flags only after a separate review:

| Follow-up | Deferral reason | Required evidence before enabling |
| --- | --- | --- |
| Reranking with LUAR/MIS style or similarity models | Public helper paths can introduce heavier dependencies, `trust_remote_code`, extra model downloads, and higher per-run cost. | Pinned revisions, license review, remote-code/pickle decision, bounded stdout/artifact behavior, and live Ambient/Pi evidence with representative user text. |
| Style interpolation strength | The baseline transfer path already conditions on a profile embedding; exposing strength controls needs quality and safety validation so Pi does not tune style into impersonation or unstable output. | Deterministic tests for metadata/defaults, bounded numeric schema, and live evidence showing understandable user-facing controls. |
| Batch transfer mode | Batch runs multiply runtime, memory pressure, artifact volume, and privacy risk if several user texts are processed together. | Per-item artifact manifest, clear failure taxonomy, raw-text non-leak checks, and a live run that proves progress and partial failures are understandable. |
| Output quality diagnostics | Diagnostics can be useful, but style/content scores may require the same deferred similarity models and can encourage overclaiming. | Calibrated metric names, no identity claims, no raw example persistence, and tests showing scores are advisory metadata only. |

Until those reviews are complete, keep `tinystyler_profile` and `tinystyler_transfer` focused on single-profile creation and single-output transfer with declared local assets or deterministic validation fixtures.
