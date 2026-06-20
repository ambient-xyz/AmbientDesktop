import type { AgentRuntimeFeatures } from "./agentRuntime";

type FeatureSection<Key extends keyof AgentRuntimeFeatures> = NonNullable<AgentRuntimeFeatures[Key]>;
type FeatureCallback<Callback> = NonNullable<Callback>;

type SearchUpdate = FeatureCallback<FeatureSection<"search">["updateSettings"]>;
type LocalDeepResearchUpdate = FeatureCallback<FeatureSection<"localDeepResearch">["updateSettings"]>;
type MediaUpdate = FeatureCallback<FeatureSection<"media">["updateSettings"]>;
type PlannerUpdate = FeatureCallback<FeatureSection<"planner">["updateSettings"]>;
type ProjectList = FeatureCallback<FeatureSection<"projects">["listProjects"]>;
type ProjectCreate = FeatureCallback<FeatureSection<"projects">["createProject"]>;
type ProjectSwitch = FeatureCallback<FeatureSection<"projects">["switchProject"]>;
type WorkflowRunExploration = FeatureCallback<FeatureSection<"workflowAgents">["runExploration"]>;
type WorkflowCompilePreview = FeatureCallback<FeatureSection<"workflowAgents">["compilePreview"]>;
type WorkflowReviewArtifact = FeatureCallback<FeatureSection<"workflowAgents">["reviewArtifact"]>;
type WorkflowCancelRun = FeatureCallback<FeatureSection<"workflowAgents">["cancelRun"]>;
type WorkflowRecoverRun = FeatureCallback<FeatureSection<"workflowAgents">["recoverRun"]>;
type VoiceUpdate = FeatureCallback<FeatureSection<"voice">["updateSettings"]>;
type SttUpdate = FeatureCallback<FeatureSection<"stt">["updateSettings"]>;

interface SettingsUpdateStateOptions {
  onStateUpdated: () => void;
}

interface VoiceUpdateOptions<Store> extends SettingsUpdateStateOptions {
  providerStore: Store;
  workspacePath: string;
}

export interface AgentRuntimeFeatureFactoryStore {
  getWorkspace(): { path: string };
}

export interface AgentRuntimeFeatureFactoryContext<Store, Browser> {
  store: Store;
  browserService: Browser;
  activeThreadId(): string;
}

export interface AgentRuntimeFeatureFactoryDependencies<Store extends AgentRuntimeFeatureFactoryStore, Browser> {
  browserLoginBrokerEnabled: boolean;
  defaultStore(): Store;
  emitRuntimeFeatureStateUpdated(store: Store): void;
  readFeatureFlagSnapshot(store: Store): ReturnType<FeatureSection<"featureFlags">["readSnapshot"]>;
  userDataPath(): string;
  appVersion?: string;
  env?: NodeJS.ProcessEnv;
  localModelHostMemory: FeatureCallback<AgentRuntimeFeatures["localModelHostMemory"]>;
  googleWorkspace: FeatureSection<"googleWorkspace">;
  workflowNativeTools: FeatureSection<"workflowNativeTools">;
  localTextSubagents?: FeatureSection<"localTextSubagents">;
  readSearchSettings: FeatureSection<"search">["readSettings"];
  updateSearchSettings(input: Parameters<SearchUpdate>[0], options: SettingsUpdateStateOptions): ReturnType<SearchUpdate>;
  readLocalDeepResearchSettings: FeatureCallback<FeatureSection<"localDeepResearch">["readSettings"]>;
  updateLocalDeepResearchSettings(
    input: Parameters<LocalDeepResearchUpdate>[0],
    options: SettingsUpdateStateOptions,
  ): ReturnType<LocalDeepResearchUpdate>;
  readMediaPlaybackSettings: FeatureSection<"media">["readSettings"];
  updateMediaPlaybackSettings(input: Parameters<MediaUpdate>[0], options: SettingsUpdateStateOptions): ReturnType<MediaUpdate>;
  readPlannerSettings: FeatureCallback<FeatureSection<"planner">["readSettings"]>;
  updatePlannerSettings(input: Parameters<PlannerUpdate>[0], options: SettingsUpdateStateOptions): ReturnType<PlannerUpdate>;
  listProjects(store: Store): ReturnType<ProjectList>;
  createProject(input: Parameters<ProjectCreate>[0], store: Store): ReturnType<ProjectCreate>;
  switchProject(input: Parameters<ProjectSwitch>[0]): ReturnType<ProjectSwitch>;
  workflowAgents: {
    runExploration(input: Parameters<WorkflowRunExploration>[0], context?: AgentRuntimeFeatureFactoryContext<Store, Browser>): ReturnType<WorkflowRunExploration>;
    compilePreview(input: Parameters<WorkflowCompilePreview>[0], context?: AgentRuntimeFeatureFactoryContext<Store, Browser>): ReturnType<WorkflowCompilePreview>;
    reviewArtifact(input: Parameters<WorkflowReviewArtifact>[0], context?: AgentRuntimeFeatureFactoryContext<Store, Browser>): ReturnType<WorkflowReviewArtifact>;
    cancelRun(input: Parameters<WorkflowCancelRun>[0], context?: AgentRuntimeFeatureFactoryContext<Store, Browser>): ReturnType<WorkflowCancelRun>;
    recoverRun(input: Parameters<WorkflowRecoverRun>[0], context?: AgentRuntimeFeatureFactoryContext<Store, Browser>): ReturnType<WorkflowRecoverRun>;
  };
  workflowRecordings: FeatureSection<"workflowRecordings">;
  readVoiceSettings: FeatureSection<"voice">["readSettings"];
  updateVoiceSettings(
    input: Parameters<VoiceUpdate>[0],
    audit: Parameters<VoiceUpdate>[1],
    options: VoiceUpdateOptions<Store>,
  ): ReturnType<VoiceUpdate>;
  listVoiceProviders: FeatureCallback<FeatureSection<"voice">["listProviders"]>;
  enforceVoiceArtifactBudget(
    workspacePath: Parameters<FeatureCallback<FeatureSection<"voice">["enforceArtifactBudget"]>>[0],
    store: Store,
  ): ReturnType<FeatureCallback<FeatureSection<"voice">["enforceArtifactBudget"]>>;
  createMediaUrl: FeatureCallback<FeatureSection<"voice">["createMediaUrl"]>;
  readSttSettings: FeatureSection<"stt">["readSettings"];
  updateSttSettings(input: Parameters<SttUpdate>[0], options: SettingsUpdateStateOptions): ReturnType<SttUpdate>;
  listSttProviders: FeatureCallback<FeatureSection<"stt">["listProviders"]>;
  privilegedCredentials: FeatureSection<"privilegedCredentials">;
  secureInputs: FeatureSection<"secureInputs">;
}

export function createAgentRuntimeFeatureFactory<Store extends AgentRuntimeFeatureFactoryStore, Browser>(
  dependencies: AgentRuntimeFeatureFactoryDependencies<Store, Browser>,
): (context?: AgentRuntimeFeatureFactoryContext<Store, Browser>) => AgentRuntimeFeatures {
  return (context) => {
    const featureStore = context?.store ?? dependencies.defaultStore();
    const emitFeatureStateUpdated = () => dependencies.emitRuntimeFeatureStateUpdated(featureStore);
    return {
      browserLoginBroker: dependencies.browserLoginBrokerEnabled,
      featureFlags: {
        readSnapshot: () => dependencies.readFeatureFlagSnapshot(featureStore),
      },
      mcp: {
        userDataPath: dependencies.userDataPath(),
        appVersion: dependencies.appVersion,
        env: dependencies.env,
      },
      localModelHostMemory: dependencies.localModelHostMemory,
      googleWorkspace: dependencies.googleWorkspace,
      workflowNativeTools: dependencies.workflowNativeTools,
      search: {
        readSettings: dependencies.readSearchSettings,
        updateSettings: (input) => dependencies.updateSearchSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
      },
      localDeepResearch: {
        readSettings: dependencies.readLocalDeepResearchSettings,
        updateSettings: (input) => dependencies.updateLocalDeepResearchSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
      },
      ...(dependencies.localTextSubagents
        ? {
          localTextSubagents: dependencies.localTextSubagents,
        }
        : {}),
      media: {
        readSettings: dependencies.readMediaPlaybackSettings,
        updateSettings: (input) => dependencies.updateMediaPlaybackSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
      },
      planner: {
        readSettings: dependencies.readPlannerSettings,
        updateSettings: (input) => dependencies.updatePlannerSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
      },
      projects: {
        listProjects: () => dependencies.listProjects(featureStore),
        createProject: (input) => dependencies.createProject(input, featureStore),
        switchProject: dependencies.switchProject,
      },
      workflowAgents: {
        runExploration: (input) => dependencies.workflowAgents.runExploration(input, context),
        compilePreview: (input) => dependencies.workflowAgents.compilePreview(input, context),
        reviewArtifact: (input) => dependencies.workflowAgents.reviewArtifact(input, context),
        cancelRun: (input) => dependencies.workflowAgents.cancelRun(input, context),
        recoverRun: (input) => dependencies.workflowAgents.recoverRun(input, context),
      },
      workflowRecordings: dependencies.workflowRecordings,
      voice: {
        readSettings: dependencies.readVoiceSettings,
        updateSettings: (input, audit) =>
          dependencies.updateVoiceSettings(input, audit, {
            providerStore: featureStore,
            workspacePath: featureStore.getWorkspace().path,
            onStateUpdated: emitFeatureStateUpdated,
          }),
        listProviders: dependencies.listVoiceProviders,
        onStateUpdated: emitFeatureStateUpdated,
        enforceArtifactBudget: (workspacePath) => dependencies.enforceVoiceArtifactBudget(workspacePath, featureStore),
        createMediaUrl: dependencies.createMediaUrl,
      },
      stt: {
        readSettings: dependencies.readSttSettings,
        updateSettings: (input) => dependencies.updateSttSettings(input, { onStateUpdated: emitFeatureStateUpdated }),
        listProviders: dependencies.listSttProviders,
      },
      privilegedCredentials: dependencies.privilegedCredentials,
      secureInputs: dependencies.secureInputs,
    };
  };
}
