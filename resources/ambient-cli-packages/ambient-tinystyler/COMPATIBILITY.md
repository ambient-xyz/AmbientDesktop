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
| `AnnaWegmann/Style-Embedding/pytorch_model.bin` | 498,669,047 bytes | `3186cd80660a7169a911bace4d54416cf5771a319a22f84c3a79a961ecb0c6f5` | Embedding model weights for target-style vectors. |

Small tokenizer/config files for T5 and Style-Embedding are expected to be fetched through the same pinned Hugging Face revisions during the dependency/model setup slice.

## Decisions

- v1 uses pretrained profile creation and transfer only; user-specific fine-tuning is out of scope.
- Real model execution is deferred past this package-contract slice. The wrapper exposes `doctor`, deterministic fake profile, and deterministic fake transfer so Ambient CLI discovery, descriptor parsing, artifacts, and safety behavior can be validated without downloading multi-GB assets.
- Optional reranking is deferred because the public helper path can add heavier style/similarity dependencies and remote-code review work.
- Profiles default to embedding values and aggregate counts only. Raw example text requires an explicit opt-in, and exact source verifiers are not persisted by default.
- The package has no API-key requirement and should use local execution first.
