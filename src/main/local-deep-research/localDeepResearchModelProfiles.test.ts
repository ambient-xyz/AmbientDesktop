import { describe, expect, it } from "vitest";
import {
  localDeepResearchMemoryReservation,
  localDeepResearchMemoryTier,
  localDeepResearchModelAssetNames,
  localDeepResearchModelProfilesManifest,
  localDeepResearchProfileById,
  selectLocalDeepResearchModelProfile,
} from "./localDeepResearchModelProfiles";

const gib = 1024 ** 3;

describe("Local Deep Research model profiles", () => {
  it("pins the LiteResearcher Q4 and Q8 GGUF profile metadata", () => {
    expect(localDeepResearchModelProfilesManifest).toMatchObject({
      schemaVersion: "ambient-local-deep-research-model-profiles-v1",
      capabilityId: "local.deep-research.literesearcher",
      modelFamily: "LiteResearcher-4B",
      repoId: "mradermacher/LiteResearcher-4B-GGUF",
      revision: "f7ba7a7f6653ada3d9a83f85663d6579965bb4cd",
      verifiedAt: "2026-05-28",
    });
    expect(localDeepResearchModelProfilesManifest.profiles).toEqual([
      expect.objectContaining({
        id: "literesearcher-4b-q4-k-m",
        filename: "LiteResearcher-4B.Q4_K_M.gguf",
        quantization: "Q4_K_M",
        sizeBytes: 2_716_069_088,
        sha256: "ff1ed3bcd8a04cb5dc6f9eea3d89823035fbc099eb2061a0bbf99ec253f605d8",
        xetHash: "3cced630679e1f6ce9180704ba0742965e6d86164cdef23bdd29870245e8e516",
        defaultContextTokens: 49152,
        safeContextTokens: 8192,
      }),
      expect.objectContaining({
        id: "literesearcher-4b-q8-0",
        filename: "LiteResearcher-4B.Q8_0.gguf",
        quantization: "Q8_0",
        sizeBytes: 4_693_671_648,
        sha256: "e8cb64528453ab23abc941ece6f48a04f9240029b11072cec35391eb06c2cca9",
        xetHash: "5e7dbc6449cfd01ebeba75142e07d0bb1f80bab211a89e93e7f2da75703c65a8",
        defaultContextTokens: 65536,
        safeContextTokens: 8192,
      }),
    ]);
    expect(localDeepResearchModelAssetNames()).toEqual([
      "mradermacher/LiteResearcher-4B-GGUF:Q4_K_M",
      "mradermacher/LiteResearcher-4B-GGUF:Q8_0",
    ]);
  });

  it("maps memory into the product policy tiers", () => {
    expect(localDeepResearchMemoryTier(undefined)).toBe("unknown");
    expect(localDeepResearchMemoryTier(16 * gib)).toBe("constrained");
    expect(localDeepResearchMemoryTier(32 * gib)).toBe("standard");
    expect(localDeepResearchMemoryTier(64 * gib)).toBe("high");
    expect(localDeepResearchMemoryTier(128 * gib)).toBe("workstation");
  });

  it("selects Q4 with 8k safe mode on constrained hosts", () => {
    const selection = selectLocalDeepResearchModelProfile({
      machineFacts: { memoryBytes: 16 * gib, memoryPressure: "normal" },
    });

    expect(selection).toMatchObject({
      memoryTier: "constrained",
      contextMode: "safe-8k",
      contextTokens: 8192,
      q8OverrideDecision: "not-requested",
      profile: { id: "literesearcher-4b-q4-k-m" },
    });
  });

  it("selects Q4 with a larger dynamic context target on standard hosts", () => {
    const selection = selectLocalDeepResearchModelProfile({
      machineFacts: { memoryBytes: 32 * gib, memoryPressure: "normal" },
    });

    expect(selection).toMatchObject({
      memoryTier: "standard",
      contextMode: "target-32k",
      contextTokens: 32768,
      profile: { id: "literesearcher-4b-q4-k-m" },
    });

    expect(selectLocalDeepResearchModelProfile({
      machineFacts: { memoryBytes: 48 * gib, memoryPressure: "normal" },
    })).toMatchObject({
      memoryTier: "standard",
      contextMode: "target-48k",
      contextTokens: 49152,
      profile: { id: "literesearcher-4b-q4-k-m" },
    });
  });

  it("selects Q8 with Q4 fallback on high-memory hosts", () => {
    const selection = selectLocalDeepResearchModelProfile({
      machineFacts: { memoryBytes: 64 * gib, memoryPressure: "normal" },
    });

    expect(selection).toMatchObject({
      memoryTier: "high",
      contextMode: "target-64k",
      contextTokens: 65536,
      profile: { id: "literesearcher-4b-q8-0" },
      fallbackProfile: { id: "literesearcher-4b-q4-k-m" },
    });
  });

  it("allows a warned Q8 override on standard hosts", () => {
    const selection = selectLocalDeepResearchModelProfile({
      q8Override: true,
      machineFacts: { memoryBytes: 32 * gib, memoryPressure: "normal" },
    });

    expect(selection).toMatchObject({
      memoryTier: "standard",
      q8OverrideDecision: "warned",
      profile: { id: "literesearcher-4b-q8-0" },
      fallbackProfile: { id: "literesearcher-4b-q4-k-m" },
      blockers: [],
    });
    expect(selection.warnings.join("\n")).toContain("Q8 override is allowed with a warning");
  });

  it("rejects Q8 override when memory is constrained and warns when another local model is resident", () => {
    const constrained = selectLocalDeepResearchModelProfile({
      q8Override: true,
      machineFacts: { memoryBytes: 16 * gib, memoryPressure: "normal" },
    });
    const resident = selectLocalDeepResearchModelProfile({
      q8Override: true,
      machineFacts: {
        memoryBytes: 32 * gib,
        availableMemoryBytes: 24 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
        activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
      },
    });

    expect(constrained).toMatchObject({
      q8OverrideDecision: "rejected",
      profile: { id: "literesearcher-4b-q4-k-m" },
      contextMode: "safe-8k",
    });
    expect(constrained.blockers.join("\n")).toContain("at or above 24 GiB");
    expect(resident).toMatchObject({
      q8OverrideDecision: "warned",
      profile: { id: "literesearcher-4b-q8-0" },
      fallbackProfile: { id: "literesearcher-4b-q4-k-m" },
      blockers: [],
    });
    expect(resident.warnings.join("\n")).toContain("another local model is resident");
  });

  it("warns about another resident local model on non-high-memory hosts without blocking by process count", () => {
    const selection = selectLocalDeepResearchModelProfile({
      machineFacts: {
        memoryBytes: 32 * gib,
        availableMemoryBytes: 24 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
        activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
      },
    });

    expect(selection).toMatchObject({
      memoryTier: "standard",
      profile: { id: "literesearcher-4b-q4-k-m" },
      contextMode: "target-32k",
      blockers: [],
    });
    expect(selection.warnings.join("\n")).toContain("will account for resident memory in launch preflight");
    expect(selection.rationale.join("\n")).toContain("not automatic blockers");
  });

  it("allows high-memory overlap only when resident-memory reservation passes", () => {
    const reserved = selectLocalDeepResearchModelProfile({
      machineFacts: {
        memoryBytes: 64 * gib,
        availableMemoryBytes: 40 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
        activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
      },
    });
    const fallback = selectLocalDeepResearchModelProfile({
      machineFacts: {
        memoryBytes: 64 * gib,
        availableMemoryBytes: 18 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
        activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
      },
    });

    expect(reserved).toMatchObject({
      memoryTier: "high",
      profile: { id: "literesearcher-4b-q8-0" },
      contextTokens: 65536,
      blockers: [],
    });
    expect(reserved.warnings.join("\n")).toContain("overlap passed resident-memory reservation");
    expect(fallback).toMatchObject({
      memoryTier: "high",
      profile: { id: "literesearcher-4b-q4-k-m" },
      fallbackProfile: { id: "literesearcher-4b-q8-0" },
      blockers: [],
    });
    expect(fallback.warnings.join("\n")).toContain("falling back to Q4 because Q8 overlap reservation failed");
  });

  it("reports memory reservation headroom for overlap decisions", () => {
    const reservation = localDeepResearchMemoryReservation({
      memoryBytes: 64 * gib,
      availableMemoryBytes: 40 * gib,
      activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
      memoryTier: "high",
      profile: localDeepResearchProfileById("literesearcher-4b-q8-0"),
      contextMode: "target-64k",
    });

    expect(reservation).toMatchObject({
      status: "passed",
      profileId: "literesearcher-4b-q8-0",
      profileEstimatedResidentMemoryBytes: 28 * gib,
      activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
      minimumHeadroomBytes: 10 * gib,
      remainingHeadroomBytes: 2 * gib,
    });
  });

  it("forces Q4 safe mode under critical memory pressure", () => {
    const selection = selectLocalDeepResearchModelProfile({
      q8Override: true,
      machineFacts: { memoryBytes: 128 * gib, memoryPressure: "critical" },
    });

    expect(selection).toMatchObject({
      memoryTier: "workstation",
      contextMode: "safe-8k",
      contextTokens: 8192,
      q8OverrideDecision: "rejected",
      profile: { id: "literesearcher-4b-q4-k-m" },
    });
    expect(selection.blockers.join("\n")).toContain("memory pressure is critical");
  });
});
