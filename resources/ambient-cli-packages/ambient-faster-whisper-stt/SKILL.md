---
name: ambient-faster-whisper-stt
description: Local faster-whisper STT provider for Ambient speech input validation.
---

Use this package only through Ambient's STT provider path. It implements:

```bash
faster_whisper_transcribe --audio <wav> --language <language> --output-json <path>
```

Operational notes:

- The default path is intentionally small: `faster-whisper==1.1.1`, `tiny.en`, CPU, int8, beam size 1.
- This package is adapter-only. It bundles Ambient descriptor metadata, these instructions, the Node wrapper, the Python runner, and tests; it does not bundle `uv`, Python, faster-whisper wheels, CTranslate2 binaries, or model weights.
- `requests` is installed explicitly in the uv environment because the live macOS smoke found the direct faster-whisper import path needed it.
- First real transcription may populate local uv/Python/faster-whisper/model caches. Treat health output as runtime-readiness guidance, not proof that all model assets are already downloaded.
- When validating first-run behavior, use `pnpm run stt:faster-whisper-clean-cache` from the repo root so uv, Python, Hugging Face, and XDG caches are isolated in the validation artifact.
- This is setup/control evidence for the Ambient STT product path. Do not present `tiny.en` as multilingual quality evidence.
- Use a larger model only after setting `AMBIENT_FASTER_WHISPER_MODEL` intentionally and recording the runtime/quality tradeoff.
