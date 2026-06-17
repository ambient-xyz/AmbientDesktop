import type { AmbientCliPackageSummary } from "../../ambient-cli/ambientCliPackages";

export function selectAmbientCliPackageForRuntime(
  packages: AmbientCliPackageSummary[],
  selector: { packageId?: string; packageName?: string },
): AmbientCliPackageSummary {
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
