import type { ProviderStatus } from "../../shared/desktopTypes";
import { getAmbientProviderStatus } from "./agentRuntimeProviderFacade";
import { runtimeProviderDiagnosticDisplayLines } from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import {
  isAmbientProviderAuthFailure,
  type RuntimeProviderErrorDiagnostic,
} from "./provider-continuation/agentRuntimeProviderDiagnostics";

export function formatRuntimeError(
  message: string,
  diagnostic?: RuntimeProviderErrorDiagnostic,
  provider: ProviderStatus = getAmbientProviderStatus(),
): string {
  if (!provider.hasApiKey) {
    return [
      "Ambient API key is not configured.",
      "",
      "Use the API key dialog or set `AMBIENT_API_KEY` before launching the app.",
    ].join("\n");
  }
  const diagnosticLines = runtimeProviderDiagnosticDisplayLines(diagnostic);
  if (isAmbientProviderAuthFailure(diagnostic, provider)) {
    return [
      "Ambient API key was rejected by Pi/Ambient.",
      "",
      "Use the API key dialog to save a valid Ambient API key, then retry this run.",
      "",
      "Provider error:",
      message,
      diagnosticLines.length ? "" : undefined,
      diagnosticLines.length ? "Diagnostic detail:" : undefined,
      ...diagnosticLines,
    ].filter((line) => line !== undefined).join("\n");
  }
  return [
    "The Pi/Ambient runtime returned an error:",
    "",
    message,
    diagnosticLines.length ? "" : undefined,
    diagnosticLines.length ? "Diagnostic detail:" : undefined,
    ...diagnosticLines,
  ].filter((line) => line !== undefined).join("\n");
}

export function shouldOpenApiKeyDialogForRuntimeError(
  diagnostic: RuntimeProviderErrorDiagnostic | undefined,
  provider: ProviderStatus = getAmbientProviderStatus(),
): boolean {
  return isAmbientProviderAuthFailure(diagnostic, provider);
}
