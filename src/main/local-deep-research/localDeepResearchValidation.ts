import type {
  LocalDeepResearchManagedAssetDetection,
  LocalDeepResearchModelProfileId,
  LocalDeepResearchValidationCheck,
  LocalDeepResearchValidationMemoryTelemetrySummary,
  LocalDeepResearchValidationProviderPreferenceSmokeSummary,
  LocalDeepResearchValidationResult,
  LocalDeepResearchValidationStatus,
} from "../../shared/types";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type { LocalDeepResearchMemoryTelemetryResult } from "./localDeepResearchMemoryTelemetry";
import { runLocalDeepResearchMemoryTelemetry } from "./localDeepResearchMemoryTelemetry";
import type { LocalDeepResearchProviderPreferenceSmokeResult } from "./localDeepResearchProviderPreferenceSmoke";
import { runLocalDeepResearchProviderPreferenceSmoke } from "./localDeepResearchProviderPreferenceSmoke";
import { writeWorkspaceTextFile } from "../workspaceFiles";

export async function validateLocalDeepResearchSetup(input: {
  workspacePath: string;
  setup: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  now?: () => Date;
}): Promise<LocalDeepResearchValidationResult> {
  const now = input.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const memoryTelemetry = await runLocalDeepResearchMemoryTelemetry({
    workspacePath: input.workspacePath,
    now: () => new Date(checkedAt),
  });
  const providerPreferenceSmoke = await runLocalDeepResearchProviderPreferenceSmoke({
    workspacePath: input.workspacePath,
    now: () => new Date(checkedAt),
  });
  const checks = [
    ...localDeepResearchValidationChecks(input.setup, input.managedAssets),
    memoryTelemetry.status === "blocked"
      ? {
          id: "physical-memory-telemetry",
          title: "Physical host memory telemetry",
          status: "blocked" as const,
          detail: `Captured physical-host memory telemetry for ${memoryTelemetry.currentHost.physicalMemoryClass}, but launch policy is blocked. Artifact: ${memoryTelemetry.artifactPath}.`,
          nextAction: "Review the memory telemetry artifact and free local model memory or disable Q8 override before retrying.",
        }
      : {
          id: "physical-memory-telemetry",
          title: "Physical host memory telemetry",
          status: "passed" as const,
          detail: `Captured physical-host memory telemetry for ${memoryTelemetry.currentHost.physicalMemoryClass}; selected ${memoryTelemetry.selectedProfileId} with ${memoryTelemetry.contextTokens} context tokens. Artifact: ${memoryTelemetry.artifactPath}.`,
        },
    providerPreferenceSmoke.status === "passed"
      ? {
          id: "provider-preference-smoke",
          title: "Provider preference product smoke",
          status: "passed" as const,
          detail: `Provider preference smoke passed across default Exa/Scrapling, Brave/custom fetch override, browser fallback, strict no-fallback block, and installed-provider refresh. Artifact: ${providerPreferenceSmoke.artifactPath}.`,
        }
      : {
          id: "provider-preference-smoke",
          title: "Provider preference product smoke",
          status: "failed" as const,
          detail: `Provider preference smoke failed. Artifact: ${providerPreferenceSmoke.artifactPath}.`,
          nextAction: "Inspect Search & Web provider normalization and Local Deep Research provider snapshot planning.",
        },
  ];
  const resultWithoutArtifact = {
    schemaVersion: "ambient-local-deep-research-validation-v1" as const,
    checkedAt,
    status: localDeepResearchValidationStatus(checks),
    setupStatus: input.setup.status,
    modelProfileId: input.setup.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    contextTokens: input.setup.modelInstall.contextTokens,
    providerSnapshot: input.setup.providerSnapshot,
    checks,
    memoryTelemetry: localDeepResearchValidationMemoryTelemetrySummary(memoryTelemetry),
    providerPreferenceSmoke: localDeepResearchValidationProviderPreferenceSmokeSummary(providerPreferenceSmoke),
  };
  const artifact = await writeWorkspaceTextFile(
    input.workspacePath,
    ".ambient/local-deep-research/validation.json",
    `${JSON.stringify(resultWithoutArtifact, null, 2)}\n`,
  );
  return {
    ...resultWithoutArtifact,
    artifactPath: artifact.path,
  };
}

export function localDeepResearchValidationText(result: LocalDeepResearchValidationResult): string {
  return [
    `Local Deep Research validation ${result.status}.`,
    `Setup status: ${result.setupStatus}.`,
    `Model: ${result.modelProfileId}; context: ${result.contextTokens}.`,
    `Checks: ${result.checks.map((check) => `${check.id}:${check.status}`).join(", ")}.`,
    result.memoryTelemetry
      ? `Memory telemetry: ${result.memoryTelemetry.status} for ${result.memoryTelemetry.physicalMemoryClass}; artifact: ${result.memoryTelemetry.artifactPath}; report: ${result.memoryTelemetry.markdownPath}.`
      : "",
    result.providerPreferenceSmoke
      ? `Provider preference smoke: ${result.providerPreferenceSmoke.status}; artifact: ${result.providerPreferenceSmoke.artifactPath}; report: ${result.providerPreferenceSmoke.markdownPath}.`
      : "",
    `Artifact: ${result.artifactPath}.`,
  ].filter(Boolean).join("\n");
}

function localDeepResearchValidationChecks(
  setup: LocalDeepResearchSetupContract,
  managedAssets: LocalDeepResearchManagedAssetDetection,
): LocalDeepResearchValidationCheck[] {
  return [
    setup.status === "blocked"
      ? {
          id: "setup-contract",
          title: "Setup contract",
          status: "blocked",
          detail: setup.blockers.join(" ") || "The setup contract is blocked.",
          nextAction: "Resolve setup blockers, then run validation again.",
        }
      : setup.status === "ready"
        ? {
            id: "setup-contract",
            title: "Setup contract",
            status: "passed",
            detail: "Local Deep Research setup is ready.",
          }
        : {
            id: "setup-contract",
            title: "Setup contract",
            status: "warning",
            detail: "Local Deep Research setup still needs managed assets before research runs can start.",
            nextAction: "Install or repair Local Deep Research from Settings.",
          },
    managedAssets.model.status === "present"
      ? {
          id: "model-cache",
          title: "LiteResearcher model",
          status: "passed",
          detail: `${managedAssets.model.filename} is present in Ambient-managed state.`,
        }
      : {
          id: "model-cache",
          title: "LiteResearcher model",
          status: managedAssets.model.status === "mismatch" ? "failed" : "warning",
          detail: managedAssets.model.reason ?? `${managedAssets.model.filename} is not installed in Ambient-managed state.`,
          nextAction: "Install or repair the selected LiteResearcher GGUF profile.",
        },
    managedAssets.runtime.status === "present"
      ? {
          id: "llama-runtime",
          title: "llama.cpp runtime",
          status: "passed",
          detail: `Shared llama.cpp runtime is present${managedAssets.runtime.artifactId ? ` (${managedAssets.runtime.artifactId})` : ""}.`,
        }
      : {
          id: "llama-runtime",
          title: "llama.cpp runtime",
          status: managedAssets.runtime.status === "unsupported" || managedAssets.runtime.status === "mismatch" ? "blocked" : "warning",
          detail: managedAssets.runtime.reason ?? "Shared llama.cpp runtime is not installed in Ambient-managed state.",
          nextAction: "Install or repair the shared Ambient-managed llama.cpp runtime.",
        },
    setup.providerSnapshot.searchOrder.length
      ? {
          id: "search-providers",
          title: "Search providers",
          status: setup.providerSnapshot.skippedSearchProviders.length ? "warning" : "passed",
          detail: `Search route: ${setup.providerSnapshot.searchOrder.join(" -> ")}.`,
          ...(setup.providerSnapshot.skippedSearchProviders.length
            ? { nextAction: "Review skipped search providers if this route is not expected." }
            : {}),
        }
      : {
          id: "search-providers",
          title: "Search providers",
          status: "blocked",
          detail: "No enabled search provider is available for Local Deep Research.",
          nextAction: "Enable or configure at least one Search & Web search provider.",
        },
    setup.providerSnapshot.fetchOrder.length
      ? {
          id: "fetch-providers",
          title: "Fetch providers",
          status: setup.providerSnapshot.skippedFetchProviders.length ? "warning" : "passed",
          detail: `Fetch route: ${setup.providerSnapshot.fetchOrder.join(" -> ")}.`,
          ...(setup.providerSnapshot.skippedFetchProviders.length
            ? { nextAction: "Review skipped fetch providers if this route is not expected." }
            : {}),
        }
      : {
          id: "fetch-providers",
          title: "Fetch providers",
          status: "blocked",
          detail: "No enabled fetch or scrape provider is available for Local Deep Research.",
          nextAction: "Enable or configure at least one Search & Web fetch provider.",
        },
    setup.modelSelection.q8OverrideDecision === "rejected"
      ? {
          id: "q8-override",
          title: "Q8 override",
          status: "blocked",
          detail: setup.modelSelection.blockers.join(" ") || "Q8 override was rejected by memory policy.",
          nextAction: "Disable Q8 override or free local model memory before retrying.",
        }
      : setup.modelSelection.q8OverrideDecision === "warned"
        ? {
            id: "q8-override",
            title: "Q8 override",
            status: "warning",
            detail: "Q8 override is allowed with warning; launch preflight may still fall back to Q4.",
          }
        : {
            id: "q8-override",
            title: "Q8 override",
            status: "passed",
            detail: setup.modelSelection.q8OverrideDecision === "accepted"
              ? "Q8 override is accepted for this host state."
              : "Automatic Q4/Q8 selection is valid for this host state.",
          },
  ];
}

function localDeepResearchValidationStatus(checks: LocalDeepResearchValidationCheck[]): LocalDeepResearchValidationStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (checks.some((check) => check.status === "warning" && (check.id === "model-cache" || check.id === "llama-runtime" || check.id === "setup-contract"))) {
    return "needs-install";
  }
  return "passed";
}

function localDeepResearchValidationMemoryTelemetrySummary(
  result: LocalDeepResearchMemoryTelemetryResult,
): LocalDeepResearchValidationMemoryTelemetrySummary {
  return {
    status: result.status,
    capturedAt: result.capturedAt,
    physicalMemoryClass: result.currentHost.physicalMemoryClass,
    memoryTier: result.currentHost.memoryTier,
    memoryPressure: result.currentHost.memoryPressure,
    selectedProfileId: result.selectedProfileId,
    ...(result.fallbackProfileId ? { fallbackProfileId: result.fallbackProfileId } : {}),
    contextTokens: result.contextTokens,
    q8OverrideDecision: result.q8OverrideDecision,
    reservationStatus: result.reservation.status,
    reservationReason: result.reservation.reason,
    activeLocalModelCount: result.currentHost.activeLocalModelCount,
    activeLocalModelEstimatedResidentMemoryBytes: result.currentHost.activeLocalModelEstimatedResidentMemoryBytes,
    ...(result.currentHost.activeLocalModelActualResidentMemoryBytes !== undefined ? { activeLocalModelActualResidentMemoryBytes: result.currentHost.activeLocalModelActualResidentMemoryBytes } : {}),
    coverageMissingPhysicalMemoryClasses: result.coverage.missingPhysicalMemoryClasses,
    artifactPath: result.artifactPath,
    markdownPath: result.markdownPath,
  };
}

function localDeepResearchValidationProviderPreferenceSmokeSummary(
  result: LocalDeepResearchProviderPreferenceSmokeResult,
): LocalDeepResearchValidationProviderPreferenceSmokeSummary {
  return {
    status: result.status,
    checkedAt: result.checkedAt,
    checkCount: result.checks.length,
    artifactPath: result.artifactPath,
    markdownPath: result.markdownPath,
  };
}
