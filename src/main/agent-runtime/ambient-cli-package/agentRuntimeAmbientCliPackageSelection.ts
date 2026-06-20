import type { AmbientCliPackageSummary } from "../agentRuntimeAmbientCliFacade";

export interface AmbientCliPackageSelectionCandidate {
  id: string;
  name: string;
}

export function selectAmbientCliPackage<T extends AmbientCliPackageSelectionCandidate>(
  packages: T[],
  selector: { packageId?: string; packageName?: string },
): T {
  if (selector.packageId) {
    const pkg = packages.find((candidate) => candidate.id === selector.packageId);
    if (!pkg) throw new Error(`Ambient CLI package "${selector.packageId}" was not found.`);
    return pkg;
  }
  if (selector.packageName) {
    const matches = packages.filter((candidate) => candidate.name === selector.packageName);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Ambient CLI package name "${selector.packageName}" matched multiple packages. Specify packageId.`);
    throw new Error(`Ambient CLI package "${selector.packageName}" was not found.`);
  }
  throw new Error("packageId or packageName is required.");
}

export function selectAmbientCliPackageForRuntime<T extends AmbientCliPackageSelectionCandidate = AmbientCliPackageSummary>(
  packages: T[],
  selector: { packageId?: string; packageName?: string },
): T {
  return selectAmbientCliPackage(packages, selector);
}
