#!/usr/bin/env python3
"""Ambient TinyStyler package wrapper.

Slice 1 intentionally implements the package contract and deterministic fake
runtime paths only. Real TinyStyler embedding extraction and transfer are added
in later slices after dependency/model setup is approved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


PACKAGE_NAME = "ambient-tinystyler"
PACKAGE_VERSION = "0.1.0"
PROFILE_SCHEMA_VERSION = "ambient.tinystyler.profile.v1"
TINYSTYLER_REVISION = "2a879107b2ec342e57170b82cdc344d5179fa32b"
STYLE_EMBEDDING_REVISION = "d7d0f5ca829316a8f5695e49dfce80b86db5e76c"
T5_REVISION = "a98b0fcd0b8137ded40cdf0c0cf0ee884e7c9726"
EMBEDDING_DIMENSION = 768

MODEL_ASSETS = [
    {
        "name": "tinystyler-transfer-weights",
        "cachePath": "models/tinystyler_model_weights.pt",
        "expectedSizeBytes": 3136036422,
        "sha256": "8b60d2c32bb46fc0ffe3329a48c3664a794f1c195257365d5dc3753732ea6acd",
        "revision": TINYSTYLER_REVISION,
    },
    {
        "name": "t5-v1_1-large-backbone",
        "cachePath": "models/google-t5-v1_1-large/pytorch_model.bin",
        "expectedSizeBytes": 3132858253,
        "sha256": "329243624cf70001991b9f0410d222a618bd33188eadc9890259b60cbc78f944",
        "revision": T5_REVISION,
    },
    {
        "name": "style-embedding-model-weights",
        "cachePath": "models/style-embedding/pytorch_model.bin",
        "expectedSizeBytes": 498669047,
        "sha256": "3186cd80660a7169a911bace4d54416cf5771a319a22f84c3a79a961ecb0c6f5",
        "revision": STYLE_EMBEDDING_REVISION,
    },
]


class UserFacingError(Exception):
    pass


def main() -> None:
    parser = argparse.ArgumentParser(prog="tinystyler_cli.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser("doctor", help="Report package readiness and model asset contract.")
    doctor_parser.add_argument("--json", action="store_true", help="Emit JSON. Doctor emits JSON by default.")
    doctor_parser.add_argument("--require-real", action="store_true", help="Fail unless real TinyStyler runtime commands are implemented.")

    profile_parser = subparsers.add_parser("profile", help="Create a TinyStyler style profile.")
    profile_parser.add_argument("--examples-file", required=True)
    profile_parser.add_argument("--output-profile", required=True)
    profile_parser.add_argument("--profile-name", required=True)
    profile_parser.add_argument("--include-source-text", default="false", choices=["true", "false"])
    profile_parser.add_argument("--device", default="auto", choices=["auto", "mps", "cpu", "cuda"])
    profile_parser.add_argument("--seed", type=int, default=0)
    profile_parser.add_argument("--fake", action="store_true")
    profile_parser.add_argument("--json", action="store_true")

    transfer_parser = subparsers.add_parser("transfer", help="Apply a TinyStyler profile to source text.")
    source_group = transfer_parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--input-file")
    source_group.add_argument("--text")
    style_group = transfer_parser.add_mutually_exclusive_group(required=True)
    style_group.add_argument("--profile")
    style_group.add_argument("--examples-file")
    transfer_parser.add_argument("--output-file", required=True)
    transfer_parser.add_argument("--temperature", type=float, default=1.0)
    transfer_parser.add_argument("--top-p", type=float, default=1.0)
    transfer_parser.add_argument("--seed", type=int, default=0)
    transfer_parser.add_argument("--max-new-tokens", type=int, default=128)
    transfer_parser.add_argument("--device", default="auto", choices=["auto", "mps", "cpu", "cuda"])
    transfer_parser.add_argument("--fake", action="store_true")
    transfer_parser.add_argument("--json", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "doctor":
            payload = doctor_payload()
            write_json(payload)
            if args.require_real and not payload["realRuntimeImplemented"]:
                raise UserFacingError("Real TinyStyler profile/transfer runtime is not implemented in this slice.")
        elif args.command == "profile":
            require_fake_runtime(args.fake)
            write_json(create_fake_profile(args))
        elif args.command == "transfer":
            validate_transfer_args(args)
            require_fake_runtime(args.fake)
            write_json(run_fake_transfer(args))
        else:
            raise UserFacingError(f"Unknown command: {args.command}")
    except UserFacingError as error:
        sys.stderr.write(f"{error}\n")
        sys.exit(1)


def doctor_payload() -> dict[str, Any]:
    package_root = package_root_path()
    return {
        "packageName": PACKAGE_NAME,
        "version": PACKAGE_VERSION,
        "status": "contract_ready",
        "contractReady": True,
        "ready": False,
        "nonMutating": True,
        "realRuntimeImplemented": False,
        "fakeRuntimeAvailable": True,
        "python": {
            "executable": sys.executable,
            "version": platform.python_version(),
        },
        "platform": {
            "os": platform.system().lower(),
            "machine": platform.machine(),
        },
        "revisions": {
            "tinystyler": TINYSTYLER_REVISION,
            "styleEmbedding": STYLE_EMBEDDING_REVISION,
            "t5": T5_REVISION,
        },
        "modelAssets": [asset_status(package_root, asset) for asset in MODEL_ASSETS],
        "commands": {
            "tinystyler_profile": {
                "runtimeStatus": "fake-only-in-slice-1",
                "realImplementationSlice": "profile command",
            },
            "tinystyler_transfer": {
                "runtimeStatus": "fake-only-in-slice-1",
                "realImplementationSlice": "transfer command",
            },
        },
        "safety": [
            "Raw style examples are not persisted unless --include-source-text true is explicit.",
            "Real model execution must load only declared, reviewed model assets from package cache paths.",
            "Do not silently fall back to prompt-only rewriting when model assets are missing.",
        ],
    }


def asset_status(package_root: Path, asset: dict[str, Any]) -> dict[str, Any]:
    path = package_root / asset["cachePath"]
    status: dict[str, Any] = {
        **asset,
        "path": str(path),
        "exists": path.is_file(),
    }
    if path.is_file():
        stat = path.stat()
        status["actualSizeBytes"] = stat.st_size
        status["sizeMatches"] = stat.st_size == asset["expectedSizeBytes"]
    return status


def create_fake_profile(args: argparse.Namespace) -> dict[str, Any]:
    profile_name = normalize_profile_name(args.profile_name)
    examples_path = resolve_input_path(args.examples_file)
    examples = read_examples(examples_path)
    if not examples:
        raise UserFacingError("Examples file did not contain any text examples.")

    raw_persisted = args.include_source_text == "true"
    output_path = resolve_output_path(args.output_profile)
    profile = {
        "schemaVersion": PROFILE_SCHEMA_VERSION,
        "profileName": profile_name,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceSummary": {
            "exampleCount": len(examples),
            "charCount": sum(len(example) for example in examples),
            "rawTextPersisted": raw_persisted,
            "exactSourceVerifiersPersisted": False,
            **({"sourceExamples": examples} if raw_persisted else {}),
        },
        "createdWith": {
            "packageVersion": PACKAGE_VERSION,
            "tinystylerRevision": TINYSTYLER_REVISION,
            "styleEmbeddingRevision": STYLE_EMBEDDING_REVISION,
            "t5Revision": T5_REVISION,
            "runtimeMode": "fake",
        },
        "embedding": {
            "model": "AnnaWegmann/Style-Embedding",
            "dimension": EMBEDDING_DIMENSION,
            "pooling": "mean",
            "dtype": "float32",
            "values": fake_embedding(profile_name, examples, args.seed),
        },
        "generationDefaults": {
            "model": "tinystyler/tinystyler",
            "temperature": 1.0,
            "topP": 1.0,
            "maxNewTokens": 128,
        },
        "safety": {
            "impersonationWarningShown": True,
            "intendedUse": "style adaptation",
            "warnings": ["Fake runtime profile for Ambient CLI contract validation; real embeddings are added in a later slice."],
        },
    }
    write_json_file(output_path, profile)
    return {
        "packageName": PACKAGE_NAME,
        "status": "profile_created",
        "fake": True,
        "profilePath": str(output_path),
        "profileName": profile_name,
        "sourceSummary": {
            "exampleCount": len(examples),
            "charCount": sum(len(example) for example in examples),
            "rawTextPersisted": raw_persisted,
        },
        "embedding": {
            "dimension": EMBEDDING_DIMENSION,
            "sha256": sha256_text(json.dumps(profile["embedding"]["values"], separators=(",", ":"))),
        },
    }


def run_fake_transfer(args: argparse.Namespace) -> dict[str, Any]:
    source_text = read_text_arg(args.text, args.input_file)
    profile_name = "direct-examples"
    profile_path = None
    if args.profile:
        profile_path = resolve_input_path(args.profile)
        profile = read_json_file(profile_path)
        validate_profile_shape(profile)
        profile_name = str(profile["profileName"])
    else:
        examples = read_examples(resolve_input_path(args.examples_file))
        if not examples:
            raise UserFacingError("Examples file did not contain any text examples.")
        profile_name = f"direct-examples-{len(examples)}"

    output_text = fake_transfer_text(profile_name, source_text, args.seed)
    output_path = resolve_output_path(args.output_file)
    write_text_file(output_path, output_text)

    return {
        "packageName": PACKAGE_NAME,
        "status": "transfer_created",
        "fake": True,
        "profileName": profile_name,
        "profilePath": str(profile_path) if profile_path else None,
        "outputPath": str(output_path),
        "metadata": {
            "device": args.device,
            "temperature": args.temperature,
            "topP": args.top_p,
            "seed": args.seed,
            "maxNewTokens": args.max_new_tokens,
            "sourceCharCount": len(source_text),
            "outputCharCount": len(output_text),
            "runtimeMode": "fake",
            "tinystylerRevision": TINYSTYLER_REVISION,
            "styleEmbeddingRevision": STYLE_EMBEDDING_REVISION,
            "t5Revision": T5_REVISION,
        },
    }


def validate_transfer_args(args: argparse.Namespace) -> None:
    if not math.isfinite(args.temperature) or args.temperature < 0:
        raise UserFacingError("--temperature must be a finite number greater than or equal to 0.")
    if not math.isfinite(args.top_p) or args.top_p < 0 or args.top_p > 1:
        raise UserFacingError("--top-p must be a finite number between 0 and 1.")
    if args.max_new_tokens < 1:
        raise UserFacingError("--max-new-tokens must be greater than or equal to 1.")


def normalize_profile_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise UserFacingError("--profile-name must not be empty.")
    return normalized


def require_fake_runtime(flag: bool) -> None:
    if flag or os.environ.get("AMBIENT_TINYSTYLER_FAKE_RUNTIME") == "1":
        return
    raise UserFacingError(
        "Real TinyStyler execution is not implemented in this package-contract slice. "
        "Set AMBIENT_TINYSTYLER_FAKE_RUNTIME=1 only for deterministic contract tests."
    )


def read_examples(path: Path) -> list[str]:
    raw = path.read_bytes()
    if b"\x00" in raw:
        raise UserFacingError(f"Examples file appears to be binary: {path}")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise UserFacingError(f"Examples file must be UTF-8 text: {path}") from error
    if path.suffix.lower() == ".jsonl":
        examples = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError as error:
                raise UserFacingError(f"Invalid JSONL on line {line_number}: {error}") from error
            if isinstance(parsed, str):
                examples.append(parsed)
            elif isinstance(parsed, dict):
                value = parsed.get("text") or parsed.get("content") or parsed.get("example")
                if isinstance(value, str):
                    examples.append(value)
                else:
                    raise UserFacingError(f"JSONL line {line_number} must contain text, content, or example.")
            else:
                raise UserFacingError(f"JSONL line {line_number} must be a string or object.")
        return [example.strip() for example in examples if example.strip()]
    return [part.strip() for part in text.split("\n\n") if part.strip()]


def read_text_arg(text: Optional[str], input_file: Optional[str]) -> str:
    if text is not None:
        value = text
    else:
        value = resolve_input_path(input_file or "").read_text("utf-8")
    if not value.strip():
        raise UserFacingError("Source text is empty.")
    return value


def validate_profile_shape(profile: Any) -> None:
    if not isinstance(profile, dict):
        raise UserFacingError("Profile JSON must be an object.")
    if profile.get("schemaVersion") != PROFILE_SCHEMA_VERSION:
        raise UserFacingError("Profile schemaVersion is not ambient.tinystyler.profile.v1.")
    if not isinstance(profile.get("profileName"), str) or not profile["profileName"].strip():
        raise UserFacingError("Profile must declare profileName.")
    embedding = profile.get("embedding")
    if not isinstance(embedding, dict) or embedding.get("dimension") != EMBEDDING_DIMENSION:
        raise UserFacingError(f"Profile embedding.dimension must be {EMBEDDING_DIMENSION}.")
    values = embedding.get("values")
    if not isinstance(values, list) or len(values) != EMBEDDING_DIMENSION:
        raise UserFacingError(f"Profile embedding.values must contain {EMBEDDING_DIMENSION} numbers.")
    if any(not is_finite_number(value) for value in values):
        raise UserFacingError(f"Profile embedding.values must contain {EMBEDDING_DIMENSION} finite numbers.")


def fake_embedding(profile_name: str, examples: list[str], seed: int) -> list[float]:
    total_chars = sum(len(example) for example in examples)
    char_bucket = ((total_chars + 99) // 100) * 100
    material = f"fake-embedding-v1\n{profile_name}\n{seed}\nexamples:{len(examples)}\nchars:{char_bucket}"
    digest = hashlib.sha256(material.encode("utf-8")).digest()
    values = []
    counter = 0
    while len(values) < EMBEDDING_DIMENSION:
        block = hashlib.sha256(digest + counter.to_bytes(4, "big")).digest()
        for index in range(0, len(block), 2):
            integer = int.from_bytes(block[index : index + 2], "big")
            values.append(round((integer / 65535.0) * 2.0 - 1.0, 6))
            if len(values) == EMBEDDING_DIMENSION:
                break
        counter += 1
    return values


def is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def fake_transfer_text(profile_name: str, source_text: str, seed: int) -> str:
    prefix = f"[{profile_name} style transfer; deterministic fake seed {seed}]"
    return f"{prefix}\n{source_text}"


def resolve_input_path(value: str) -> Path:
    if not value:
        raise UserFacingError("Input path is required.")
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (workspace_root() / path).resolve()
    ensure_inside_workspace(resolved, "Input")
    if not resolved.is_file():
        raise UserFacingError(f"Input file does not exist: {value}")
    return resolved


def resolve_output_path(value: str) -> Path:
    if not value:
        raise UserFacingError("Output path is required.")
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (workspace_root() / path).resolve()
    ensure_inside_workspace(resolved, "Output")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def workspace_root() -> Path:
    value = os.environ.get("AMBIENT_WORKSPACE_PATH") or os.environ.get("AMBIENT_DESKTOP_WORKSPACE")
    return Path(value).resolve() if value else Path.cwd().resolve()


def ensure_inside_workspace(path: Path, label: str) -> None:
    root = workspace_root()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise UserFacingError(f"{label} path must stay inside the Ambient workspace: {path}") from error


def package_root_path() -> Path:
    return Path(__file__).resolve().parents[1]


def read_json_file(path: Path) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except json.JSONDecodeError as error:
        raise UserFacingError(f"Invalid JSON file: {path}: {error}") from error


def write_json_file(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=False, allow_nan=False) + "\n", "utf-8")


def write_text_file(path: Path, value: str) -> None:
    path.write_text(value, "utf-8")


def write_json(payload: Any) -> None:
    try:
        sys.stdout.write(json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n")
    except ValueError as error:
        raise UserFacingError(f"JSON response contains unsupported numeric value: {error}") from error


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


if __name__ == "__main__":
    main()
