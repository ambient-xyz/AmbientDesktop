---
name: ambient-minicpm-v-vision
description: Local MiniCPM-V visual-understanding provider for Ambient screenshot, UI, game-frame, and image evidence.
---

# Ambient MiniCPM-V Vision Provider

Use this package when Pi needs local visual evidence for a bounded image, screenshot, UI design, game frame, or sampled video frame. Do not use it as the primary reasoning model, and do not ask it to mutate files. The provider returns evidence that Pi/GLM can reason over.

Commands:

```bash
minicpm_vision_status
minicpm_vision_verify_runtime_manifest [--archive <local-runtime-archive>] [--binary <extracted-llama-server>] [--artifact-id <artifact-id>]
minicpm_vision_start [--wait-ms 120000]
minicpm_vision_analyze --image <local-image> [--image <reference-image>] --output-json <artifact.json> [--prompt <task>]
minicpm_vision_stop
```

Operational notes:

- Default model: `openbmb/MiniCPM-V-4_5-gguf:q4_k_m`.
- Experimental comparison model: `openbmb/MiniCPM-V-4.6-gguf:q4_k_m`; use only when explicitly comparing quality or latency.
- Runtime: `llama-server` with `--chat-template chatml`; the request body disables thinking where supported, and falls back from strict JSON schema if the runtime rejects that sampler shape.
- `AMBIENT_MINICPM_V_LLAMA_SERVER` can bind an existing `llama-server` binary or a Desktop-installed workspace-owned runtime. If no runtime is bound or discovered, status reports unavailable.
- `minicpm_vision_verify_runtime_manifest` validates the managed-runtime manifest and optional local archive checksum. Desktop should use the recommended default managed download for pinned macOS arm64/Linux x64 runtime artifacts, or install a user-approved local archive into `.ambient/vision/minicpm-v/runtime` after archive/binary checksum verification. Desktop removes macOS quarantine from the managed copy only after checksum verification and records signing/Gatekeeper facts; Windows default download remains disabled until separate Windows evidence lands.
- `AMBIENT_MINICPM_V_ENDPOINT` or `--endpoint` can point to an already-running local OpenAI-compatible MiniCPM endpoint on `localhost`, `127.0.0.1`, or `[::1]`. Remote endpoints are rejected until Ambient has a separate security-reviewed hosted path covering allowed hosts, user consent, media privacy, secret handling, request redaction, artifact retention, network egress controls, and UI copy.
- `minicpm_vision_analyze` accepts one local image path, or two local image paths for a current/reference comparison. Desktop should resolve attachments, browser screenshots, or Ambient media references to approved local files before calling this command. Do not pass arbitrary remote URLs.
- Full request/response/runtime details go to the requested `--output-json` artifact. The stdout result is intentionally bounded and should not contain image bytes, secrets, or full raw model output.

Safety and quality boundaries:

- Treat observations as fallible visual evidence. The model can miss small text, state, or overlap details.
- Prefer prompts that ask for exact visible labels and evidence regions.
- Do not send private local images to hosted multimodal APIs from this provider path.
- Stop the daemon after smoke tests or one-off analysis so VRAM is released.
