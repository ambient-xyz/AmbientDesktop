import { describe, expect, it, vi } from "vitest";
import type {
  BrokerNamedSecretUseInput,
  DeleteNamedSecretInput,
  SaveNamedSecretInput,
  UpdateNamedSecretInput,
} from "../../shared/namedSecretTypes";
import { createNamedSecretDesktopService } from "./namedSecretDesktopService";

describe("createNamedSecretDesktopService", () => {
  it("emits desktop state after named-secret mutations", async () => {
    const emitDesktopState = vi.fn();
    const store = {
      save: vi.fn(async (input: SaveNamedSecretInput) => {
        void input;
        return [];
      }),
      update: vi.fn(async (input: UpdateNamedSecretInput) => {
        void input;
        return [];
      }),
      delete: vi.fn(async (input: DeleteNamedSecretInput) => {
        void input;
        return [];
      }),
      brokerToLocalFixture: vi.fn(async (input: BrokerNamedSecretUseInput) => ({
        schemaVersion: "ambient-named-secret-broker-result-v1" as const,
        id: "secret-id",
        label: "API",
        scope: "workspace" as const,
        target: "local-fixture" as const,
        purpose: input.purpose,
        approved: true,
        delivered: true,
        redactedEvidence: "Secret API was brokered to a local fixture.",
        usedAt: "2026-06-26T00:00:00.000Z",
      })),
      exportMetadata: vi.fn(() => ({
        schemaVersion: "ambient-named-secret-metadata-export-v1" as const,
        exportedAt: "2026-06-26T00:00:00.000Z",
        secrets: [],
      })),
    };
    const service = createNamedSecretDesktopService({
      namedSecretStore: () => store,
      emitDesktopState,
    });

    await service.saveNamedSecret({ label: "API", value: "secret" });
    await service.updateNamedSecret({ id: "secret-id", label: "Renamed" });
    await service.deleteNamedSecret({ id: "secret-id" });
    await service.brokerNamedSecretToLocalFixture({ id: "secret-id", purpose: "test", target: "local-fixture" });

    expect(store.save).toHaveBeenCalledWith({ label: "API", value: "secret" });
    expect(store.update).toHaveBeenCalledWith({ id: "secret-id", label: "Renamed" });
    expect(store.delete).toHaveBeenCalledWith({ id: "secret-id" });
    expect(store.brokerToLocalFixture).toHaveBeenCalledWith({
      id: "secret-id",
      purpose: "test",
      target: "local-fixture",
    });
    expect(emitDesktopState).toHaveBeenCalledTimes(4);
  });

  it("does not emit desktop state when exporting metadata", () => {
    const emitDesktopState = vi.fn();
    const store = {
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      brokerToLocalFixture: vi.fn(),
      exportMetadata: vi.fn(() => ({
        schemaVersion: "ambient-named-secret-metadata-export-v1" as const,
        exportedAt: "2026-06-26T00:00:00.000Z",
        secrets: [],
      })),
    };
    const service = createNamedSecretDesktopService({
      namedSecretStore: () => store,
      emitDesktopState,
    });

    expect(service.exportNamedSecretMetadata()).toEqual({
      schemaVersion: "ambient-named-secret-metadata-export-v1",
      exportedAt: "2026-06-26T00:00:00.000Z",
      secrets: [],
    });
    expect(store.exportMetadata).toHaveBeenCalledTimes(1);
    expect(emitDesktopState).not.toHaveBeenCalled();
  });
});
