---
name: hyperframes
description: Create deterministic authored-motion MP4/WebM/MOV videos from HTML/CSS/JS compositions through Ambient's bundled HyperFrames adapter.
---

# HyperFrames Ambient Adapter

Use this capability when the user wants authored motion graphics, title cards, animated charts, UI demos, social overlays, or HTML/CSS/JS video scenes. Do not present HyperFrames as a text-to-video or photorealistic video model.

## Discovery And Setup

- Find this package with `ambient_cli_search` using terms like `HyperFrames`, `authored video`, `motion graphics`, `title card`, `HTML to video`, or `deterministic MP4`.
- Call `ambient_cli_describe` before first use so the current command names, readiness, setup hints, and artifact contract are visible.
- Run `hyperframes_doctor --json` before rendering unless the package description already includes fresh readiness data.
- Heavy setup is lazy and approval-gated. Do not silently install FFmpeg, FFprobe, Chrome/browser runtime, Node, npm packages, or the HyperFrames CLI.
- If dependencies are missing, run `hyperframes_setup_plan --json` and present the exact blocked state plus approval-gated next action.

## Commands

- `hyperframes_doctor --json`: reports Node, npx, FFmpeg, FFprobe, optional HyperFrames CLI, and optional browser readiness. The built-in health check is fast and non-mutating.
- `hyperframes_setup_plan --json`: returns non-executing setup actions such as `brew install ffmpeg`, HyperFrames CLI install, and browser runtime install guidance.
- `hyperframes_init --project-dir <dir> --title <text> --subtitle <text>`: writes a small deterministic composition project in the workspace.
- `hyperframes_inspect --source <path> --json`: reads the composition and returns dimensions, duration, fps, source bytes, and structural checks.
- `hyperframes_render --source <path> --output <path> --json`: runs lint/inspect/render when the host is ready, then verifies media with FFprobe and writes metadata.

## Artifact Contract

Every real render should preserve:

- Source HTML path and project directory.
- Rendered media path.
- Metadata JSON path.
- Full lint, inspect, render, FFprobe, and FFmpeg stdout/stderr logs where produced.
- First-frame preview path when FFmpeg can extract it.
- Bounded stdout preview for the chat transcript.

Keep final media in the user's workspace, preferably under `.ambient/hyperframes/renders/` unless the user chose a path.

## Safety And Boundaries

- Treat composition HTML/CSS/JS as executable workspace project code.
- Avoid remote assets unless the user approves the provenance and network use.
- Prefer local files and deterministic HTML attributes. Use HyperFrames' `hf-seek` event or data attributes rather than wall-clock timers.
- For quick title cards, the scaffolded composition is enough. For richer scenes, write/edit the source first, inspect it, then render.
- If the render fails, attach or cite the saved logs and run `hyperframes_doctor --json` again before suggesting dependency changes.
