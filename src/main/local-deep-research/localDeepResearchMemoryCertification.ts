import { arch, freemem, platform, totalmem } from "node:os";
import {
  localDeepResearchMemoryReservation,
  localDeepResearchProfileById,
  selectLocalDeepResearchModelProfile,
  type LocalDeepResearchMachineFacts,
  type LocalDeepResearchMemoryReservation,
  type LocalDeepResearchModelProfileId,
} from "./localDeepResearchModelProfiles";
import { writeWorkspaceTextFile } from "../workspace/workspaceFiles";

const gib = 1024 ** 3;
const certificationRoot = ".ambient/local-deep-research/memory-certification";

export type LocalDeepResearchMemoryCertificationStatus = "passed" | "failed";

export interface LocalDeepResearchMemoryCertificationCheck {
  id: string;
  title: string;
  status: LocalDeepResearchMemoryCertificationStatus;
  detail: string;
  machineFacts: Partial<LocalDeepResearchMachineFacts>;
  selectedProfileId?: string;
  contextTokens?: number;
  q8OverrideDecision?: string;
  blockers: string[];
  warnings: string[];
  reservation?: LocalDeepResearchMemoryReservation;
}

export interface LocalDeepResearchMemoryCertificationResult {
  schemaVersion: "ambient-local-deep-research-memory-certification-v1";
  checkedAt: string;
  status: LocalDeepResearchMemoryCertificationStatus;
  currentHost: {
    platform: string;
    arch: string;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
  };
  checks: LocalDeepResearchMemoryCertificationCheck[];
  artifactPath: string;
  markdownPath: string;
}

export async function runLocalDeepResearchMemoryCertification(input: {
  workspacePath: string;
  now?: () => Date;
}): Promise<LocalDeepResearchMemoryCertificationResult> {
  const checkedAt = (input.now ?? (() => new Date()))().toISOString();
  const checks = localDeepResearchMemoryCertificationChecks();
  const status: LocalDeepResearchMemoryCertificationStatus = checks.every((check) => check.status === "passed") ? "passed" : "failed";
  const pending = {
    schemaVersion: "ambient-local-deep-research-memory-certification-v1" as const,
    checkedAt,
    status,
    currentHost: {
      platform: platform(),
      arch: arch(),
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
    },
    checks,
  };
  const basePath = `${certificationRoot}/${checkedAt.replace(/[:.]/g, "-")}-${status}`;
  const json = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.json`, `${JSON.stringify(pending, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.md`, localDeepResearchMemoryCertificationMarkdown(pending));
  return {
    ...pending,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

export function localDeepResearchMemoryCertificationChecks(): LocalDeepResearchMemoryCertificationCheck[] {
  const miniCpmResidentBytes = 7 * gib;
  return [
    selectionCheck({
      id: "constrained-16gb",
      title: "16 GB constrained host",
      machineFacts: facts({ memoryGiB: 16 }),
      expect: { profileId: "literesearcher-4b-q4-k-m", contextTokens: 8192, q8OverrideDecision: "not-requested", blockerIncludes: undefined },
    }),
    selectionCheck({
      id: "standard-32gb",
      title: "32 GB standard host",
      machineFacts: facts({ memoryGiB: 32 }),
      expect: { profileId: "literesearcher-4b-q4-k-m", contextTokens: 32768, q8OverrideDecision: "not-requested" },
    }),
    selectionCheck({
      id: "high-64gb",
      title: "64 GB high-memory host",
      machineFacts: facts({ memoryGiB: 64 }),
      expect: { profileId: "literesearcher-4b-q8-0", contextTokens: 65536, q8OverrideDecision: "not-requested" },
    }),
    selectionCheck({
      id: "workstation-128gb",
      title: "128 GB workstation host",
      machineFacts: facts({ memoryGiB: 128 }),
      expect: { profileId: "literesearcher-4b-q8-0", contextTokens: 65536, q8OverrideDecision: "not-requested" },
    }),
    selectionCheck({
      id: "standard-32gb-resident-warning",
      title: "32 GB host warns on resident local-model overlap",
      machineFacts: facts({ memoryGiB: 32, activeCount: 1, activeResidentBytes: miniCpmResidentBytes }),
      expect: { profileId: "literesearcher-4b-q4-k-m", contextTokens: 32768, warningIncludes: "will account for resident memory in launch preflight" },
    }),
    selectionCheck({
      id: "high-64gb-resident-q8-reserved",
      title: "64 GB host allows Q8 overlap when reservation passes",
      machineFacts: facts({ memoryGiB: 64, availableGiB: 40, activeCount: 1, activeResidentBytes: miniCpmResidentBytes }),
      expect: { profileId: "literesearcher-4b-q8-0", contextTokens: 65536, warningIncludes: "overlap passed resident-memory reservation" },
      reservationProfileId: "literesearcher-4b-q8-0",
    }),
    selectionCheck({
      id: "high-64gb-resident-q4-fallback",
      title: "64 GB host falls back to Q4 when Q8 overlap reservation fails",
      machineFacts: facts({ memoryGiB: 64, availableGiB: 18, activeCount: 1, activeResidentBytes: miniCpmResidentBytes }),
      expect: { profileId: "literesearcher-4b-q4-k-m", contextTokens: 16384, warningIncludes: "falling back to Q4 because Q8 overlap reservation failed" },
      reservationProfileId: "literesearcher-4b-q8-0",
    }),
    selectionCheck({
      id: "workstation-128gb-resident-q8-reserved",
      title: "128 GB workstation allows Q8 overlap when reservation passes",
      machineFacts: facts({ memoryGiB: 128, availableGiB: 72, activeCount: 1, activeResidentBytes: miniCpmResidentBytes }),
      expect: { profileId: "literesearcher-4b-q8-0", contextTokens: 65536, warningIncludes: "overlap passed resident-memory reservation" },
      reservationProfileId: "literesearcher-4b-q8-0",
    }),
    selectionCheck({
      id: "standard-32gb-q8-override-warned",
      title: "32 GB Q8 override warns",
      machineFacts: facts({ memoryGiB: 32 }),
      q8Override: true,
      expect: { profileId: "literesearcher-4b-q8-0", contextTokens: 32768, q8OverrideDecision: "warned", warningIncludes: "Q8 override is allowed with a warning" },
    }),
    selectionCheck({
      id: "constrained-16gb-q8-override-rejected",
      title: "16 GB Q8 override rejects",
      machineFacts: facts({ memoryGiB: 16 }),
      q8Override: true,
      expect: { profileId: "literesearcher-4b-q4-k-m", contextTokens: 8192, q8OverrideDecision: "rejected", blockerIncludes: "at or above 24 GiB" },
    }),
  ];
}

function selectionCheck(input: {
  id: string;
  title: string;
  machineFacts: Partial<LocalDeepResearchMachineFacts>;
  q8Override?: boolean;
  reservationProfileId?: LocalDeepResearchModelProfileId;
  expect: {
    profileId: LocalDeepResearchModelProfileId;
    contextTokens: number;
    q8OverrideDecision?: string;
    blockerIncludes?: string;
    warningIncludes?: string;
  };
}): LocalDeepResearchMemoryCertificationCheck {
  const selection = selectLocalDeepResearchModelProfile({
    q8Override: input.q8Override,
    machineFacts: input.machineFacts,
  });
  const reservation = input.reservationProfileId
    ? localDeepResearchMemoryReservation({
        memoryBytes: input.machineFacts.memoryBytes,
        availableMemoryBytes: input.machineFacts.availableMemoryBytes,
        activeLocalModelEstimatedResidentMemoryBytes: input.machineFacts.activeLocalModelEstimatedResidentMemoryBytes ?? 0,
        memoryTier: selection.memoryTier,
        profile: localDeepResearchProfileById(input.reservationProfileId),
        contextMode: selection.contextMode,
      })
    : undefined;
  const failures = [
    selection.profile.id === input.expect.profileId ? undefined : `selected ${selection.profile.id}; expected ${input.expect.profileId}`,
    selection.contextTokens === input.expect.contextTokens ? undefined : `context ${selection.contextTokens}; expected ${input.expect.contextTokens}`,
    input.expect.q8OverrideDecision && selection.q8OverrideDecision !== input.expect.q8OverrideDecision
      ? `Q8 override ${selection.q8OverrideDecision}; expected ${input.expect.q8OverrideDecision}`
      : undefined,
    input.expect.blockerIncludes && !selection.blockers.join("\n").includes(input.expect.blockerIncludes)
      ? `missing blocker containing "${input.expect.blockerIncludes}"`
      : undefined,
    input.expect.warningIncludes && !selection.warnings.join("\n").includes(input.expect.warningIncludes)
      ? `missing warning containing "${input.expect.warningIncludes}"`
      : undefined,
  ].filter((failure): failure is string => Boolean(failure));
  return {
    id: input.id,
    title: input.title,
    status: failures.length ? "failed" : "passed",
    detail: failures.length ? failures.join("; ") : `Selected ${selection.profile.id} with ${selection.contextTokens} context tokens.`,
    machineFacts: input.machineFacts,
    selectedProfileId: selection.profile.id,
    contextTokens: selection.contextTokens,
    q8OverrideDecision: selection.q8OverrideDecision,
    blockers: selection.blockers,
    warnings: selection.warnings,
    ...(reservation ? { reservation } : {}),
  };
}

function facts(input: {
  memoryGiB: number;
  availableGiB?: number;
  activeCount?: number;
  activeResidentBytes?: number;
}): Partial<LocalDeepResearchMachineFacts> {
  return {
    platform: "darwin",
    arch: "arm64",
    memoryBytes: input.memoryGiB * gib,
    availableMemoryBytes: (input.availableGiB ?? input.memoryGiB) * gib,
    memoryPressure: "normal",
    activeLocalModelCount: input.activeCount ?? 0,
    activeLocalModelEstimatedResidentMemoryBytes: input.activeResidentBytes ?? 0,
  };
}

function localDeepResearchMemoryCertificationMarkdown(
  result: Omit<LocalDeepResearchMemoryCertificationResult, "artifactPath" | "markdownPath">,
): string {
  return [
    "# Local Deep Research Memory Certification",
    "",
    `Checked: ${result.checkedAt}`,
    `Status: ${result.status}`,
    `Current host: ${result.currentHost.platform}/${result.currentHost.arch}, ${formatGiB(result.currentHost.totalMemoryBytes)} GiB total, ${formatGiB(result.currentHost.freeMemoryBytes)} GiB free`,
    "",
    "| Check | Status | Selected | Detail |",
    "| --- | --- | --- | --- |",
    ...result.checks.map((check) => `| ${check.title} | ${check.status} | ${check.selectedProfileId ?? "none"} / ${check.contextTokens ?? "n/a"} | ${escapeMarkdownTable(check.detail)} |`),
    "",
  ].join("\n");
}

function formatGiB(bytes: number): string {
  return (bytes / gib).toFixed(1);
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
