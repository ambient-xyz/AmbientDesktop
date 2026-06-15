# STT Spike Harness

This harness runs a small STT corpus through one or more configured providers, preserves full stdout/stderr artifacts, and writes JSONL plus a markdown summary.

It is intentionally outside the product runtime. Use it to decide whether Qwen3-ASR deserves a first-party `stt-provider` installer shape.

## Quick Start

Create a corpus file with local audio paths, then run:

```bash
node scripts/stt-spike/run.mjs \
  --corpus scripts/stt-spike/corpus.example.json \
  --providers scripts/stt-spike/providers.example.json \
  --out .ambient/stt-spike
```

The default provider example expects `llama-mtmd-cli` on `PATH` and uses:

```bash
llama-mtmd-cli -hf ggml-org/Qwen3-ASR-0.6B-GGUF --audio <sample.wav>
```

Use `--dry-run` to validate command expansion without running a provider.

To prepare the small public human-speech smoke corpus:

```bash
pnpm run stt:prepare-corpus -- \
  --manifest scripts/stt-spike/corpus.public-smoke.manifest.json
```

That writes `.ambient/stt-spike/corpus/public-smoke/corpus.json`, with raw downloads, normalized 16 kHz mono WAV files, checksums, and download metadata under the same directory.

To prepare the broader multilingual smoke corpus:

```bash
node scripts/stt-spike/prepare-corpus.mjs \
  --manifest scripts/stt-spike/corpus.multilingual-smoke.manifest.json \
  --out .ambient/stt-spike/corpus/multilingual-smoke
```

That manifest uses small licensed multilingual Common Voice clips from `MiniMaxAI/TTS-Multilingual-Test-Set` plus a generated silence sample.

## Outputs

Each run writes:

- `results.jsonl`: one structured result per provider/sample pair.
- `summary.md`: human-readable benchmark table.
- `host.json`: OS, CPU/RAM, and runtime availability checks.
- `run-config.json`: selected providers/samples and source config paths.
- `logs/*.stdout.txt` and `logs/*.stderr.txt`: full provider output.
- `transcripts/*.txt`: parsed transcript text.

`run-chunked.mjs` writes a similar artifact tree for chunked/offline simulations:

- `results.json`: one aggregate simulation result per provider/sample pair.
- `chunk-results.jsonl`: one normal provider result per chunk.
- `summary.md`: first-final latency, simulated realtime factor, tail latency, duplicate overlap, and stitched-transcript quality.
- `chunks/*.wav`: materialized chunk audio.

`run-chunked-matrix.mjs` runs `run-chunked.mjs` repeatedly for a chunk-size tradeoff:

- `matrix-results.json`: aggregate comparison across chunk sizes.
- `matrix-summary.md`: chunk size, hop, quality, first-final latency, tail latency, duplicate overlap, and a coarse product-mode recommendation.
- `chunked-runs/*`: the underlying chunked simulation artifacts for each row.

`probe-qwen-asr-streaming.mjs` probes the pure C `antirez/qwen-asr` runtime:

- `results.json`: per-sample timing for offline, file streaming, or real-time stdin streaming modes.
- `summary.md`: first text timing, elapsed runtime, realtime factor, tail latency, quality, and transcript preview.
- `logs/*.stdout.txt`, `logs/*.stderr.txt`, and optional `logs/*.ffmpeg.stderr.txt`: full runtime output.
- `transcripts/*.txt`: captured transcript text.

## Corpus Shape

```json
{
  "samples": [
    {
      "id": "en-short-clean",
      "path": "fixtures/stt/en-short-clean.wav",
      "language": "English",
      "durationMs": 8000,
      "normalize": true,
      "sourceUrl": "local fixture",
      "license": "source terms"
    },
    {
      "id": "silence",
      "extension": ".wav",
      "language": "English",
      "generate": { "type": "silence", "durationMs": 5000, "sampleRate": 16000 },
      "normalize": false
    }
  ]
}
```

When `normalize` is true and `ffmpeg` is available, samples are converted to 16 kHz mono WAV in the run artifact directory. If normalization fails, the harness records the failure and falls back to the original audio path.
Manifest samples can provide exactly one of `url`, `sourcePath`, or `generate`. The current generated source supports deterministic 16 kHz mono silence fixtures.

## Provider Shape

```json
{
  "providers": [
    {
      "id": "qwen3-asr-0.6b-llamacpp",
      "label": "Qwen3-ASR 0.6B GGUF via llama.cpp",
      "command": "llama-mtmd-cli",
      "args": ["-hf", "ggml-org/Qwen3-ASR-0.6B-GGUF", "--audio", "{audio}"],
      "parseStdout": "text",
      "mode": "offline"
    }
  ]
}
```

Supported placeholders:

- `{audio}`
- `{language}`
- `{sampleId}`
- `{providerId}`
- `{providerLabel}`
- `{threads}`
- `{runDir}`
- `{artifactsDir}`
- `{stdoutPath}`
- `{stderrPath}`
- `{transcriptPath}`
- `{outputJson}`
- `{env.NAME}`

Use `parseStdout: "json"` for wrappers that return `{ "text": "...", "language": "..." }`.
Use `parseStdout: "qwen3-asr"` for raw Qwen3-ASR `llama.cpp` output such as `language English<asr_text>...`.

Each result also records a `language` object that compares the sample's expected language with the provider-detected language when available. The markdown summary includes expected language, detected language, and a simple match column so multilingual failures are visible without opening the JSONL.

When a sample includes `expectedText`, each result also records a coarse normalized character error rate (`quality.charErrorRate`) and the markdown summary shows it as `CER`. This is a smoke-test signal, not a replacement for a full ASR scoring suite.

Providers can declare a deterministic `noSpeechGate`:

```json
{
  "noSpeechGate": {
    "type": "rms-dbfs",
    "action": "skip",
    "thresholdDbfs": -55,
    "sampleRate": 16000
  }
}
```

The gate uses `ffmpeg` to decode the sample to 16 kHz mono PCM, computes RMS/peak dBFS, and skips provider invocation when the clip is below threshold. Skipped rows still produce JSONL, summary, transcript, and log artifacts.

The example faster-whisper provider uses `uv run --python 3.12 --with faster-whisper==1.1.1` plus `scripts/stt-spike/faster_whisper_runner.py`. It is disabled by default because it downloads Python/runtime/model assets on first use.

## Useful Commands

```bash
# Validate config and command expansion without executing providers.
node scripts/stt-spike/run.mjs \
  --corpus scripts/stt-spike/corpus.example.json \
  --providers scripts/stt-spike/providers.example.json \
  --dry-run

# Run only the Qwen3-ASR 0.6B target.
node scripts/stt-spike/run.mjs \
  --corpus .ambient/stt-spike/corpus/public-smoke/corpus.json \
  --providers scripts/stt-spike/providers.example.json \
  --only-provider qwen3-asr-0.6b-llamacpp

# Run Qwen prompt/language-control experiments on a Hindi sample.
node scripts/stt-spike/run.mjs \
  --corpus .ambient/stt-spike/corpus/public-smoke/corpus.json \
  --providers scripts/stt-spike/providers.qwen-language-experiments.json \
  --only-sample hf-asr-dummy-hindi \
  --no-normalize

# Run the broader multilingual smoke matrix.
node scripts/stt-spike/run.mjs \
  --corpus .ambient/stt-spike/corpus/multilingual-smoke/corpus.json \
  --providers scripts/stt-spike/providers.multilingual-smoke.json \
  --no-normalize

# Run Qwen3-ASR 1.7B against the same multilingual corpus.
node scripts/stt-spike/run.mjs \
  --corpus .ambient/stt-spike/corpus/multilingual-smoke/corpus.json \
  --providers scripts/stt-spike/providers.qwen-1p7b-multilingual.json \
  --no-normalize

# Run Qwen3-ASR 0.6B with a deterministic no-speech pre-gate.
node scripts/stt-spike/run.mjs \
  --corpus .ambient/stt-spike/corpus/multilingual-smoke/corpus.json \
  --providers scripts/stt-spike/providers.qwen-gated-multilingual.json \
  --no-normalize

# Simulate utterance-windowed STT over the multilingual corpus.
node scripts/stt-spike/run-chunked.mjs \
  --corpus .ambient/stt-spike/corpus/multilingual-smoke/corpus.json \
  --providers scripts/stt-spike/providers.qwen-gated-multilingual.json \
  --chunk-ms 4000 \
  --no-normalize

# Compare 2-second, 4-second, and 8-second chunk sizes.
node scripts/stt-spike/run-chunked-matrix.mjs \
  --corpus .ambient/stt-spike/corpus/multilingual-smoke/corpus.json \
  --providers scripts/stt-spike/providers.qwen-gated-multilingual.json \
  --chunk-ms-values 2000,4000,8000 \
  --no-normalize

# Probe antirez/qwen-asr real-time stdin streaming.
node scripts/stt-spike/probe-qwen-asr-streaming.mjs \
  --corpus .ambient/stt-spike/corpus/multilingual-smoke/corpus.json \
  --binary ~/ambient-stt-spike/qwen-asr/qwen_asr \
  --model-dir ~/ambient-stt-spike/qwen-asr/qwen3-asr-0.6b \
  --modes stream-stdin

# Disabled-by-default providers still run when named explicitly.
node scripts/stt-spike/run.mjs \
  --corpus .ambient/stt-spike/corpus/public-smoke/corpus.json \
  --providers scripts/stt-spike/providers.example.json \
  --only-provider faster-whisper-large-v3-turbo

# Skip ffmpeg normalization when the audio is already prepared.
node scripts/stt-spike/run.mjs \
  --corpus ./my-corpus.json \
  --providers ./my-providers.json \
  --no-normalize
```
