import {
  registerPiToolingDomainIpc,
  type RegisterPiToolingDomainIpcDependencies,
} from "./registerPiToolingDomainIpc";
import {
  registerPluginToolingDomainIpc,
  type RegisterPluginToolingDomainIpcDependencies,
} from "./registerPluginToolingDomainIpc";

export function registerMainPluginToolingIpc(
  deps: Record<string, unknown>,
): void {
  registerPluginToolingDomainIpc(
    deps as unknown as RegisterPluginToolingDomainIpcDependencies,
  );
  registerPiToolingDomainIpc(
    deps as unknown as RegisterPiToolingDomainIpcDependencies,
  );
}
