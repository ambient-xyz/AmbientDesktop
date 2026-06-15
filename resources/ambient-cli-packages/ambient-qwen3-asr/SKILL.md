---
name: ambient-qwen3-asr
description: Local Qwen3-ASR speech-to-text provider for Ambient push-to-talk.
---

# Ambient Qwen3-ASR STT Provider

Use this package only through Ambient's STT provider path. It implements:

```bash
qwen3_asr_transcribe --audio <wav> --language <language> --output-json <path>
```

The command expects Ambient to provide a normalized 16 kHz mono WAV. It writes concise JSON with `text`, `language`, `durationMs`, `providerId`, and artifact metadata. It must not print raw audio, secrets, or long diagnostic payloads to stdout.

Runtime configuration:

- `AMBIENT_QWEN3_ASR_BINARY`: optional path or command name for `llama-mtmd-cli`.
- Default model assets are pinned in `assets/qwen3-asr-assets.json`, downloaded into an Ambient cache on first use, verified by exact byte size and SHA-256, then passed to llama.cpp with `-m` and `--mmproj`.
- `AMBIENT_QWEN3_ASR_ASSET_DIR`: optional cache root for those verified manifest assets.
- `AMBIENT_QWEN3_ASR_MODEL`: optional custom llama.cpp `-hf` model ref for explicit experiments. Setting it bypasses the default verified manifest asset path.
- `AMBIENT_QWEN3_ASR_THREADS`: optional thread count. Defaults to a conservative local value.
- `AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT`: deterministic test hook. Do not set this for product use.

Product constraints:

- Use the exact transcript as a visible user message.
- Do not use partial text to steer an active agent request.
- Let Ambient's no-speech gate run before invoking this provider.
- Do not enable automatic runtime archive downloads until every per-platform runtime lane has a pinned source, size, and SHA-256. Windows remains pending real-machine validation.
