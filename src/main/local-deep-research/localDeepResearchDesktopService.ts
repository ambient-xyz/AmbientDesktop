import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  EmbeddingProviderCandidate,
  LocalDeepResearchRunHistoryInput,
  LocalDeepResearchRunHistoryResult,
  LocalDeepResearchSettings,
  LocalDeepResearchSetupInput as LocalDeepResearchSetupIpcInput,
  LocalDeepResearchSetupResult,
  LocalModelResourcePolicyDecision,
  VoiceProviderCandidate,
} from "../../shared/localRuntimeTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import {
  detectLocalDeepResearchManagedAssets,
  type DetectLocalDeepResearchManagedAssetsInput,
  type LocalDeepResearchManagedAssetDetection,
} from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  installLocalDeepResearchManagedAssets,
  localDeepResearchInstallJobWarnings,
  reconcileLocalDeepResearchInstallJob,
  type LocalDeepResearchInstallRequest,
  type LocalDeepResearchInstallServiceResult,
  type LocalDeepResearchInstallJobRecord,
} from "./localDeepResearchInstallService";
import { listLocalDeepResearchRunHistory } from "./localDeepResearchRunService";
import {
  runLocalDeepResearchRealAssetSmoke,
  type LocalDeepResearchSmokeRequest,
} from "./localDeepResearchSmoke";
import { detectLocalLlamaResidentProcesses, type LocalLlamaResidentProcess } from "./localDeepResearchLocalLlamaFacade";
import {
  buildLocalModelRuntimeStatusSnapshot,
  localDeepResearchRequestedLaunch,
  sampleLocalModelHostMemorySnapshot,
  type LocalModelRuntimeStatusSnapshot,
} from "./localDeepResearchLocalRuntimeFacade";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput as LocalDeepResearchSetupContractInput,
} from "./localDeepResearchSetup";
import { validateLocalDeepResearchSetup } from "./localDeepResearchValidation";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./localDeepResearchWebResearchFacade";

type DynamicProviderCatalogs = NonNullable<Parameters<typeof webResearchSettingsWithDynamicProviderCatalogs>[1]>;
type AmbientCliProviderCatalog = NonNullable<DynamicProviderCatalogs["ambientCliCatalog"]>;
type WebResearchMcpToolDescriptor = NonNullable<DynamicProviderCatalogs["mcpTools"]>[number];

export interface LocalDeepResearchSetupReadiness {
  contract: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
}

export interface LocalDeepResearchMessageBoxOptions {
  type: "warning";
  buttons: string[];
  defaultId: number;
  cancelId: number;
  title: string;
  message: string;
  detail: string;
}

export interface LocalDeepResearchMessageBoxResult {
  response: number;
}

export interface LocalDeepResearchDesktopServiceImplementations {
  buildLocalDeepResearchSetupContract(input: LocalDeepResearchSetupContractInput): LocalDeepResearchSetupContract;
  buildLocalModelRuntimeStatusSnapshot(input: Parameters<typeof buildLocalModelRuntimeStatusSnapshot>[0]): Promise<LocalModelRuntimeStatusSnapshot>;
  detectLocalDeepResearchManagedAssets(
    workspacePath: string,
    input?: DetectLocalDeepResearchManagedAssetsInput,
  ): Promise<LocalDeepResearchManagedAssetDetection>;
  detectLocalLlamaResidentProcesses(workspacePath: string): Promise<LocalLlamaResidentProcess[]>;
  installLocalDeepResearchManagedAssets(input: LocalDeepResearchInstallRequest): Promise<LocalDeepResearchInstallServiceResult>;
  listLocalDeepResearchRunHistory(
    workspacePath: string,
    input: LocalDeepResearchRunHistoryInput | undefined,
  ): Promise<LocalDeepResearchRunHistoryResult>;
  localDeepResearchInstallJobWarnings(record: LocalDeepResearchInstallJobRecord | undefined): string[];
  localDeepResearchRequestedLaunch(input: Parameters<typeof localDeepResearchRequestedLaunch>[0]): ReturnType<typeof localDeepResearchRequestedLaunch>;
  reconcileLocalDeepResearchInstallJob(workspacePath: string): Promise<LocalDeepResearchInstallJobRecord | undefined>;
  runLocalDeepResearchRealAssetSmoke(input: LocalDeepResearchSmokeRequest): ReturnType<typeof runLocalDeepResearchRealAssetSmoke>;
  sampleLocalModelHostMemorySnapshot(): ReturnType<typeof sampleLocalModelHostMemorySnapshot>;
  validateLocalDeepResearchSetup(input: Parameters<typeof validateLocalDeepResearchSetup>[0]): ReturnType<typeof validateLocalDeepResearchSetup>;
  webResearchSettingsWithDynamicProviderCatalogs(
    settings: SearchRoutingSettings | undefined,
    input: DynamicProviderCatalogs,
  ): SearchRoutingSettings;
}

export interface LocalDeepResearchDesktopServiceDependencies {
  activeWorkspacePath(): string;
  discoverAmbientCliCatalog(workspacePath: string): Promise<AmbientCliProviderCatalog>;
  discoverWebResearchMcpProviderTools(workspacePath: string): Promise<WebResearchMcpToolDescriptor[]>;
  emitDesktopEvent(event: DesktopEvent): void;
  getLocalDeepResearchSettings(): LocalDeepResearchSettings;
  getSearchRoutingSettings(): SearchRoutingSettings;
  listEmbeddingProvidersForSettings(): Promise<EmbeddingProviderCandidate[]>;
  listVoiceProvidersWithCachedVoices(): Promise<VoiceProviderCandidate[]>;
  showMessageBox(options: LocalDeepResearchMessageBoxOptions): Promise<LocalDeepResearchMessageBoxResult>;
  implementations?: Partial<LocalDeepResearchDesktopServiceImplementations>;
}

export interface LocalDeepResearchDesktopService {
  confirmLocalModelResourceLimitExceed(decision: LocalModelResourcePolicyDecision): Promise<boolean>;
  listLocalDeepResearchRunsForSettings(
    input: LocalDeepResearchRunHistoryInput | undefined,
    workspacePath?: string,
  ): Promise<LocalDeepResearchRunHistoryResult>;
  readLocalDeepResearchReadinessForSettings(
    workspacePath: string,
    input: LocalDeepResearchSetupContractInput,
  ): Promise<LocalDeepResearchSetupReadiness>;
  setupLocalDeepResearch(
    input: LocalDeepResearchSetupIpcInput,
    workspacePath?: string,
  ): Promise<LocalDeepResearchSetupResult>;
}

const defaultImplementations: LocalDeepResearchDesktopServiceImplementations = {
  buildLocalDeepResearchSetupContract,
  buildLocalModelRuntimeStatusSnapshot,
  detectLocalDeepResearchManagedAssets,
  detectLocalLlamaResidentProcesses,
  installLocalDeepResearchManagedAssets,
  listLocalDeepResearchRunHistory,
  localDeepResearchInstallJobWarnings,
  localDeepResearchRequestedLaunch,
  reconcileLocalDeepResearchInstallJob: (workspacePath) => reconcileLocalDeepResearchInstallJob(workspacePath),
  runLocalDeepResearchRealAssetSmoke,
  sampleLocalModelHostMemorySnapshot,
  validateLocalDeepResearchSetup,
  webResearchSettingsWithDynamicProviderCatalogs,
};

export function createLocalDeepResearchDesktopService({
  activeWorkspacePath,
  discoverAmbientCliCatalog,
  discoverWebResearchMcpProviderTools,
  emitDesktopEvent,
  getLocalDeepResearchSettings,
  getSearchRoutingSettings,
  listEmbeddingProvidersForSettings,
  listVoiceProvidersWithCachedVoices,
  showMessageBox,
  implementations,
}: LocalDeepResearchDesktopServiceDependencies): LocalDeepResearchDesktopService {
  const services = { ...defaultImplementations, ...implementations };

  async function setupLocalDeepResearch(
    input: LocalDeepResearchSetupIpcInput,
    workspacePath = activeWorkspacePath(),
  ): Promise<LocalDeepResearchSetupResult> {
    const action = input.action ?? "status";
    const setupInput: LocalDeepResearchSetupContractInput = {
      q8Override: input.q8Override,
    };
    const initial = await readLocalDeepResearchReadinessForSettings(workspacePath, setupInput);
    let installResult: LocalDeepResearchInstallServiceResult | undefined;
    if (action === "install" || action === "repair") {
      installResult = await services.installLocalDeepResearchManagedAssets({
        workspacePath,
        setup: initial.contract,
        action,
        installModel: input.installModel !== false,
        installRuntime: input.installRuntime !== false,
        ...(input.runtimeArtifactId ? { runtimeArtifactId: input.runtimeArtifactId } : {}),
        onProgress: (progress) => emitDesktopEvent({
          type: "local-deep-research-install-progress",
          progress,
          workspacePath,
        }),
      });
    }
    const { contract, managedAssets } = installResult
      ? await readLocalDeepResearchReadinessForSettings(workspacePath, setupInput)
      : initial;
    const validation = action === "validate"
      ? await services.validateLocalDeepResearchSetup({ workspacePath, setup: contract, managedAssets })
      : undefined;
    const smoke = action === "smoke"
      ? await services.runLocalDeepResearchRealAssetSmoke({
          workspacePath,
          setup: contract,
          managedAssets,
          approveResourceLimitExceed: confirmLocalModelResourceLimitExceed,
        })
      : undefined;
    const result = localDeepResearchSetupResultFromContract(action, contract, managedAssets, installResult, validation, smoke);
    emitDesktopEvent({
      type: "local-deep-research-setup-updated",
      result,
      workspacePath,
    });
    return result;
  }

  async function readLocalDeepResearchReadinessForSettings(
    workspacePath: string,
    input: LocalDeepResearchSetupContractInput,
  ): Promise<LocalDeepResearchSetupReadiness> {
    const catalog = await discoverAmbientCliCatalog(workspacePath).catch(() => ({ packages: [], errors: [] }) as AmbientCliProviderCatalog);
    const mcpTools = await discoverWebResearchMcpProviderTools(workspacePath);
    const searchSettings = services.webResearchSettingsWithDynamicProviderCatalogs(getSearchRoutingSettings(), { ambientCliCatalog: catalog, mcpTools });
    const residentProcesses = await services.detectLocalLlamaResidentProcesses(workspacePath).catch(() => []);
    const machineFacts = {
      ...input.machineFacts,
      activeLocalModelCount: residentProcesses.length,
      activeLocalModelEstimatedResidentMemoryBytes: residentProcesses.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0),
    };
    const localDeepResearchSettings = getLocalDeepResearchSettings();
    const preliminaryContract = services.buildLocalDeepResearchSetupContract({
      ...input,
      localDeepResearchSettings,
      machineFacts,
      searchSettings,
    });
    const managedAssets = await services.detectLocalDeepResearchManagedAssets(workspacePath, {
      selectedProfileId: preliminaryContract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    });
    const installJob = await services.reconcileLocalDeepResearchInstallJob(workspacePath).catch(() => undefined);
    const localRuntimeStatus = await services.buildLocalModelRuntimeStatusSnapshot({
      workspacePath,
      settings: localDeepResearchSettings.localModelResources,
      residentProcesses,
      hostMemory: services.sampleLocalModelHostMemorySnapshot(),
      voiceProviders: await listVoiceProvidersWithCachedVoices().catch(() => []),
      embeddingProviders: await listEmbeddingProvidersForSettings().catch(() => []),
      requestedLaunch: services.localDeepResearchRequestedLaunch({
        modelId: preliminaryContract.modelInstall.filename,
        profileId: preliminaryContract.modelInstall.selectedProfileId,
        contextTokens: preliminaryContract.modelInstall.contextTokens,
        estimatedResidentMemoryBytes: preliminaryContract.installerShape.memory.estimatedResidentMemoryBytes,
      }),
    });
    const setupInput: LocalDeepResearchSetupContractInput = {
      ...input,
      localDeepResearchSettings,
      machineFacts,
      searchSettings,
      localModelResources: localRuntimeStatus.registry,
      localRuntimeInventory: localRuntimeStatus.inventory,
      modelInstallState: managedAssets.model.status === "present" ? "installed" : "missing",
      runtimeInstalled: managedAssets.runtime.status === "present",
      ...(managedAssets.runtime.artifactId ? { runtimeArtifactId: managedAssets.runtime.artifactId } : {}),
      ...(managedAssets.runtime.status === "present" && managedAssets.runtime.binaryPath ? { runtimeBinaryPath: managedAssets.runtime.binaryPath } : {}),
      assetWarnings: [
        ...managedAssets.warnings,
        ...services.localDeepResearchInstallJobWarnings(installJob),
      ],
    };
    return {
      contract: services.buildLocalDeepResearchSetupContract(setupInput),
      managedAssets,
    };
  }

  async function confirmLocalModelResourceLimitExceed(decision: LocalModelResourcePolicyDecision): Promise<boolean> {
    const response = await showMessageBox(localModelResourceLimitMessageBoxOptions(decision));
    return response.response === 0;
  }

  async function listLocalDeepResearchRunsForSettings(
    input: LocalDeepResearchRunHistoryInput | undefined,
    workspacePath = activeWorkspacePath(),
  ): Promise<LocalDeepResearchRunHistoryResult> {
    return services.listLocalDeepResearchRunHistory(workspacePath, input);
  }

  return {
    confirmLocalModelResourceLimitExceed,
    listLocalDeepResearchRunsForSettings,
    readLocalDeepResearchReadinessForSettings,
    setupLocalDeepResearch,
  };
}

export function localModelResourceLimitMessageBoxOptions(decision: LocalModelResourcePolicyDecision): LocalDeepResearchMessageBoxOptions {
  return {
    type: "warning",
    buttons: ["Continue", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Exceed Local Model Memory Ceiling?",
    message: "Starting this local model would exceed your configured memory ceiling.",
    detail: [
      decision.exceededByBytes !== undefined
        ? `Projected resident memory exceeds the configured ceiling by ${formatLocalModelResourceBytes(decision.exceededByBytes)}.`
        : "Projected resident memory exceeds the configured ceiling.",
      `Ceiling: ${decision.maxResidentMemoryBytes !== undefined ? formatLocalModelResourceBytes(decision.maxResidentMemoryBytes) : "not configured"}.`,
      `Active estimate: ${formatLocalModelResourceBytes(decision.activeEstimatedResidentMemoryBytes)}.`,
      `Requested estimate: ${decision.requestedEstimatedResidentMemoryBytes !== undefined ? formatLocalModelResourceBytes(decision.requestedEstimatedResidentMemoryBytes) : "unknown"}.`,
      `Projected estimate: ${formatLocalModelResourceBytes(decision.projectedEstimatedResidentMemoryBytes)}.`,
      decision.activeActualResidentMemoryBytes !== undefined
        ? `Actual sampled resident memory: ${formatLocalModelResourceBytes(decision.activeActualResidentMemoryBytes)}.`
        : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n"),
  };
}

export function formatLocalModelResourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MiB`;
}

function localDeepResearchSetupResultFromContract(
  action: LocalDeepResearchSetupIpcInput["action"],
  contract: LocalDeepResearchSetupContract,
  managedAssets: LocalDeepResearchManagedAssetDetection,
  installResult?: LocalDeepResearchInstallServiceResult,
  validation?: Awaited<ReturnType<typeof validateLocalDeepResearchSetup>>,
  smoke?: Awaited<ReturnType<typeof runLocalDeepResearchRealAssetSmoke>>,
): LocalDeepResearchSetupResult {
  return {
    schemaVersion: "ambient-local-deep-research-setup-result-v1",
    action: action ?? "status",
    capabilityId: contract.capabilityId,
    setupStatus: contract.status,
    modelSelection: contract.modelSelection,
    modelInstall: {
      ...contract.modelInstall,
      selectedProfileId: contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    },
    llamaRuntime: contract.runtime,
    installerShape: contract.installerShape,
    localModelResources: contract.localModelResources,
    localRuntimeInventory: contract.localRuntimeInventory,
    providerSnapshot: contract.providerSnapshot,
    managedAssets,
    ...(installResult ? { installResult } : {}),
    ...(validation ? { validation } : {}),
    ...(smoke ? { smoke } : {}),
    warnings: contract.warnings,
    blockers: contract.blockers,
    nextActions: contract.nextActions,
  };
}
