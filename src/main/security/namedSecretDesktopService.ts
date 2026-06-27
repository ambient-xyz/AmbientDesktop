import type { NamedSecretStore } from "./namedSecretStore";

type NamedSecretDesktopStore = Pick<NamedSecretStore, "save" | "update" | "delete" | "brokerToLocalFixture" | "exportMetadata">;

export interface NamedSecretDesktopServiceDependencies {
  namedSecretStore(): NamedSecretDesktopStore;
  emitDesktopState(): void;
}

export function createNamedSecretDesktopService(dependencies: NamedSecretDesktopServiceDependencies) {
  const emitAfterMutation = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = await operation();
    dependencies.emitDesktopState();
    return result;
  };

  return {
    saveNamedSecret: (input: Parameters<NamedSecretDesktopStore["save"]>[0]) =>
      emitAfterMutation(() => dependencies.namedSecretStore().save(input)),
    updateNamedSecret: (input: Parameters<NamedSecretDesktopStore["update"]>[0]) =>
      emitAfterMutation(() => dependencies.namedSecretStore().update(input)),
    deleteNamedSecret: (input: Parameters<NamedSecretDesktopStore["delete"]>[0]) =>
      emitAfterMutation(() => dependencies.namedSecretStore().delete(input)),
    brokerNamedSecretToLocalFixture: (input: Parameters<NamedSecretDesktopStore["brokerToLocalFixture"]>[0]) =>
      emitAfterMutation(() => dependencies.namedSecretStore().brokerToLocalFixture(input)),
    exportNamedSecretMetadata: () => dependencies.namedSecretStore().exportMetadata(),
  };
}
