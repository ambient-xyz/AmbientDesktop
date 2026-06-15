#!/usr/bin/env python3
import argparse
import json
import sys
import time


LANGUAGE_ALIASES = {
    "auto": None,
    "english": "en",
    "hindi": "hi",
    "chinese": "zh",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "japanese": "ja",
    "korean": "ko",
    "portuguese": "pt",
    "russian": "ru",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="faster-whisper JSON wrapper for Ambient STT.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="tiny.en")
    parser.add_argument("--language", default="English")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--vad-filter", action="store_true")
    args = parser.parse_args()

    started = time.perf_counter()
    from faster_whisper import WhisperModel

    language = normalize_language(args.language)
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        args.audio,
        language=language,
        beam_size=args.beam_size,
        vad_filter=args.vad_filter,
    )
    text = "".join(segment.text for segment in segments).strip()
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    result = {
        "text": text,
        "language": info.language,
        "languageProbability": info.language_probability,
        "audioDurationMs": round(info.duration * 1000) if info.duration is not None else None,
        "providerId": "faster-whisper",
        "model": args.model,
        "device": args.device,
        "computeType": args.compute_type,
        "elapsedMs": elapsed_ms,
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    return 0


def normalize_language(value: str):
    normalized = value.strip().lower().replace("_", "-")
    return LANGUAGE_ALIASES.get(normalized, normalized)


if __name__ == "__main__":
    raise SystemExit(main())
