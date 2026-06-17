#!/usr/bin/env python3
"""Ambient TinyStyler package wrapper.

This wrapper implements the package contract, profile creation, transfer
generation, and deterministic validation paths.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import platform
import sys
import time
from collections.abc import Mapping
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
PROFILE_FIXTURE_ENV = "AMBIENT_TINYSTYLER_PROFILE_EMBEDDING_FIXTURE"
TRANSFER_FIXTURE_ENV = "AMBIENT_TINYSTYLER_TRANSFER_FIXTURE"
STYLE_EMBEDDING_MODEL_DIR = "models/style-embedding"
T5_MODEL_DIR = "models/google-t5-v1_1-large"
TINYSTYLER_WEIGHTS_PATH = "models/tinystyler_model_weights.pt"
SOURCE_MAX_TOKENS = 80
STYLE_EMBEDDING_REQUIRED_FILES = [
    "pytorch_model.bin",
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
]
T5_REQUIRED_FILES = [
    "pytorch_model.bin",
    "config.json",
    "spiece.model",
    "tokenizer_config.json",
    "special_tokens_map.json",
]
REAL_PROFILE_RUNTIME_MODES = {"style-embedding-transformers"}

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
        "name": "t5-v1_1-large-config",
        "cachePath": "models/google-t5-v1_1-large/config.json",
        "expectedSizeBytes": 607,
        "sha256": "d0b3d0e585673b63c9218e0c526ac6f487e949c66c678e23172f2dbfa5ec73ee",
        "revision": T5_REVISION,
    },
    {
        "name": "t5-v1_1-large-spiece-model",
        "cachePath": "models/google-t5-v1_1-large/spiece.model",
        "expectedSizeBytes": 791656,
        "sha256": "d60acb128cf7b7f2536e8f38a5b18a05535c9e14c7a355904270e15b0945ea86",
        "revision": T5_REVISION,
    },
    {
        "name": "t5-v1_1-large-tokenizer-config",
        "cachePath": "models/google-t5-v1_1-large/tokenizer_config.json",
        "expectedSizeBytes": 1857,
        "sha256": "b971dce1d2805c2a66da8657156e7114a30501c6ba602fc947c8bf607a3ead2d",
        "revision": T5_REVISION,
    },
    {
        "name": "t5-v1_1-large-special-tokens-map",
        "cachePath": "models/google-t5-v1_1-large/special_tokens_map.json",
        "expectedSizeBytes": 1786,
        "sha256": "4720c0fddbe4c5991334f85ad7073d9bd0a294a8ba4641a2f8dab614ca825949",
        "revision": T5_REVISION,
    },
    {
        "name": "style-embedding-model-weights",
        "cachePath": "models/style-embedding/pytorch_model.bin",
        "expectedSizeBytes": 498669047,
        "sha256": "3186cd80660a7169a911bace4d54416cf5771a319a22f84c3a79a961ecb0c6f5",
        "revision": STYLE_EMBEDDING_REVISION,
    },
    {
        "name": "style-embedding-config",
        "cachePath": "models/style-embedding/config.json",
        "expectedSizeBytes": 718,
        "sha256": "2ed20b6297d7f5652f3a381221ce42cc592b7ebde6b61e3604df385904224311",
        "revision": STYLE_EMBEDDING_REVISION,
    },
    {
        "name": "style-embedding-tokenizer",
        "cachePath": "models/style-embedding/tokenizer.json",
        "expectedSizeBytes": 1356048,
        "sha256": "82139106e603ee4e1d5bc99d056ccbed5a92bc24848b1b5a7137c26e00d0dbf6",
        "revision": STYLE_EMBEDDING_REVISION,
    },
    {
        "name": "style-embedding-tokenizer-config",
        "cachePath": "models/style-embedding/tokenizer_config.json",
        "expectedSizeBytes": 354,
        "sha256": "72824f8b68a49929f38b29c0d2e6f7664ea68846b5447791fc83bf1ad1778127",
        "revision": STYLE_EMBEDDING_REVISION,
    },
    {
        "name": "style-embedding-special-tokens-map",
        "cachePath": "models/style-embedding/special_tokens_map.json",
        "expectedSizeBytes": 239,
        "sha256": "378eb3bf733eb16e65792d7e3fda5b8a4631387ca04d2015199c4d4f22ae554d",
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
                raise UserFacingError("Real TinyStyler profile/transfer runtime is not implemented.")
        elif args.command == "profile":
            write_json(create_profile(args))
        elif args.command == "transfer":
            validate_transfer_args(args)
            write_json(create_transfer(args))
        else:
            raise UserFacingError(f"Unknown command: {args.command}")
    except UserFacingError as error:
        sys.stderr.write(f"{error}\n")
        sys.exit(1)


def doctor_payload() -> dict[str, Any]:
    package_root = package_root_path()
    style_runtime = style_embedding_runtime_status(package_root)
    transfer_runtime = transfer_runtime_status(package_root)
    return {
        "packageName": PACKAGE_NAME,
        "version": PACKAGE_VERSION,
        "status": "contract_ready",
        "contractReady": True,
        "ready": style_runtime["ready"] and transfer_runtime["ready"],
        "nonMutating": True,
        "realRuntimeImplemented": True,
        "profileRuntimeImplemented": True,
        "transferRuntimeImplemented": True,
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
        "pythonDependencies": python_dependency_status(),
        "styleEmbeddingRuntime": style_runtime,
        "transferRuntime": transfer_runtime,
        "commands": {
            "tinystyler_profile": {
                "runtimeStatus": "implemented-needs-dependencies-and-assets",
                "realImplementationSlice": "profile command",
            },
            "tinystyler_transfer": {
                "runtimeStatus": "implemented-needs-dependencies-and-assets",
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


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def python_dependency_status() -> dict[str, bool]:
    return {
        "torch": module_available("torch"),
        "transformers": module_available("transformers"),
        "sentencepiece": module_available("sentencepiece"),
        "numpy": module_available("numpy"),
    }


def style_embedding_runtime_status(package_root: Path) -> dict[str, Any]:
    model_dir = package_root / STYLE_EMBEDDING_MODEL_DIR
    required_files = [
        {
            "path": str(model_dir / filename),
            "exists": (model_dir / filename).is_file(),
        }
        for filename in STYLE_EMBEDDING_REQUIRED_FILES
    ]
    dependencies = python_dependency_status()
    dependency_ready = dependencies["torch"] and dependencies["transformers"]
    files_ready = all(item["exists"] for item in required_files)
    assets_verified = False
    asset_verification_error = None
    if files_ready:
        try:
            verify_style_embedding_assets(package_root, model_dir)
            assets_verified = True
        except UserFacingError as error:
            asset_verification_error = str(error)
    else:
        missing = [
            Path(item["path"]).name
            for item in required_files
            if not item["exists"]
        ]
        asset_verification_error = "Style-Embedding model cache is incomplete. Missing: " + ", ".join(missing)
    return {
        "modelDir": str(model_dir),
        "requiredFiles": required_files,
        "dependenciesReady": dependency_ready,
        "filesReady": files_ready,
        "assetsVerified": assets_verified,
        "assetVerificationError": asset_verification_error,
        "ready": dependency_ready and assets_verified,
        "fixtureAvailable": True,
    }


def transfer_runtime_status(package_root: Path) -> dict[str, Any]:
    required_paths = [TINYSTYLER_WEIGHTS_PATH] + [f"{T5_MODEL_DIR}/{filename}" for filename in T5_REQUIRED_FILES]
    required_files = [
        transfer_doctor_asset_status(package_root, cache_path)
        for cache_path in required_paths
    ]
    dependencies = python_dependency_status()
    dependency_ready = dependencies["torch"] and dependencies["transformers"] and dependencies["sentencepiece"]
    files_ready = all(item["exists"] and item.get("sizeMatches") is not False for item in required_files)
    asset_verification_error = None
    if not files_ready:
        missing = [
            str(Path(item["path"]).relative_to(package_root))
            for item in required_files
            if not item["exists"]
        ]
        size_mismatches = [
            str(Path(item["path"]).relative_to(package_root))
            for item in required_files
            if item["exists"] and item.get("sizeMatches") is False
        ]
        problems = []
        if missing:
            problems.append("Missing: " + ", ".join(missing))
        if size_mismatches:
            problems.append("Size mismatch: " + ", ".join(size_mismatches))
        asset_verification_error = "TinyStyler transfer model cache is incomplete. " + "; ".join(problems)
    return {
        "modelDir": str(package_root / T5_MODEL_DIR),
        "weightsPath": str(package_root / TINYSTYLER_WEIGHTS_PATH),
        "requiredFiles": required_files,
        "dependenciesReady": dependency_ready,
        "filesReady": files_ready,
        "assetsVerified": False,
        "fullVerification": "deferred-until-transfer",
        "assetVerificationError": asset_verification_error,
        "preflightReady": dependency_ready and files_ready,
        "ready": False,
        "fixtureAvailable": True,
    }


def transfer_doctor_asset_status(package_root: Path, cache_path: str) -> dict[str, Any]:
    asset = next((item for item in MODEL_ASSETS if item["cachePath"] == cache_path), None)
    path = package_root / cache_path
    status: dict[str, Any] = {
        "path": str(path),
        "exists": path.is_file(),
    }
    if asset:
        status["expectedSizeBytes"] = asset["expectedSizeBytes"]
    if path.is_file():
        stat = path.stat()
        status["actualSizeBytes"] = stat.st_size
        if asset:
            status["sizeMatches"] = stat.st_size == asset["expectedSizeBytes"]
    return status


def create_profile(args: argparse.Namespace) -> dict[str, Any]:
    profile_name = normalize_profile_name(args.profile_name)
    examples_path = resolve_input_path(args.examples_file)
    examples = read_examples(examples_path)
    if not examples:
        raise UserFacingError("Examples file did not contain any text examples.")

    raw_persisted = args.include_source_text == "true"
    output_path = resolve_output_path(args.output_profile)
    started = time.perf_counter()
    embedding_values, runtime = profile_embedding_values(profile_name, examples, args)
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
            "runtimeMode": runtime["runtimeMode"],
        },
        "embedding": {
            "model": "AnnaWegmann/Style-Embedding",
            "dimension": EMBEDDING_DIMENSION,
            "pooling": "mean",
            "dtype": "float32",
            "values": embedding_values,
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
            "warnings": runtime["warnings"],
        },
    }
    validate_profile_shape(profile)
    write_json_file(output_path, profile)
    total_ms = elapsed_ms(started)
    return {
        "packageName": PACKAGE_NAME,
        "status": "profile_created",
        "fake": runtime["runtimeMode"] == "fake",
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
        "metadata": {
            "runtimeMode": runtime["runtimeMode"],
            "deviceRequested": args.device,
            "device": runtime["device"],
            "modelLoadMs": runtime["modelLoadMs"],
            "embeddingMs": runtime["embeddingMs"],
            "totalMs": total_ms,
            "styleEmbeddingRevision": STYLE_EMBEDDING_REVISION,
            "t5Revision": T5_REVISION,
            "tinystylerRevision": TINYSTYLER_REVISION,
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
            "sourceTokenLimit": SOURCE_MAX_TOKENS,
            "outputCharCount": len(output_text),
            "runtimeMode": "fake",
            "tinystylerRevision": TINYSTYLER_REVISION,
            "styleEmbeddingRevision": STYLE_EMBEDDING_REVISION,
            "t5Revision": T5_REVISION,
        },
    }


def create_transfer(args: argparse.Namespace) -> dict[str, Any]:
    if is_fake_runtime(args):
        return run_fake_transfer(args)

    started = time.perf_counter()
    source_text = read_text_arg(args.text, args.input_file)
    style = load_transfer_style(args)
    output_path = resolve_output_path(args.output_file)
    if is_transfer_fixture_runtime():
        generation_started = time.perf_counter()
        output_text = fixture_transfer_text(style["profileName"], source_text, args.seed)
        runtime = {
            "runtimeMode": "fixture-transfer",
            "device": "fixture",
            "modelLoadMs": 0,
            "generationMs": elapsed_ms(generation_started),
            "warnings": ["Deterministic fixture transfer for command validation; not real TinyStyler generation."],
        }
    else:
        output_text, runtime = run_real_tinystyler_transfer(args, source_text, style["embeddingValues"])
    write_text_file(output_path, output_text)

    return {
        "packageName": PACKAGE_NAME,
        "status": "transfer_created",
        "fake": False,
        "profileName": style["profileName"],
        "profilePath": str(style["profilePath"]) if style["profilePath"] else None,
        "outputPath": str(output_path),
        "metadata": {
            "runtimeMode": runtime["runtimeMode"],
            "styleInput": style["styleInput"],
            "styleRuntimeMode": style["styleRuntimeMode"],
            "deviceRequested": args.device,
            "device": runtime["device"],
            "temperature": args.temperature,
            "topP": args.top_p,
            "seed": args.seed,
            "maxNewTokens": args.max_new_tokens,
            "sourceCharCount": len(source_text),
            "outputCharCount": len(output_text),
            "embeddingSha256": sha256_text(json.dumps(style["embeddingValues"], separators=(",", ":"))),
            "modelLoadMs": runtime["modelLoadMs"],
            "generationMs": runtime["generationMs"],
            **({"sourceTokenCount": runtime["sourceTokenCount"]} if "sourceTokenCount" in runtime else {}),
            "totalMs": elapsed_ms(started),
            "tinystylerRevision": TINYSTYLER_REVISION,
            "styleEmbeddingRevision": STYLE_EMBEDDING_REVISION,
            "t5Revision": T5_REVISION,
            **({"warnings": runtime["warnings"]} if runtime["warnings"] else {}),
        },
    }


def load_transfer_style(args: argparse.Namespace) -> dict[str, Any]:
    if args.profile:
        profile_path = resolve_input_path(args.profile)
        profile = read_json_file(profile_path)
        validate_profile_shape(profile)
        style_runtime_mode = profile["createdWith"]["runtimeMode"]
        validate_real_transfer_style_runtime(style_runtime_mode)
        return {
            "profileName": str(profile["profileName"]),
            "profilePath": profile_path,
            "embeddingValues": finite_float_vector(profile["embedding"]["values"], "Profile embedding vector"),
            "styleInput": "profile",
            "styleRuntimeMode": style_runtime_mode,
        }

    examples = read_examples(resolve_input_path(args.examples_file))
    if not examples:
        raise UserFacingError("Examples file did not contain any text examples.")
    profile_name = f"direct-examples-{len(examples)}"
    if is_transfer_fixture_runtime():
        embedding_values = fixture_embedding(profile_name, examples, args.seed)
        style_runtime_mode = "fixture-style-embedding"
    else:
        embedding_values, style_runtime = profile_embedding_values(profile_name, examples, args)
        style_runtime_mode = style_runtime["runtimeMode"]
        validate_real_transfer_style_runtime(style_runtime_mode)
    return {
        "profileName": profile_name,
        "profilePath": None,
        "embeddingValues": embedding_values,
        "styleInput": "examples",
        "styleRuntimeMode": style_runtime_mode,
    }


def validate_real_transfer_style_runtime(runtime_mode: str) -> None:
    if is_transfer_fixture_runtime():
        return
    if runtime_mode not in REAL_PROFILE_RUNTIME_MODES:
        raise UserFacingError(
            "Real TinyStyler transfer requires a profile produced by real Style-Embedding extraction. "
            f"Profile runtimeMode was {runtime_mode!r}; recreate the profile without --fake or fixture validation mode."
        )


def profile_embedding_values(profile_name: str, examples: list[str], args: argparse.Namespace) -> tuple[list[float], dict[str, Any]]:
    if args.fake or os.environ.get("AMBIENT_TINYSTYLER_FAKE_RUNTIME") == "1":
        started = time.perf_counter()
        return fake_embedding(profile_name, examples, args.seed), {
            "runtimeMode": "fake",
            "device": "none",
            "modelLoadMs": 0,
            "embeddingMs": elapsed_ms(started),
            "warnings": ["Fake runtime profile for Ambient CLI contract validation."],
        }
    if os.environ.get(PROFILE_FIXTURE_ENV) == "1":
        started = time.perf_counter()
        return fixture_embedding(profile_name, examples, args.seed), {
            "runtimeMode": "fixture-style-embedding",
            "device": "fixture",
            "modelLoadMs": 0,
            "embeddingMs": elapsed_ms(started),
            "warnings": ["Deterministic fixture embedding for profile command validation; not a real style vector."],
        }
    return extract_style_embedding_profile(examples, args.device)


def extract_style_embedding_profile(examples: list[str], requested_device: str) -> tuple[list[float], dict[str, Any]]:
    package_root = package_root_path()
    model_dir = package_root / STYLE_EMBEDDING_MODEL_DIR
    verify_style_embedding_assets(package_root, model_dir)

    try:
        import torch  # type: ignore
    except ImportError as error:
        raise UserFacingError("Real profile extraction requires the Python package torch.") from error

    device = resolve_torch_device(torch, requested_device)
    model_load_started = time.perf_counter()
    try:
        from transformers import AutoModel, AutoTokenizer  # type: ignore
    except ImportError as error:
        raise UserFacingError("Real profile extraction requires transformers in addition to torch.") from error

    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True)
    model = AutoModel.from_pretrained(str(model_dir), local_files_only=True)
    model.to(device)
    model.eval()
    model_load_ms = elapsed_ms(model_load_started)
    embedding_started = time.perf_counter()
    encoded = tokenizer(examples, padding=True, truncation=True, max_length=512, return_tensors="pt")
    encoded = {key: value.to(device) for key, value in encoded.items()}
    with torch.no_grad():
        model_output = model(**encoded)
    sentence_embeddings = mean_pooling(torch, model_output, encoded["attention_mask"])
    profile_embedding = sentence_embeddings.mean(dim=0).detach().cpu().tolist()
    values = finite_float_vector(profile_embedding, "Style-Embedding profile vector")
    return values, {
        "runtimeMode": "style-embedding-transformers",
        "device": device,
        "modelLoadMs": model_load_ms,
        "embeddingMs": elapsed_ms(embedding_started),
        "warnings": [],
    }


def run_real_tinystyler_transfer(args: argparse.Namespace, source_text: str, embedding_values: list[float]) -> tuple[str, dict[str, Any]]:
    package_root = package_root_path()
    verify_transfer_assets(package_root)

    try:
        import torch  # type: ignore
    except ImportError as error:
        raise UserFacingError("Real transfer requires the Python package torch.") from error
    try:
        from transformers import T5ForConditionalGeneration, T5Tokenizer  # type: ignore
    except ImportError as error:
        raise UserFacingError("Real transfer requires transformers with T5 support.") from error
    if not module_available("sentencepiece"):
        raise UserFacingError("Real transfer requires the Python package sentencepiece for the T5 tokenizer.")

    base_model_dir = package_root / T5_MODEL_DIR
    weights_path = package_root / TINYSTYLER_WEIGHTS_PATH
    tokenizer = T5Tokenizer.from_pretrained(str(base_model_dir), local_files_only=True)
    source_token_count = validate_transfer_source_length(tokenizer, source_text)

    device = resolve_torch_device(torch, args.device)
    seed_torch(torch, args.seed)
    model_load_started = time.perf_counter()
    model = build_tinystyler_model(torch, T5ForConditionalGeneration, base_model_dir)
    state_dict = load_torch_state_dict(torch, weights_path, "cpu")
    model.load_state_dict(state_dict)
    del state_dict
    model.to(device)
    model.eval()
    model_load_ms = elapsed_ms(model_load_started)

    generation_started = time.perf_counter()
    encoded = tokenizer(
        [source_text],
        return_tensors="pt",
        padding="max_length",
        max_length=SOURCE_MAX_TOKENS,
        truncation=False,
    )
    encoded = {key: value.to(device) for key, value in encoded.items()}
    style = torch.tensor(embedding_values, dtype=torch.float32, device=device).unsqueeze(0)
    generation_kwargs: dict[str, Any] = {
        "max_new_tokens": args.max_new_tokens,
        "do_sample": args.temperature > 0,
    }
    if args.temperature > 0:
        generation_kwargs["temperature"] = args.temperature
        generation_kwargs["top_p"] = args.top_p
    with torch.no_grad():
        outputs = model.generate(**encoded, style=style, **generation_kwargs)
    decoded = tokenizer.batch_decode(outputs, skip_special_tokens=True)
    output_text = decoded[0].strip() if decoded else ""
    if not output_text:
        raise UserFacingError("TinyStyler generated empty output.")
    return output_text, {
        "runtimeMode": "tinystyler-local",
        "device": device,
        "modelLoadMs": model_load_ms,
        "generationMs": elapsed_ms(generation_started),
        "sourceTokenCount": source_token_count,
        "warnings": [],
    }


def validate_transfer_source_length(tokenizer: Any, source_text: str) -> int:
    encoded = tokenizer(source_text, add_special_tokens=True, truncation=False)
    input_ids = encoded.get("input_ids") if isinstance(encoded, Mapping) else None
    if not isinstance(input_ids, list):
        raise UserFacingError("Unable to determine TinyStyler source token count before transfer.")
    token_count = len(input_ids)
    if token_count > SOURCE_MAX_TOKENS:
        raise UserFacingError(
            "Source text is too long for one TinyStyler transfer call. "
            f"T5 tokenized it to {token_count} tokens; the current limit is {SOURCE_MAX_TOKENS}. "
            "Split the source into shorter passages and run transfer for each passage."
        )
    return token_count


def build_tinystyler_model(torch: Any, t5_class: Any, base_model_dir: Path) -> Any:
    class LocalTinyStyler(torch.nn.Module):  # type: ignore[name-defined]
        def __init__(self) -> None:
            super().__init__()
            self.model = t5_class.from_pretrained(str(base_model_dir), local_files_only=True)
            hidden_size = self.model.config.d_model if hasattr(self.model.config, "d_model") else self.model.config.hidden_size
            self.proj = torch.nn.Linear(EMBEDDING_DIMENSION, hidden_size)

        def generate(self, input_ids: Any, attention_mask: Any, style: Any, **kwargs: Any) -> Any:
            style_embed = self.proj(style.unsqueeze(1))
            input_embeds = self.model.get_input_embeddings()(input_ids)
            input_embeds = torch.cat([style_embed, input_embeds], dim=1)
            style_mask = torch.ones((input_embeds.shape[0], 1), dtype=attention_mask.dtype, device=attention_mask.device)
            attention_mask = torch.cat([style_mask, attention_mask], dim=1)
            return self.model.generate(inputs_embeds=input_embeds, attention_mask=attention_mask, **kwargs)

    return LocalTinyStyler()


def load_torch_state_dict(torch: Any, path: Path, device: str) -> Any:
    try:
        return torch.load(path, map_location=device, weights_only=True)
    except TypeError:
        return torch.load(path, map_location=device)


def seed_torch(torch: Any, seed: int) -> None:
    torch.manual_seed(seed)
    if hasattr(torch, "cuda") and torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def verify_style_embedding_assets(package_root: Path, model_dir: Path) -> None:
    declared_assets = [
        asset
        for asset in MODEL_ASSETS
        if str(asset["cachePath"]).startswith(f"{STYLE_EMBEDDING_MODEL_DIR}/")
    ]
    for asset in declared_assets:
        path = package_root / asset["cachePath"]
        if not path.is_file():
            missing = path.relative_to(model_dir) if is_path_relative_to(path, model_dir) else path
            raise UserFacingError(
                "Style-Embedding model cache is incomplete. "
                f"Missing {missing} under {model_dir}. "
                "Run the approved TinyStyler dependency/model setup before real profile extraction."
            )
        stat = path.stat()
        if stat.st_size != asset["expectedSizeBytes"]:
            raise UserFacingError(
                "Style-Embedding model asset size mismatch before load. "
                f"{path} expected {asset['expectedSizeBytes']} bytes, found {stat.st_size} bytes."
            )
        actual_sha = sha256_file(path)
        if actual_sha != asset["sha256"]:
            raise UserFacingError(
                "Style-Embedding model asset SHA-256 mismatch before load. "
                f"{path} expected {asset['sha256']}, found {actual_sha}."
            )


def verify_transfer_assets(package_root: Path) -> None:
    required_paths = {TINYSTYLER_WEIGHTS_PATH, *[f"{T5_MODEL_DIR}/{filename}" for filename in T5_REQUIRED_FILES]}
    declared_assets = [asset for asset in MODEL_ASSETS if str(asset["cachePath"]) in required_paths]
    declared_paths = {str(asset["cachePath"]) for asset in declared_assets}
    missing_declarations = sorted(required_paths - declared_paths)
    if missing_declarations:
        raise UserFacingError("TinyStyler transfer asset declarations are incomplete: " + ", ".join(missing_declarations))
    for asset in declared_assets:
        path = package_root / asset["cachePath"]
        if not path.is_file():
            raise UserFacingError(
                "TinyStyler transfer model cache is incomplete. "
                f"Missing {asset['cachePath']} under {package_root}. "
                "Run the approved TinyStyler dependency/model setup before real transfer."
            )
        stat = path.stat()
        if stat.st_size != asset["expectedSizeBytes"]:
            raise UserFacingError(
                "TinyStyler transfer model asset size mismatch before load. "
                f"{path} expected {asset['expectedSizeBytes']} bytes, found {stat.st_size} bytes."
            )
        actual_sha = sha256_file(path)
        if actual_sha != asset["sha256"]:
            raise UserFacingError(
                "TinyStyler transfer model asset SHA-256 mismatch before load. "
                f"{path} expected {asset['sha256']}, found {actual_sha}."
            )


def mean_pooling(torch: Any, model_output: Any, attention_mask: Any) -> Any:
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)


def resolve_torch_device(torch: Any, requested_device: str) -> str:
    if requested_device == "auto":
        if torch.cuda.is_available():
            return "cuda"
        mps = getattr(getattr(torch, "backends", None), "mps", None)
        if mps and mps.is_available():
            return "mps"
        return "cpu"
    if requested_device == "cuda" and not torch.cuda.is_available():
        raise UserFacingError("Requested CUDA device is not available. Use --device auto or --device cpu.")
    if requested_device == "mps":
        mps = getattr(getattr(torch, "backends", None), "mps", None)
        if not (mps and mps.is_available()):
            raise UserFacingError("Requested MPS device is not available. Use --device auto or --device cpu.")
    return requested_device


def finite_float_vector(values: list[Any], label: str) -> list[float]:
    if len(values) != EMBEDDING_DIMENSION:
        raise UserFacingError(f"{label} must contain {EMBEDDING_DIMENSION} values.")
    result = []
    for value in values:
        if not is_finite_number(value):
            raise UserFacingError(f"{label} must contain only finite numeric values.")
        result.append(round(float(value), 8))
    return result


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


def is_fake_runtime(args: argparse.Namespace) -> bool:
    return bool(args.fake or os.environ.get("AMBIENT_TINYSTYLER_FAKE_RUNTIME") == "1")


def is_transfer_fixture_runtime() -> bool:
    return os.environ.get(TRANSFER_FIXTURE_ENV) == "1"


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
    source_summary = profile.get("sourceSummary")
    if not isinstance(source_summary, dict):
        raise UserFacingError("Profile must declare sourceSummary.")
    if not isinstance(source_summary.get("exampleCount"), int) or isinstance(source_summary["exampleCount"], bool) or source_summary["exampleCount"] < 1:
        raise UserFacingError("Profile sourceSummary.exampleCount must be a positive integer.")
    if not isinstance(source_summary.get("charCount"), int) or isinstance(source_summary["charCount"], bool) or source_summary["charCount"] < 1:
        raise UserFacingError("Profile sourceSummary.charCount must be a positive integer.")
    raw_text_persisted = source_summary.get("rawTextPersisted")
    if not isinstance(raw_text_persisted, bool):
        raise UserFacingError("Profile sourceSummary.rawTextPersisted must be a boolean.")
    if source_summary.get("exactSourceVerifiersPersisted") is not False:
        raise UserFacingError("Profile sourceSummary.exactSourceVerifiersPersisted must be false.")
    source_examples = source_summary.get("sourceExamples")
    if raw_text_persisted:
        if not isinstance(source_examples, list) or not all(isinstance(example, str) and example for example in source_examples):
            raise UserFacingError("Profile sourceSummary.sourceExamples must contain text when rawTextPersisted is true.")
    elif "sourceExamples" in source_summary:
        raise UserFacingError("Profile sourceSummary.sourceExamples is not allowed when rawTextPersisted is false.")

    created_with = profile.get("createdWith")
    if not isinstance(created_with, dict):
        raise UserFacingError("Profile must declare createdWith.")
    for field in ["packageVersion", "tinystylerRevision", "styleEmbeddingRevision", "runtimeMode"]:
        if not isinstance(created_with.get(field), str) or not created_with[field].strip():
            raise UserFacingError(f"Profile createdWith.{field} must be a non-empty string.")

    embedding = profile.get("embedding")
    if not isinstance(embedding, dict) or embedding.get("dimension") != EMBEDDING_DIMENSION:
        raise UserFacingError(f"Profile embedding.dimension must be {EMBEDDING_DIMENSION}.")
    values = embedding.get("values")
    if not isinstance(values, list) or len(values) != EMBEDDING_DIMENSION:
        raise UserFacingError(f"Profile embedding.values must contain {EMBEDDING_DIMENSION} numbers.")
    if any(not is_finite_number(value) for value in values):
        raise UserFacingError(f"Profile embedding.values must contain {EMBEDDING_DIMENSION} finite numbers.")

    generation_defaults = profile.get("generationDefaults")
    if not isinstance(generation_defaults, dict):
        raise UserFacingError("Profile must declare generationDefaults.")
    if not isinstance(generation_defaults.get("model"), str) or not generation_defaults["model"].strip():
        raise UserFacingError("Profile generationDefaults.model must be a non-empty string.")
    temperature = generation_defaults.get("temperature")
    top_p = generation_defaults.get("topP")
    max_new_tokens = generation_defaults.get("maxNewTokens")
    if not is_finite_number(temperature) or temperature < 0:
        raise UserFacingError("Profile generationDefaults.temperature must be a finite number greater than or equal to 0.")
    if not is_finite_number(top_p) or top_p < 0 or top_p > 1:
        raise UserFacingError("Profile generationDefaults.topP must be a finite number between 0 and 1.")
    if not isinstance(max_new_tokens, int) or isinstance(max_new_tokens, bool) or max_new_tokens < 1:
        raise UserFacingError("Profile generationDefaults.maxNewTokens must be a positive integer.")

    safety = profile.get("safety")
    if not isinstance(safety, dict):
        raise UserFacingError("Profile must declare safety.")
    if not isinstance(safety.get("impersonationWarningShown"), bool):
        raise UserFacingError("Profile safety.impersonationWarningShown must be a boolean.")
    if not isinstance(safety.get("intendedUse"), str) or not safety["intendedUse"].strip():
        raise UserFacingError("Profile safety.intendedUse must be a non-empty string.")


def fake_embedding(profile_name: str, examples: list[str], seed: int) -> list[float]:
    return deterministic_embedding("fake-embedding-v1", profile_name, examples, seed)


def fixture_embedding(profile_name: str, examples: list[str], seed: int) -> list[float]:
    return deterministic_embedding("fixture-style-embedding-v1", profile_name, examples, seed)


def deterministic_embedding(label: str, profile_name: str, examples: list[str], seed: int) -> list[float]:
    total_chars = sum(len(example) for example in examples)
    char_bucket = ((total_chars + 99) // 100) * 100
    material = f"{label}\n{profile_name}\n{seed}\nexamples:{len(examples)}\nchars:{char_bucket}"
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


def fixture_transfer_text(profile_name: str, source_text: str, seed: int) -> str:
    digest = hashlib.sha256(f"fixture-transfer-v1\n{profile_name}\n{seed}\n{len(source_text)}".encode("utf-8")).hexdigest()[:12]
    return f"[{profile_name} TinyStyler fixture transfer {digest}]\n{source_text.strip()}"


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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_path_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def elapsed_ms(started: float) -> int:
    return int(round((time.perf_counter() - started) * 1000))


if __name__ == "__main__":
    main()
