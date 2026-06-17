export interface AmbientCliSkillMountDiagnostics {
  lazyModeEnabled: boolean;
  installedCliPackageCount: number;
  eagerCliSkillCount: number;
  mountedCliSkillCount: number;
}

export interface AmbientCliSkillMountResolution extends AmbientCliSkillMountDiagnostics {
  mountedCliSkillPaths: string[];
}

export function ambientCliLazySkillsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AMBIENT_CLI_EAGER_SKILLS === "1") return false;
  return true;
}

export function resolveAmbientCliSkillMount(input: {
  cliSkillPaths: string[];
  installedCliPackageCount: number;
  lazyModeEnabled?: boolean;
}): AmbientCliSkillMountResolution {
  const lazyModeEnabled = input.lazyModeEnabled ?? ambientCliLazySkillsEnabled();
  const mountedCliSkillPaths = lazyModeEnabled ? [] : input.cliSkillPaths;
  return {
    lazyModeEnabled,
    installedCliPackageCount: input.installedCliPackageCount,
    eagerCliSkillCount: input.cliSkillPaths.length,
    mountedCliSkillCount: mountedCliSkillPaths.length,
    mountedCliSkillPaths,
  };
}
