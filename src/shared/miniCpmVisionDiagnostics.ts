import type { MiniCpmVisionDiagnosticCode, MiniCpmVisionDiagnosticItem, MiniCpmVisionDiagnosticSeverity, MiniCpmVisionRuntimeCandidate, MiniCpmVisionSetupStatus, MiniCpmVisionValidationStatus } from "./localRuntimeTypes";
import {
  miniCpmRemoteEndpointBlockedMessage,
  miniCpmRemoteEndpointReviewChecklistText,
} from "./miniCpmRemoteEndpointSecurity";

export interface MiniCpmVisionDiagnosticsInput {
  setupStatus?: MiniCpmVisionSetupStatus;
  validationStatus?: MiniCpmVisionValidationStatus;
  error?: string;
  missingHints?: readonly string[];
  runtimeCandidates?: readonly MiniCpmVisionRuntimeCandidate[];
}

export function miniCpmVisionDiagnosticsForFailure(input: MiniCpmVisionDiagnosticsInput): MiniCpmVisionDiagnosticItem[] {
  const error = input.error?.trim() ?? "";
  const hints = input.missingHints ?? [];
  const successStatus =
    input.setupStatus === "ready" ||
    input.setupStatus === "stopped" ||
    input.validationStatus === "passed" ||
    input.validationStatus === "runtime-ready" ||
    input.validationStatus === "stopped";
  if (successStatus && !error && hints.length === 0) return [];
  const haystack = [
    error,
    ...hints,
    ...(input.runtimeCandidates ?? []).map((candidate) => candidate.reason ?? ""),
    input.setupStatus,
    input.validationStatus,
  ].filter(Boolean).join("\n").toLowerCase();

  const diagnostics: MiniCpmVisionDiagnosticItem[] = [];
  const add = (
    code: MiniCpmVisionDiagnosticCode,
    title: string,
    detail: string,
    nextAction: string,
    severity: MiniCpmVisionDiagnosticSeverity = "error",
  ) => {
    if (diagnostics.some((diagnostic) => diagnostic.code === code)) return;
    diagnostics.push({ code, severity, title, detail, nextAction });
  };

  const missingRuntime = input.setupStatus === "needs-runtime" || input.validationStatus === "needs-runtime" || /llama-server|runtime binary|not found on path|was not found at|enoent/.test(haystack);
  if (missingRuntime) {
    add(
      "missing-runtime-binary",
      "MiniCPM-V runtime missing",
      error || "Ambient could not find a usable llama.cpp llama-server binary for MiniCPM-V.",
      "Install llama.cpp or enter the full llama-server path, then run MiniCPM-V Validate or Repair again.",
      "warning",
    );
    if (input.setupStatus === "needs-runtime" || input.validationStatus === "needs-runtime") return diagnostics;
  }
  if (/remote endpoint|remote endpoints|security review|local-only|must be local-only/.test(haystack)) {
    add(
      "remote-endpoint-blocked",
      "Remote MiniCPM-V endpoint blocked",
      error || miniCpmRemoteEndpointBlockedMessage(),
      `Complete the MiniCPM-V remote-endpoint security review before enabling hosted visual analysis: ${miniCpmRemoteEndpointReviewChecklistText()}.`,
      "warning",
    );
  }
  if (/ffmpeg|video frame extraction/.test(haystack)) {
    add(
      "missing-ffmpeg",
      "ffmpeg is required for video frames",
      error || "Ambient could not sample a video frame before sending it to MiniCPM-V.",
      "Install ffmpeg on PATH, or analyze a still image/screenshot instead of a video clip.",
      "warning",
    );
  }
  if (/econnrefused|connection refused|endpoint refused|health check is not ready|did not become healthy|local endpoint/.test(haystack)) {
    add(
      "endpoint-refused",
      "MiniCPM-V endpoint is not reachable",
      error || "The local MiniCPM-V server did not answer the health check or analyze request.",
      "Stop stale MiniCPM-V processes, check for port conflicts, then run provider Repair to restart validation.",
    );
  }
  if (/timeout|timed out|stall|did not start|did not.*within|without stream activity/.test(haystack)) {
    add(
      "timeout-or-stall",
      "MiniCPM-V timed out or stalled",
      error || "The local runtime did not start or return analysis within the configured timeout.",
      "Retry with a smaller image, ensure the model is warm, or increase the validation timeout before re-running Validate.",
    );
  }
  if (/invalid visual json|invalid.*json|schema|completed without json stdout|parse/.test(haystack)) {
    add(
      "invalid-model-output-schema",
      "MiniCPM-V returned invalid structured output",
      error || "The provider response did not match Ambient's visual observation schema.",
      "Keep the raw artifact for debugging, then run Repair or tighten the provider prompt/schema contract.",
    );
  }
  if (/image preprocessor|projector|mmproj|unsupported.*image|unsupported.*video|video frame extraction/.test(haystack)) {
    add(
      "image-preprocessor-failure",
      "Visual input preprocessing failed",
      error || "MiniCPM-V could not prepare the provided image or sampled video frame.",
      "Try a PNG/JPG/WebP under the size limit, or sample the video frame again after installing ffmpeg.",
    );
  }
  if (/unsupported model|model format|gguf|tokenizer|chat template|sampler/.test(haystack)) {
    add(
      "unsupported-model-format",
      "Runtime/model format mismatch",
      error || "The selected llama.cpp runtime may not support the configured MiniCPM-V GGUF/model template.",
      "Use the pinned MiniCPM-V 4.5 Q4_K_M target with a recent llama.cpp llama-server, then re-run Validate.",
    );
  }
  if (/download|hugging face|huggingface|hf |network|offline|resolve model|model file/.test(haystack)) {
    add(
      "model-download-failed",
      "Model download or cache failed",
      error || "The runtime could not fetch or read MiniCPM-V model assets.",
      "Check network access and disk cache permissions, or pre-warm the Hugging Face/llama.cpp model cache before validation.",
    );
  }
  if (/enospc|no space|insufficient disk|disk full/.test(haystack)) {
    add(
      "insufficient-disk",
      "Insufficient disk space",
      error || "MiniCPM-V setup or model caching ran out of disk space.",
      "Free disk space in the model/cache location, then run MiniCPM-V Repair.",
    );
  }
  if (/out of memory|insufficient.*memory|vram|cuda.*memory|vulkan.*memory|failed to allocate/.test(haystack)) {
    add(
      "insufficient-memory",
      "Insufficient RAM or VRAM",
      error || "The runtime could not allocate enough memory for MiniCPM-V.",
      "Close other GPU workloads, use the 4.5 Q4_K_M baseline, or move validation to the Linux GPU box.",
    );
  }
  if (/cuda|metal|vulkan|gpu|accelerator|no device/.test(haystack)) {
    add(
      "accelerator-unavailable",
      "Hardware acceleration unavailable",
      error || "The selected runtime did not expose the expected CUDA, Metal, or Vulkan path.",
      "Use a CPU fallback only for small tests, or install an accelerated llama.cpp build for this platform.",
      "warning",
    );
  }
  if (/allowexternal|outside the workspace|remote url|must stay inside|permission|approved local|browser_screenshot artifact|latest browser screenshot|screenshot artifact/.test(haystack)) {
    add(
      "input-permission-or-path",
      "Input path needs approval or relocation",
      error || "The visual input is outside Ambient's approved workspace/media boundary.",
      "Attach the file through Ambient, move it into the workspace, or explicitly approve external media access.",
      "warning",
    );
  }
  if (/package install failed|install failed|ambient-minicpm-v-vision/.test(haystack) && input.setupStatus === "failed") {
    add(
      "package-install-failed",
      "MiniCPM-V package install failed",
      error || "Ambient could not install or refresh the first-party MiniCPM-V package.",
      "Run provider Repair from Settings and inspect the package install artifacts if it fails again.",
    );
  }

  if (!diagnostics.length && (error || input.setupStatus === "failed" || input.validationStatus === "failed")) {
    add(
      "unknown-failure",
      "MiniCPM-V setup failed",
      error || "Ambient could not classify this MiniCPM-V failure.",
      "Save diagnostics, then run MiniCPM-V Repair or retry validation with the exact runtime path.",
    );
  }

  return diagnostics;
}
