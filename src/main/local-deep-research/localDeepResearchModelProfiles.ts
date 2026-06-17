import { arch as hostArch, freemem, platform as hostPlatform, totalmem } from "node:os";

const gib = 1024 ** 3;
const modelRepo = "mradermacher/LiteResearcher-4B-GGUF";
const modelRevision = "f7ba7a7f6653ada3d9a83f85663d6579965bb4cd";
const verifiedAt = "2026-05-28";

export type LocalDeepResearchModelProfileId = "literesearcher-4b-q4-k-m" | "literesearcher-4b-q8-0";
export type LocalDeepResearchQuantization = "Q4_K_M" | "Q8_0";
export type LocalDeepResearchMemoryTier = "unknown" | "constrained" | "standard" | "high" | "workstation";
export type LocalDeepResearchContextMode = "safe-8k" | "target-16k" | "target-32k" | "target-48k" | "target-64k";
export type LocalDeepResearchMemoryPressure = "unknown" | "normal" | "warning" | "critical";
export type LocalDeepResearchQ8OverrideDecision = "not-requested" | "accepted" | "warned" | "rejected";

export interface LocalDeepResearchModelProfile {
  id: LocalDeepResearchModelProfileId;
  displayName: string;
  repoId: typeof modelRepo;
  revision: typeof modelRevision;
  filename: string;
  quantization: LocalDeepResearchQuantization;
  role: "everyday" | "high-quality";
  sourceUrl: string;
  sizeBytes: number;
  sha256: string;
  xetHash: string;
  licenseNote: string;
  defaultContextTokens: number;
  safeContextTokens: number;
  minimumMemoryBytes: number;
  recommendedMemoryBytes: number;
  estimatedResidentMemoryBytes: {
    safe8k: number;
    target16k: number;
  };
  notes: string[];
}

export interface LocalDeepResearchModelProfileManifest {
  schemaVersion: "ambient-local-deep-research-model-profiles-v1";
  capabilityId: "local.deep-research.literesearcher";
  modelFamily: "LiteResearcher-4B";
  repoId: typeof modelRepo;
  revision: typeof modelRevision;
  verifiedAt: typeof verifiedAt;
  source: "huggingface";
  profiles: LocalDeepResearchModelProfile[];
}

export interface LocalDeepResearchMachineFacts {
  platform: string;
  arch: string;
  memoryBytes?: number;
  availableMemoryBytes?: number;
  memoryPressure: LocalDeepResearchMemoryPressure;
  activeLocalModelCount: number;
  activeLocalModelEstimatedResidentMemoryBytes: number;
}

export interface LocalDeepResearchModelSelectionInput {
  machineFacts?: Partial<LocalDeepResearchMachineFacts>;
  q8Override?: boolean;
}

export interface LocalDeepResearchModelSelection {
  profile: LocalDeepResearchModelProfile;
  fallbackProfile?: LocalDeepResearchModelProfile;
  memoryTier: LocalDeepResearchMemoryTier;
  contextMode: LocalDeepResearchContextMode;
  contextTokens: number;
  q8OverrideDecision: LocalDeepResearchQ8OverrideDecision;
  warnings: string[];
  blockers: string[];
  rationale: string[];
}

export interface LocalDeepResearchMemoryReservation {
  status: "passed" | "failed";
  profileId: LocalDeepResearchModelProfileId;
  profileEstimatedResidentMemoryBytes: number;
  activeLocalModelEstimatedResidentMemoryBytes: number;
  availableMemoryBytes?: number;
  estimatedAvailableAfterLaunchBytes?: number;
  minimumHeadroomBytes: number;
  remainingHeadroomBytes: number;
  reason: string;
}

export const localDeepResearchModelProfilesManifest: LocalDeepResearchModelProfileManifest = {
  schemaVersion: "ambient-local-deep-research-model-profiles-v1",
  capabilityId: "local.deep-research.literesearcher",
  modelFamily: "LiteResearcher-4B",
  repoId: modelRepo,
  revision: modelRevision,
  verifiedAt,
  source: "huggingface",
  profiles: [
    {
      id: "literesearcher-4b-q4-k-m",
      displayName: "LiteResearcher-4B Q4_K_M",
      repoId: modelRepo,
      revision: modelRevision,
      filename: "LiteResearcher-4B.Q4_K_M.gguf",
      quantization: "Q4_K_M",
      role: "everyday",
      sourceUrl: `https://huggingface.co/${modelRepo}/resolve/${modelRevision}/LiteResearcher-4B.Q4_K_M.gguf`,
      sizeBytes: 2_716_069_088,
      sha256: "ff1ed3bcd8a04cb5dc6f9eea3d89823035fbc099eb2061a0bbf99ec253f605d8",
      xetHash: "3cced630679e1f6ce9180704ba0742965e6d86164cdef23bdd29870245e8e516",
      licenseNote: "Apache-2.0 base model lineage; verify final redistribution notes before bundling or mirroring.",
      defaultContextTokens: 49_152,
      safeContextTokens: 8192,
      minimumMemoryBytes: 16 * gib,
      recommendedMemoryBytes: 24 * gib,
      estimatedResidentMemoryBytes: {
        safe8k: 5 * gib,
        target16k: 7 * gib,
      },
      notes: [
        "Default profile for most hosts.",
        "Use automatically under memory pressure even when Q8 is installed.",
      ],
    },
    {
      id: "literesearcher-4b-q8-0",
      displayName: "LiteResearcher-4B Q8_0",
      repoId: modelRepo,
      revision: modelRevision,
      filename: "LiteResearcher-4B.Q8_0.gguf",
      quantization: "Q8_0",
      role: "high-quality",
      sourceUrl: `https://huggingface.co/${modelRepo}/resolve/${modelRevision}/LiteResearcher-4B.Q8_0.gguf`,
      sizeBytes: 4_693_671_648,
      sha256: "e8cb64528453ab23abc941ece6f48a04f9240029b11072cec35391eb06c2cca9",
      xetHash: "5e7dbc6449cfd01ebeba75142e07d0bb1f80bab211a89e93e7f2da75703c65a8",
      licenseNote: "Apache-2.0 base model lineage; verify final redistribution notes before bundling or mirroring.",
      defaultContextTokens: 65_536,
      safeContextTokens: 8192,
      minimumMemoryBytes: 32 * gib,
      recommendedMemoryBytes: 64 * gib,
      estimatedResidentMemoryBytes: {
        safe8k: 7 * gib,
        target16k: 10 * gib,
      },
      notes: [
        "Default on high-memory hosts with enough headroom.",
        "Expose as an advanced override with preflight warnings elsewhere.",
      ],
    },
  ],
};

export function detectLocalDeepResearchMachineFacts(input: Partial<LocalDeepResearchMachineFacts> = {}): LocalDeepResearchMachineFacts {
  return {
    platform: input.platform ?? hostPlatform(),
    arch: input.arch ?? hostArch(),
    memoryBytes: input.memoryBytes ?? totalmem(),
    availableMemoryBytes: input.availableMemoryBytes ?? input.memoryBytes ?? freemem(),
    memoryPressure: input.memoryPressure ?? "unknown",
    activeLocalModelCount: input.activeLocalModelCount ?? 0,
    activeLocalModelEstimatedResidentMemoryBytes: input.activeLocalModelEstimatedResidentMemoryBytes ?? 0,
  };
}

export function localDeepResearchMemoryTier(memoryBytes: number | undefined): LocalDeepResearchMemoryTier {
  if (!memoryBytes || !Number.isFinite(memoryBytes) || memoryBytes <= 0) return "unknown";
  if (memoryBytes < 24 * gib) return "constrained";
  if (memoryBytes < 64 * gib) return "standard";
  if (memoryBytes < 96 * gib) return "high";
  return "workstation";
}

export function selectLocalDeepResearchModelProfile(input: LocalDeepResearchModelSelectionInput = {}): LocalDeepResearchModelSelection {
  const machineFacts = detectLocalDeepResearchMachineFacts(input.machineFacts);
  const memoryTier = localDeepResearchMemoryTier(machineFacts.memoryBytes);
  const q4 = localDeepResearchProfileById("literesearcher-4b-q4-k-m");
  const q8 = localDeepResearchProfileById("literesearcher-4b-q8-0");
  const warnings: string[] = [];
  const blockers: string[] = [];
  const rationale: string[] = [];
  const pressure = machineFacts.memoryPressure;
  const activeLocalModelCount = Math.max(0, machineFacts.activeLocalModelCount);
  const activeLocalModelEstimatedResidentMemoryBytes = Math.max(0, machineFacts.activeLocalModelEstimatedResidentMemoryBytes);
  let profile = q4;
  let fallbackProfile: LocalDeepResearchModelProfile | undefined;
  let contextMode: LocalDeepResearchContextMode = localDeepResearchDefaultContextMode({
    memoryTier,
    memoryBytes: machineFacts.memoryBytes,
  });
  let q8OverrideDecision: LocalDeepResearchQ8OverrideDecision = input.q8Override ? "accepted" : "not-requested";

  if (memoryTier === "unknown") {
    warnings.push("Host memory is unknown; selecting Q4 with the 16k target and requiring launch preflight before long runs.");
    rationale.push("Q4 is the conservative profile when host memory facts are unavailable.");
  } else if (memoryTier === "constrained") {
    profile = q4;
    contextMode = "safe-8k";
    rationale.push("Hosts below 24 GiB use Q4 and 8k safe mode by default.");
  } else if (memoryTier === "standard") {
    profile = q4;
    rationale.push(`24-64 GiB hosts use Q4 with a dynamic ${formatContextTokens(localDeepResearchContextTokens(contextMode))} context target by default.`);
  } else {
    profile = q8;
    fallbackProfile = q4;
    rationale.push(`64 GiB+ hosts default to Q8 with Q4 fallback and a dynamic ${formatContextTokens(localDeepResearchContextTokens(contextMode))} context target.`);
  }

  if (pressure === "critical") {
    profile = q4;
    fallbackProfile = undefined;
    contextMode = "safe-8k";
    warnings.push("Memory pressure is critical; forcing Q4 and 8k safe mode.");
    rationale.push("Critical pressure overrides quality preferences.");
  } else if (pressure === "warning" && profile.id === q8.id) {
    profile = q4;
    fallbackProfile = q8;
    contextMode = lowerLocalDeepResearchContextMode(contextMode, "target-32k");
    warnings.push("Memory pressure is elevated; using Q4 even though the host normally qualifies for Q8.");
    rationale.push("Elevated pressure triggers the Q8-to-Q4 fallback.");
  }

  if (activeLocalModelCount > 0 && (memoryTier === "constrained" || memoryTier === "standard")) {
    profile = q4;
    fallbackProfile = profile.id === q8.id ? q8 : fallbackProfile;
    contextMode = memoryTier === "constrained" ? "safe-8k" : contextMode;
    warnings.push("Another local model is already resident; Local Deep Research will account for resident memory in launch preflight instead of blocking solely on process count.");
    rationale.push("Resident local model processes are launch-policy evidence, not automatic blockers.");
    rationale.push("Local model memory is additive across separate llama-server processes.");
  } else if (activeLocalModelCount > 0) {
    const reservation = localDeepResearchMemoryReservation({
      memoryBytes: machineFacts.memoryBytes,
      availableMemoryBytes: machineFacts.availableMemoryBytes,
      activeLocalModelEstimatedResidentMemoryBytes,
      memoryTier,
      profile,
      contextMode,
    });
    if (reservation.status === "passed") {
      warnings.push(`Another local model is already resident; ${profile.displayName} overlap passed resident-memory reservation with ${formatGiB(reservation.remainingHeadroomBytes)} GiB estimated headroom.`);
      rationale.push("High-memory overlap is allowed only after resident-memory reservation succeeds.");
    } else if (profile.id === q8.id) {
      const fallback = firstPassingContextReservation({
        memoryBytes: machineFacts.memoryBytes,
        availableMemoryBytes: machineFacts.availableMemoryBytes,
        activeLocalModelEstimatedResidentMemoryBytes,
        memoryTier,
        profile: q4,
        fromContextMode: contextMode,
      });
      profile = q4;
      fallbackProfile = q8;
      contextMode = fallback.contextMode;
      warnings.push(`Another local model is already resident; falling back to Q4 because Q8 overlap reservation failed${fallback.degraded ? `; downgraded context to ${formatContextTokens(localDeepResearchContextTokens(contextMode))}` : ""}: ${reservation.reason}`);
      rationale.push("High-memory overlap fell back to Q4 when Q8 did not reserve enough headroom.");
      if (fallback.reservation.status === "failed") {
        blockers.push(`Q4 overlap reservation failed: ${fallback.reservation.reason}`);
      }
    } else {
      blockers.push(`Another local model is already resident and Q4 overlap reservation failed: ${reservation.reason}`);
      rationale.push("Local model memory is additive across separate llama-server processes.");
    }
  }

  if (activeLocalModelCount > 0 && profile.id === q4.id && (memoryTier === "high" || memoryTier === "workstation")) {
    const q4Reservation = localDeepResearchMemoryReservation({
      memoryBytes: machineFacts.memoryBytes,
      availableMemoryBytes: machineFacts.availableMemoryBytes,
      activeLocalModelEstimatedResidentMemoryBytes,
      memoryTier,
      profile: q4,
      contextMode,
    });
    if (q4Reservation.status === "passed") {
      warnings.push(`Q4 overlap passed resident-memory reservation with ${formatGiB(q4Reservation.remainingHeadroomBytes)} GiB estimated headroom.`);
    } else {
      blockers.push(`Q4 overlap reservation failed: ${q4Reservation.reason}`);
    }
  }

  if (input.q8Override) {
    const overrideResult = q8OverrideResult({
      memoryTier,
      pressure,
      activeLocalModelCount,
      activeLocalModelEstimatedResidentMemoryBytes,
    });
    q8OverrideDecision = overrideResult.decision;
    warnings.push(...overrideResult.warnings);
    blockers.push(...overrideResult.blockers);
    if (overrideResult.decision === "accepted" || overrideResult.decision === "warned") {
      profile = q8;
      fallbackProfile = q4;
      contextMode = pressure === "warning" ? "target-16k" : contextMode;
      rationale.push("Q8 override selected the high-quality profile with Q4 fallback.");
      if (activeLocalModelCount > 0) {
        const reservation = localDeepResearchMemoryReservation({
          memoryBytes: machineFacts.memoryBytes,
          availableMemoryBytes: machineFacts.availableMemoryBytes,
          activeLocalModelEstimatedResidentMemoryBytes,
          memoryTier,
          profile: q8,
          contextMode,
        });
        if (reservation.status === "failed") {
          q8OverrideDecision = "rejected";
          profile = q4;
          fallbackProfile = q8;
          contextMode = memoryTier === "constrained" ? "safe-8k" : firstPassingContextReservation({
            memoryBytes: machineFacts.memoryBytes,
            availableMemoryBytes: machineFacts.availableMemoryBytes,
            activeLocalModelEstimatedResidentMemoryBytes,
            memoryTier,
            profile: q4,
            fromContextMode: contextMode,
          }).contextMode;
          blockers.push(`Q8 override overlap reservation failed: ${reservation.reason}`);
          rationale.push("Q8 override cannot bypass resident-memory reservation.");
        } else {
          warnings.push(`Q8 override overlap passed resident-memory reservation with ${formatGiB(reservation.remainingHeadroomBytes)} GiB estimated headroom.`);
        }
      }
    } else {
      profile = q4;
      fallbackProfile = q8;
      contextMode = "safe-8k";
      rationale.push("Q8 override was rejected by deterministic preflight policy; Q4 remains selected.");
    }
  }

  return {
    profile,
    ...(fallbackProfile ? { fallbackProfile } : {}),
    memoryTier,
    contextMode,
    contextTokens: localDeepResearchContextTokens(contextMode),
    q8OverrideDecision,
    warnings: dedupe(warnings),
    blockers: dedupe(blockers),
    rationale: dedupe(rationale),
  };
}

export function localDeepResearchProfileById(id: LocalDeepResearchModelProfileId): LocalDeepResearchModelProfile {
  const profile = localDeepResearchModelProfilesManifest.profiles.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown Local Deep Research model profile: ${id}`);
  return profile;
}

export function localDeepResearchModelAssetNames(): string[] {
  return localDeepResearchModelProfilesManifest.profiles.map((profile) => `${profile.repoId}:${profile.quantization}`);
}

export function localDeepResearchMemoryReservation(input: {
  memoryBytes: number | undefined;
  availableMemoryBytes: number | undefined;
  activeLocalModelEstimatedResidentMemoryBytes: number;
  memoryTier: LocalDeepResearchMemoryTier;
  profile: LocalDeepResearchModelProfile;
  contextMode: LocalDeepResearchContextMode;
}): LocalDeepResearchMemoryReservation {
  const profileEstimatedResidentMemoryBytes = localDeepResearchEstimatedResidentMemoryBytes(input.profile, localDeepResearchContextTokens(input.contextMode));
  const minimumHeadroomBytes = memoryReservationHeadroomBytes(input.memoryTier, input.memoryBytes);
  const activeLocalModelEstimatedResidentMemoryBytes = Math.max(0, input.activeLocalModelEstimatedResidentMemoryBytes);
  const availableMemoryBytes = validBytes(input.availableMemoryBytes);
  const estimatedAvailableAfterLaunchBytes = availableMemoryBytes !== undefined
    ? availableMemoryBytes - profileEstimatedResidentMemoryBytes
    : validBytes(input.memoryBytes) !== undefined
      ? input.memoryBytes! - activeLocalModelEstimatedResidentMemoryBytes - profileEstimatedResidentMemoryBytes
      : undefined;
  const remainingHeadroomBytes = estimatedAvailableAfterLaunchBytes !== undefined
    ? estimatedAvailableAfterLaunchBytes - minimumHeadroomBytes
    : Number.NEGATIVE_INFINITY;
  const passed = estimatedAvailableAfterLaunchBytes !== undefined && remainingHeadroomBytes >= 0;
  return {
    status: passed ? "passed" : "failed",
    profileId: input.profile.id,
    profileEstimatedResidentMemoryBytes,
    activeLocalModelEstimatedResidentMemoryBytes,
    ...(availableMemoryBytes !== undefined ? { availableMemoryBytes } : {}),
    ...(estimatedAvailableAfterLaunchBytes !== undefined ? { estimatedAvailableAfterLaunchBytes } : {}),
    minimumHeadroomBytes,
    remainingHeadroomBytes: Number.isFinite(remainingHeadroomBytes) ? remainingHeadroomBytes : 0,
    reason: passed
      ? `${input.profile.displayName} leaves at least ${formatGiB(minimumHeadroomBytes)} GiB reserved headroom.`
      : estimatedAvailableAfterLaunchBytes === undefined
        ? "Available memory is unknown, so resident overlap cannot be reserved."
        : `${input.profile.displayName} would leave ${formatGiB(Math.max(0, estimatedAvailableAfterLaunchBytes))} GiB available, below the ${formatGiB(minimumHeadroomBytes)} GiB headroom reserve.`,
  };
}

export function localDeepResearchContextTokens(contextMode: LocalDeepResearchContextMode): number {
  if (contextMode === "safe-8k") return 8_192;
  if (contextMode === "target-16k") return 16_384;
  if (contextMode === "target-32k") return 32_768;
  if (contextMode === "target-48k") return 49_152;
  return 65_536;
}

export function localDeepResearchEstimatedResidentMemoryBytes(
  profile: LocalDeepResearchModelProfile,
  contextTokens: number,
): number {
  const safeTokens = Math.max(1, profile.safeContextTokens);
  const growthBytesPer8k = Math.max(0, profile.estimatedResidentMemoryBytes.target16k - profile.estimatedResidentMemoryBytes.safe8k);
  const extra8kSteps = Math.max(0, Math.ceil((Math.max(safeTokens, contextTokens) - safeTokens) / 8_192));
  return profile.estimatedResidentMemoryBytes.safe8k + extra8kSteps * growthBytesPer8k;
}

function localDeepResearchDefaultContextMode(input: {
  memoryTier: LocalDeepResearchMemoryTier;
  memoryBytes?: number;
}): LocalDeepResearchContextMode {
  if (input.memoryTier === "constrained") return "safe-8k";
  if (input.memoryTier === "unknown") return "target-16k";
  if (input.memoryTier === "standard") {
    if ((input.memoryBytes ?? 0) >= 48 * gib) return "target-48k";
    if ((input.memoryBytes ?? 0) >= 32 * gib) return "target-32k";
    return "target-16k";
  }
  return "target-64k";
}

function lowerLocalDeepResearchContextMode(
  current: LocalDeepResearchContextMode,
  ceiling: LocalDeepResearchContextMode,
): LocalDeepResearchContextMode {
  return localDeepResearchContextTokens(current) <= localDeepResearchContextTokens(ceiling)
    ? current
    : ceiling;
}

function firstPassingContextReservation(input: {
  memoryBytes: number | undefined;
  availableMemoryBytes: number | undefined;
  activeLocalModelEstimatedResidentMemoryBytes: number;
  memoryTier: LocalDeepResearchMemoryTier;
  profile: LocalDeepResearchModelProfile;
  fromContextMode: LocalDeepResearchContextMode;
}): { contextMode: LocalDeepResearchContextMode; reservation: LocalDeepResearchMemoryReservation; degraded: boolean } {
  const candidates = localDeepResearchContextModeDowngrades(input.fromContextMode);
  let last: { contextMode: LocalDeepResearchContextMode; reservation: LocalDeepResearchMemoryReservation } | undefined;
  for (const contextMode of candidates) {
    const reservation = localDeepResearchMemoryReservation({
      memoryBytes: input.memoryBytes,
      availableMemoryBytes: input.availableMemoryBytes,
      activeLocalModelEstimatedResidentMemoryBytes: input.activeLocalModelEstimatedResidentMemoryBytes,
      memoryTier: input.memoryTier,
      profile: input.profile,
      contextMode,
    });
    last = { contextMode, reservation };
    if (reservation.status === "passed") {
      return {
        contextMode,
        reservation,
        degraded: contextMode !== input.fromContextMode,
      };
    }
  }
  return {
    contextMode: last?.contextMode ?? input.fromContextMode,
    reservation: last?.reservation ?? localDeepResearchMemoryReservation({ ...input, contextMode: input.fromContextMode }),
    degraded: (last?.contextMode ?? input.fromContextMode) !== input.fromContextMode,
  };
}

function localDeepResearchContextModeDowngrades(contextMode: LocalDeepResearchContextMode): LocalDeepResearchContextMode[] {
  const all: LocalDeepResearchContextMode[] = ["target-64k", "target-48k", "target-32k", "target-16k", "safe-8k"];
  const currentTokens = localDeepResearchContextTokens(contextMode);
  return all.filter((candidate) => localDeepResearchContextTokens(candidate) <= currentTokens);
}

function q8OverrideResult(input: {
  memoryTier: LocalDeepResearchMemoryTier;
  pressure: LocalDeepResearchMemoryPressure;
  activeLocalModelCount: number;
  activeLocalModelEstimatedResidentMemoryBytes: number;
}): { decision: LocalDeepResearchQ8OverrideDecision; warnings: string[]; blockers: string[] } {
  if (input.pressure === "critical") {
    return {
      decision: "rejected",
      warnings: [],
      blockers: ["Q8 override is rejected while memory pressure is critical."],
    };
  }
  if (input.memoryTier === "constrained" || input.memoryTier === "unknown") {
    return {
      decision: "rejected",
      warnings: [],
      blockers: ["Q8 override requires known host memory at or above 24 GiB."],
    };
  }
  if (input.activeLocalModelCount > 0 && input.memoryTier === "standard") {
    return {
      decision: "warned",
      warnings: [`Q8 override is allowed with a warning while another local model is resident; ${formatGiB(input.activeLocalModelEstimatedResidentMemoryBytes)} GiB is already reserved and launch preflight must pass resident-memory policy.`],
      blockers: [],
    };
  }
  if (input.activeLocalModelCount > 0 && input.memoryTier === "high") {
    return {
      decision: "warned",
      warnings: [`Q8 override is allowed with a warning while another local model is resident; ${formatGiB(input.activeLocalModelEstimatedResidentMemoryBytes)} GiB is already reserved and launch preflight must pass resident-memory reservation.`],
      blockers: [],
    };
  }
  if (input.memoryTier === "standard" || input.pressure === "warning") {
    return {
      decision: "warned",
      warnings: ["Q8 override is allowed with a warning; the launch preflight may still fall back to Q4."],
      blockers: [],
    };
  }
  return {
    decision: "accepted",
    warnings: [],
    blockers: [],
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function memoryReservationHeadroomBytes(memoryTier: LocalDeepResearchMemoryTier, memoryBytes: number | undefined): number {
  if (memoryTier === "workstation") return 16 * gib;
  if (memoryTier === "high") return 10 * gib;
  if (memoryTier === "standard") return 8 * gib;
  if (memoryTier === "constrained") return 6 * gib;
  const hostMemoryBytes = validBytes(memoryBytes);
  return hostMemoryBytes ? Math.max(4 * gib, Math.floor(hostMemoryBytes * 0.15)) : 8 * gib;
}

function validBytes(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatGiB(bytes: number): string {
  return (Math.max(0, bytes) / gib).toFixed(1);
}

function formatContextTokens(tokens: number): string {
  return tokens >= 1_024 ? `${Math.round(tokens / 1_024)}k` : String(tokens);
}
