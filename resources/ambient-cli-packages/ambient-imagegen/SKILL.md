---
name: ambient-imagegen
description: Generate raster images through hosted APIs such as OpenAI, Google Nano Banana Pro, fal/FLUX, Replicate, Stability AI, and Ideogram.
---

# Ambient Hosted Image Generation

Use this package when the user asks for a bitmap image from a hosted image API and accepts cloud execution, provider policy, cost, and secret setup. Prefer local ComfyUI only when the user wants local model control, offline/privacy-first generation, or an explicit workflow/model cache.

## Discovery And Setup

- Find this package with `ambient_cli_search` using terms like `hosted image generation`, `OpenAI image`, `Google Nano Banana`, `Nano Banana Pro`, `Flux`, `fal image`, `Replicate image`, `Stability image`, or `Ideogram`.
- Call `ambient_cli_describe` before first use so the current provider aliases, env names, and artifact contract are visible.
- Run `hosted_image_doctor --json` to see provider aliases and which secret env names are configured. It does not call provider APIs and must not reveal secret values.
- Use Ambient-managed secret flows for keys. Do not ask the user to paste API keys into chat.

## Providers

- `openai`: OpenAI GPT Image, default model `gpt-image-2`, env `OPENAI_API_KEY`.
- `google`: Google Nano Banana efficient image route, default model `gemini-3.1-flash-image`, env `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- `google-nano-banana-pro`: Google Nano Banana Pro, default model `gemini-3-pro-image`, env `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- `fal`: fal Model APIs, default model `fal-ai/flux/dev`, env `FAL_KEY`.
- `flux`: convenience alias for the fal FLUX route, default model `fal-ai/flux/dev`, env `FAL_KEY`.
- `replicate`: Replicate predictions for hosted image models, default model `black-forest-labs/flux-schnell`, env `REPLICATE_API_TOKEN`.
- `stability`: Stability AI Stable Image, default model `stable-image-ultra`, env `STABILITY_API_KEY`.
- `ideogram`: Ideogram 4.0 image generation, env `IDEOGRAM_API_KEY`.

## Commands

- `hosted_image_doctor --json`: reports supported providers, aliases, required env names, default models, and key presence.
- `hosted_image_generate --provider <provider> --prompt <text> --output <path> --json`: generates one image and writes a metadata JSON next to the image.
- `hosted_image_generate --provider <provider> --prompt-file <path> --dry-run --json`: returns the planned provider/model/host/env contract without making a network request.

Useful flags:

- `--model <id>` overrides the provider default.
- `--size <WxH>` requests dimensions when the provider supports it.
- `--aspect-ratio <ratio>` requests provider-native aspect ratio when supported.
- `--format png|jpeg|webp` requests output format when supported.
- `--negative-prompt <text>` is passed only to providers that support it.

## Artifact Contract

Every successful generation writes:

- The generated image file in the workspace.
- A sibling metadata JSON file with provider id, model id, byte size, MIME type, dimensions when detectable, SHA-256, latency, and secret env names only.
- Bounded stdout JSON for the transcript.

The command downloads temporary remote URLs into workspace files. Do not leave only provider-hosted URLs as the durable result.

## Safety And Boundaries

- Provider prompts and source images leave the machine. State this when the user has not already acknowledged cloud use.
- Never print, log, or store secret values. Report only env names and configured/not-configured state.
- Surface provider policy, quota, auth, and malformed-request errors as errors. Do not rewrite prompts to bypass policy.
- Keep generated images as raster artifacts. Use document, SVG, or authored-motion tools when the user asks for editable documents, vector artwork, or deterministic video.
