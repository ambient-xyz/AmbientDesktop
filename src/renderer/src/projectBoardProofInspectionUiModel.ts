import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type {
  ProjectBoardProofEvidenceArtifact,
  ProjectBoardProofEvidenceFile,
  ProjectBoardProofEvidenceReview,
  ProjectBoardProofEvidenceTone,
  ProjectBoardProofInspectionItem,
  ProjectBoardProofInspectionNavigationModel,
  ProjectBoardProofPacketInspectionModel,
  ProjectBoardProofVisualInspectionItem,
  ProjectBoardProofVisualRole,
  ProjectBoardTaskActionEvidence,
} from "./projectBoardProofEvidenceTypes";
import { truncateProjectBoardLedgerText } from "./projectBoardProofTextUiModel";

interface ProjectBoardProofPacketInspectionInput {
  run: OrchestrationRun;
  card?: ProjectBoardCard;
  proof: Record<string, unknown>;
  screenshots: ProjectBoardProofEvidenceArtifact[];
  visualChecks: ProjectBoardProofEvidenceArtifact[];
  browserTraces: ProjectBoardProofEvidenceArtifact[];
  commands: ProjectBoardProofEvidenceArtifact[];
  manualChecks: ProjectBoardProofEvidenceArtifact[];
  taskActions: ProjectBoardTaskActionEvidence[];
  changedFiles: ProjectBoardProofEvidenceFile[];
  meaningfulFiles: ProjectBoardProofEvidenceFile[];
  diff?: string;
  lastAssistantText?: string;
  error?: string;
  review?: ProjectBoardProofEvidenceReview;
  hook?: ProjectBoardProofEvidenceArtifact;
}

export function projectBoardEmptyProofPacketInspection(run: OrchestrationRun, error?: string): ProjectBoardProofPacketInspectionModel {
  return {
    headline: error ? "Run failed before proof packet was captured" : "No proof packet recorded",
    detail: error
      ? "Inspect the run error before retrying or marking the card blocked."
      : "Run the card or import execution evidence before making a PM close decision.",
    qualityLabel: error ? "Failed" : "Missing",
    qualityTone: error ? "danger" : "warning",
    issueCount: error ? 1 : 0,
    issueTarget: error ? "proof-issues" : "inspection-checklist",
    workspaceLabel: run.workspacePath,
    diffLabel: "No diff evidence",
    checklist: [
      {
        label: "Proof packet",
        detail: error ?? "No structured proof packet is attached to this run.",
        tone: error ? "danger" : "warning",
      },
    ],
    visualEvidence: [],
    failedAssertions: error ? [truncateProjectBoardLedgerText(error, 220)] : [],
  };
}

export function projectBoardProofPacketInspectionModel(
  input: ProjectBoardProofPacketInspectionInput,
): ProjectBoardProofPacketInspectionModel {
  const visualEvidence = projectBoardProofVisualInspectionItems(input.card, input.screenshots, input.visualChecks, input.browserTraces);
  const failedAssertions = projectBoardProofFailedAssertions(input);
  const expectedUnitOrIntegration = (input.card?.testPlan.unit.length ?? 0) + (input.card?.testPlan.integration.length ?? 0);
  const expectedManual = input.card?.testPlan.manual.length ?? 0;
  const hasCommandProof = Boolean(
    input.hook || input.commands.length > 0 || input.taskActions.some((action) => action.action.includes("proof")),
  );
  const hasCommandEvidenceSection = Boolean(input.hook || input.commands.length > 0);
  const hasVisualExpectation = (input.card?.testPlan.visual.length ?? 0) > 0;
  const hasVisualProof = input.screenshots.length + input.visualChecks.length + input.browserTraces.length > 0;
  const reviewTone = projectBoardProofInspectionReviewTone(input.review);
  const checklist: ProjectBoardProofInspectionItem[] = [
    {
      label: "Implementation evidence",
      detail:
        input.changedFiles.length > 0
          ? `${input.meaningfulFiles.length}/${input.changedFiles.length} changed file${input.changedFiles.length === 1 ? "" : "s"} look implementation-relevant.`
          : "No changed-file evidence is attached.",
      tone: input.meaningfulFiles.length > 0 ? "success" : "warning",
    },
    {
      label: "Command / test evidence",
      detail: hasCommandProof
        ? `${input.commands.length + (input.hook ? 1 : 0)} command or hook record${input.commands.length + (input.hook ? 1 : 0) === 1 ? "" : "s"} attached.`
        : expectedUnitOrIntegration > 0
          ? "Unit or integration proof is expected, but no command or hook record is attached."
          : "No command proof expected for this card.",
      tone: hasCommandProof
        ? failedAssertions.some((item) => /\b(test|command|hook)\b/i.test(item))
          ? "danger"
          : "success"
        : expectedUnitOrIntegration > 0
          ? "warning"
          : "neutral",
      target: hasCommandEvidenceSection ? "command-evidence" : undefined,
    },
    {
      label: "Visual evidence",
      detail: hasVisualProof
        ? `${input.screenshots.length} screenshot${input.screenshots.length === 1 ? "" : "s"}, ${input.visualChecks.length} visual check${input.visualChecks.length === 1 ? "" : "s"}, ${input.browserTraces.length} trace artifact${input.browserTraces.length === 1 ? "" : "s"}.`
        : hasVisualExpectation
          ? "Visual proof is expected, but no screenshot, visual check, or browser trace is attached."
          : "No visual proof expected for this card.",
      tone: hasVisualProof
        ? visualEvidence.some((item) => item.tone === "danger")
          ? "warning"
          : "success"
        : hasVisualExpectation
          ? "danger"
          : "neutral",
      target: hasVisualProof || hasVisualExpectation ? "visual-evidence" : undefined,
    },
    {
      label: "Diff / workspace",
      detail: `${projectBoardProofDiffLabel(input.diff, input.proof.diffTruncated === true)} · ${input.run.workspacePath}`,
      tone: input.diff
        ? input.proof.diffTruncated === true
          ? "warning"
          : "success"
        : input.changedFiles.length > 0
          ? "neutral"
          : "warning",
    },
  ];
  if (expectedManual > 0 || input.manualChecks.length > 0) {
    checklist.push({
      label: "Manual review",
      detail:
        input.manualChecks.length > 0
          ? `${input.manualChecks.length} manual check${input.manualChecks.length === 1 ? "" : "s"} attached.`
          : "Manual proof is expected, but no manual check record is attached.",
      tone: input.manualChecks.length > 0 ? "success" : "warning",
    });
  }
  if (input.review) {
    checklist.push({
      label: "PM judge",
      detail: [input.review.status, input.review.recommendedAction, input.review.evidenceQuality, input.review.confidence]
        .filter(Boolean)
        .join(" · "),
      tone: reviewTone,
      target: "pm-judge",
    });
  }
  if (input.error) {
    checklist.push({
      label: "Run error",
      detail: truncateProjectBoardLedgerText(input.error, 220),
      tone: "danger",
      target: "proof-issues",
    });
  }

  const missingVisualCount = visualEvidence.filter((item) => item.tone === "danger").length;
  const issueCount =
    failedAssertions.length > 0
      ? failedAssertions.length
      : missingVisualCount > 0
        ? missingVisualCount
        : checklist.filter((item) => item.tone === "danger").length;
  const issueTarget = failedAssertions.length > 0 ? "proof-issues" : missingVisualCount > 0 ? "visual-evidence" : "inspection-checklist";
  const qualityTone = projectBoardProofInspectionQualityTone(checklist, failedAssertions, input.review);
  const qualityLabel = projectBoardProofInspectionQualityLabel(input.review, qualityTone, issueCount);
  const headline =
    failedAssertions.length > 0
      ? `${failedAssertions.length} review issue${failedAssertions.length === 1 ? "" : "s"} need attention`
      : missingVisualCount > 0
        ? `${missingVisualCount} visual evidence gap${missingVisualCount === 1 ? "" : "s"}`
        : qualityTone === "success"
          ? "Proof packet is ready to inspect"
          : "Proof packet needs PM attention";
  const detail = [
    `${input.meaningfulFiles.length} meaningful file${input.meaningfulFiles.length === 1 ? "" : "s"}`,
    hasVisualProof
      ? `${input.screenshots.length + input.visualChecks.length + input.browserTraces.length} visual artifact${input.screenshots.length + input.visualChecks.length + input.browserTraces.length === 1 ? "" : "s"}`
      : undefined,
    input.review?.evidenceQuality ? `${input.review.evidenceQuality.toLowerCase()} evidence` : undefined,
    issueCount > 0 ? `${issueCount} review issue${issueCount === 1 ? "" : "s"}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    headline,
    detail: detail || "The proof packet is sparse; inspect the raw proof before closing the card.",
    qualityLabel,
    qualityTone,
    issueCount,
    issueTarget,
    workspaceLabel: input.run.workspacePath,
    diffLabel: projectBoardProofDiffLabel(input.diff, input.proof.diffTruncated === true),
    checklist,
    visualEvidence,
    failedAssertions,
    transcriptExcerpt: input.lastAssistantText ? truncateProjectBoardLedgerText(input.lastAssistantText, 520) : undefined,
  };
}

function projectBoardProofInspectionQualityLabel(
  review: ProjectBoardProofEvidenceReview | undefined,
  qualityTone: ProjectBoardProofEvidenceTone,
  issueCount: number,
): string {
  const reviewQuality = review?.evidenceQuality?.trim().toLowerCase();
  const evidenceLabel =
    reviewQuality === "strong"
      ? "Strong evidence"
      : reviewQuality === "mixed"
        ? "Mixed evidence"
        : reviewQuality === "weak"
          ? "Weak evidence"
          : qualityTone === "success"
            ? "Strong evidence"
            : qualityTone === "warning"
              ? "Mixed evidence"
              : "Weak evidence";
  if (issueCount > 0) return `${evidenceLabel} · ${issueCount} review issue${issueCount === 1 ? "" : "s"}`;
  if (qualityTone === "warning" && reviewQuality) return `${evidenceLabel} · Needs review`;
  return evidenceLabel;
}

function projectBoardProofAnchorSegment(value: string | undefined): string {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "proof";
}

export function projectBoardProofInspectionNavigationModel(
  inspection: ProjectBoardProofPacketInspectionModel,
  runId: string,
  cardId?: string,
): ProjectBoardProofInspectionNavigationModel {
  const anchorPrefix = `proof-${projectBoardProofAnchorSegment(cardId)}-${projectBoardProofAnchorSegment(runId)}`;
  const targetId = (
    target: ProjectBoardProofPacketInspectionModel["issueTarget"] | NonNullable<ProjectBoardProofInspectionItem["target"]>,
  ): string => `${anchorPrefix}-${target}`;
  return {
    anchorPrefix,
    inspectionId: `${anchorPrefix}-inspection`,
    checklistId: `${anchorPrefix}-inspection-checklist`,
    issueTargetId: targetId(inspection.issueTarget),
    pmJudgeId: targetId("pm-judge"),
    commandEvidenceId: targetId("command-evidence"),
    visualEvidenceId: targetId("visual-evidence"),
    proofIssuesId: targetId("proof-issues"),
    issueJumpAriaLabel: inspection.issueCount > 0 ? `Jump to ${inspection.headline}.` : undefined,
    checklist: inspection.checklist.map((item) => ({
      label: item.label,
      checkId: `${anchorPrefix}-check-${projectBoardProofAnchorSegment(item.label)}`,
      target: item.target,
      targetId: item.target ? targetId(item.target) : undefined,
      ariaLabel: item.target ? `Jump to supporting proof evidence for ${item.label}.` : undefined,
    })),
  };
}

function projectBoardProofInspectionReviewTone(review: ProjectBoardProofEvidenceReview | undefined): ProjectBoardProofEvidenceTone {
  if (!review) return "neutral";
  const status = review.status.toLowerCase();
  const quality = review.evidenceQuality?.toLowerCase();
  if (status.includes("terminal") || status.includes("follow") || status.includes("retry") || quality === "weak") return "danger";
  if (quality === "mixed" || review.missing.length > 0) return "warning";
  return "success";
}

function projectBoardProofInspectionQualityTone(
  checklist: ProjectBoardProofInspectionItem[],
  failedAssertions: string[],
  review: ProjectBoardProofEvidenceReview | undefined,
): ProjectBoardProofEvidenceTone {
  if (failedAssertions.length > 0 || checklist.some((item) => item.tone === "danger") || review?.evidenceQuality?.toLowerCase() === "weak")
    return "danger";
  if (checklist.some((item) => item.tone === "warning") || review?.evidenceQuality?.toLowerCase() === "mixed") return "warning";
  return "success";
}

function projectBoardProofDiffLabel(diff: string | undefined, truncated: boolean): string {
  if (diff && truncated) return "Diff attached, truncated";
  if (diff) return "Diff attached";
  return "No diff evidence";
}

function projectBoardProofVisualInspectionItems(
  card: ProjectBoardCard | undefined,
  screenshots: ProjectBoardProofEvidenceArtifact[],
  visualChecks: ProjectBoardProofEvidenceArtifact[],
  browserTraces: ProjectBoardProofEvidenceArtifact[],
): ProjectBoardProofVisualInspectionItem[] {
  const artifacts = [...screenshots, ...visualChecks, ...browserTraces];
  const used = new Set<ProjectBoardProofEvidenceArtifact>();
  const expectations = (card?.testPlan.visual ?? []).flatMap(projectBoardProofVisualExpectationsFromText);
  const rows = expectations.map((expectation): ProjectBoardProofVisualInspectionItem => {
    const artifact = projectBoardBestVisualArtifactForExpectation(expectation, artifacts, used);
    if (artifact) {
      const role = expectation.role === "generic" ? (artifact.visualRole ?? "generic") : expectation.role;
      used.add(artifact);
      const frames = role === "animation" ? projectBoardProofMotionFrameArtifacts(artifacts, used, artifact) : [];
      frames.forEach((frame) => used.add(frame));
      return {
        label: expectation.label,
        expectation: expectation.text,
        statusLabel:
          frames.length > 1
            ? `${frames.length} motion frames attached`
            : artifact.kind === "screenshot"
              ? "Screenshot attached"
              : artifact.kind === "browser_trace"
                ? "Trace attached"
                : "Visual check attached",
        tone: artifact.tone === "danger" ? "danger" : artifact.tone === "warning" ? "warning" : "success",
        artifact,
        ...(frames.length > 1 ? { frames } : {}),
        role,
        viewportLabel: artifact.viewportLabel ?? projectBoardProofVisualRoleLabel(role),
        dimensionsLabel: artifact.dimensionsLabel,
        thumbnailSrc: artifact.previewSrc,
        comparisonLabel:
          frames.length > 1 ? projectBoardProofMotionComparisonLabel(frames) : projectBoardProofVisualComparisonLabel(artifact, role),
      };
    }
    const motionEvidence = projectBoardProofMotionEvidenceForExpectation(expectation, artifacts, used);
    if (motionEvidence) {
      const { artifact: motionArtifact, frames } = motionEvidence;
      used.add(motionArtifact);
      frames.forEach((frame) => used.add(frame));
      return {
        label: expectation.label,
        expectation: expectation.text,
        statusLabel:
          frames.length > 1
            ? `${frames.length} motion frames attached`
            : motionArtifact.kind === "browser_trace"
              ? "Trace attached"
              : "Visual check attached",
        tone: motionArtifact.tone === "danger" ? "danger" : motionArtifact.tone === "warning" ? "warning" : "success",
        artifact: motionArtifact,
        ...(frames.length > 1 ? { frames } : {}),
        role: "animation",
        viewportLabel: motionArtifact.viewportLabel ?? projectBoardProofVisualRoleLabel("animation"),
        dimensionsLabel: motionArtifact.dimensionsLabel,
        thumbnailSrc: motionArtifact.previewSrc,
        comparisonLabel:
          frames.length > 1
            ? projectBoardProofMotionComparisonLabel(frames)
            : projectBoardProofVisualComparisonLabel(motionArtifact, "animation"),
      };
    }
    return {
      label: expectation.label,
      expectation: expectation.text,
      statusLabel: "Missing evidence",
      tone: "danger",
      role: expectation.role,
      viewportLabel: projectBoardProofVisualRoleLabel(expectation.role),
      comparisonLabel: "Expected evidence is missing",
    };
  });
  for (const artifact of artifacts) {
    if (used.has(artifact)) continue;
    const role = artifact.visualRole ?? projectBoardProofVisualRoleFromText(projectBoardProofArtifactSearchText(artifact));
    rows.push({
      label: projectBoardProofArtifactVisualLabel(artifact),
      statusLabel:
        artifact.kind === "screenshot"
          ? "Additional screenshot"
          : artifact.kind === "browser_trace"
            ? "Additional trace"
            : "Additional visual check",
      tone: artifact.tone,
      artifact,
      role,
      viewportLabel: artifact.viewportLabel ?? projectBoardProofVisualRoleLabel(role),
      dimensionsLabel: artifact.dimensionsLabel,
      thumbnailSrc: artifact.previewSrc,
      comparisonLabel: projectBoardProofVisualComparisonLabel(artifact, role),
    });
  }
  return rows;
}

function projectBoardBestVisualArtifactForExpectation(
  expectation: { label: string; text: string; keyword?: string; role: ProjectBoardProofVisualRole },
  artifacts: ProjectBoardProofEvidenceArtifact[],
  used: Set<ProjectBoardProofEvidenceArtifact>,
): ProjectBoardProofEvidenceArtifact | undefined {
  const available = artifacts.filter((artifact) => !used.has(artifact));
  if (expectation.keyword) {
    const keyword = expectation.keyword;
    return available.find((artifact) => projectBoardProofArtifactSearchText(artifact).includes(keyword));
  }
  return available[0];
}

function projectBoardProofMotionEvidenceForExpectation(
  expectation: { label: string; text: string; keyword?: string; role: ProjectBoardProofVisualRole },
  artifacts: ProjectBoardProofEvidenceArtifact[],
  used: Set<ProjectBoardProofEvidenceArtifact>,
): { artifact: ProjectBoardProofEvidenceArtifact; frames: ProjectBoardProofEvidenceArtifact[] } | undefined {
  if (expectation.role !== "animation" && expectation.keyword !== "animation") return undefined;
  const frames = projectBoardProofMotionFrameArtifacts(artifacts, used);
  if (frames.length > 1) return { artifact: frames[0], frames };
  const trace = artifacts.find((artifact) => !used.has(artifact) && artifact.kind === "browser_trace");
  return trace ? { artifact: trace, frames: [] } : undefined;
}

function projectBoardProofMotionFrameArtifacts(
  artifacts: ProjectBoardProofEvidenceArtifact[],
  used: Set<ProjectBoardProofEvidenceArtifact>,
  primary?: ProjectBoardProofEvidenceArtifact,
): ProjectBoardProofEvidenceArtifact[] {
  const seen = new Set<string>();
  const frames: ProjectBoardProofEvidenceArtifact[] = [];
  for (const artifact of artifacts) {
    if (artifact !== primary && used.has(artifact)) continue;
    if (!artifact.previewSrc || artifact.kind !== "screenshot") continue;
    const key = artifact.path ?? artifact.previewSrc ?? artifact.label;
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push(artifact);
  }
  return frames.slice(0, 4);
}

function projectBoardProofVisualExpectationsFromText(
  text: string,
): Array<{ label: string; text: string; keyword?: string; role: ProjectBoardProofVisualRole }> {
  const normalized = text.toLowerCase();
  const rows: Array<{ label: string; text: string; keyword?: string; role: ProjectBoardProofVisualRole }> = [];
  if (/\b(mobile|narrow|iphone|android|375|390|400px)\b/.test(normalized))
    rows.push({ label: "Mobile screenshot", text, keyword: "mobile", role: "mobile" });
  if (/\b(desktop|wide|1280|1440|1024|1200)\b/.test(normalized))
    rows.push({ label: "Desktop screenshot", text, keyword: "desktop", role: "desktop" });
  if (/\btablet|ipad\b/.test(normalized)) rows.push({ label: "Tablet screenshot", text, keyword: "tablet", role: "tablet" });
  if (rows.length > 0) return rows;
  if (/\b(animation|motion|animated|transition)\b/.test(normalized))
    rows.push({ label: "Animation visual proof", text, keyword: "animation", role: "animation" });
  if (/\b(chrome|safari|firefox|cross-browser|browser)\b/.test(normalized))
    rows.push({ label: "Browser visual proof", text, keyword: "browser", role: "browser" });
  if (rows.length > 0) return rows;
  return [{ label: "Visual proof", text, role: "generic" }];
}

function projectBoardProofArtifactVisualLabel(artifact: ProjectBoardProofEvidenceArtifact): string {
  const role = artifact.visualRole ?? projectBoardProofVisualRoleFromText(projectBoardProofArtifactSearchText(artifact));
  if (role === "mobile") return artifact.kind === "screenshot" ? "Mobile screenshot" : "Mobile visual check";
  if (role === "desktop") return artifact.kind === "screenshot" ? "Desktop screenshot" : "Desktop visual check";
  if (role === "tablet") return artifact.kind === "screenshot" ? "Tablet screenshot" : "Tablet visual check";
  if (role === "animation") return "Animation visual proof";
  if (artifact.kind === "browser_trace") return "Browser trace";
  if (artifact.kind === "screenshot") return artifact.label;
  return "Visual check";
}

function projectBoardProofArtifactSearchText(artifact: ProjectBoardProofEvidenceArtifact): string {
  return [artifact.label, artifact.path, artifact.detail].filter(Boolean).join(" ").toLowerCase();
}

function projectBoardProofVisualRoleFromText(text: string): ProjectBoardProofVisualRole {
  const normalized = text.toLowerCase();
  if (/\b(mobile|narrow|iphone|android|375|390|400px)\b/.test(normalized)) return "mobile";
  if (/\b(desktop|wide|1280|1440|1024|1200)\b/.test(normalized)) return "desktop";
  if (/\b(tablet|ipad)\b/.test(normalized)) return "tablet";
  if (/\b(animation|motion|animated|transition|video|gif)\b/.test(normalized)) return "animation";
  if (/\b(browser|chrome|safari|firefox|cross-browser|trace)\b/.test(normalized)) return "browser";
  return "generic";
}

export function projectBoardProofVisualRoleLabel(role: ProjectBoardProofVisualRole): string {
  if (role === "mobile") return "Mobile viewport";
  if (role === "desktop") return "Desktop viewport";
  if (role === "tablet") return "Tablet viewport";
  if (role === "animation") return "Motion proof";
  if (role === "browser") return "Browser evidence";
  return "Visual evidence";
}

function projectBoardProofVisualComparisonLabel(
  artifact: ProjectBoardProofEvidenceArtifact | undefined,
  role: ProjectBoardProofVisualRole,
): string | undefined {
  if (!artifact) return undefined;
  if (artifact.kind === "browser_trace") return "Trace can be opened for replay-level inspection.";
  if (artifact.kind === "screenshot") return `${projectBoardProofVisualRoleLabel(role)} screenshot is available for PM review.`;
  return "Visual check result is available for PM review.";
}

function projectBoardProofMotionComparisonLabel(frames: ProjectBoardProofEvidenceArtifact[]): string {
  return `Motion proof includes ${frames.length} captured state${frames.length === 1 ? "" : "s"} for PM review.`;
}

function projectBoardProofFailedAssertions(input: ProjectBoardProofPacketInspectionInput): string[] {
  const candidates = [
    input.error,
    input.hook?.tone === "danger" ? `${input.hook.label}: ${input.hook.detail ?? "Hook failed."}` : undefined,
    ...input.commands
      .filter(
        (artifact) =>
          artifact.tone === "danger" || projectBoardProofLooksFailed(artifact.detail) || projectBoardProofLooksFailed(artifact.label),
      )
      .map((artifact) => `${artifact.label}: ${artifact.detail ?? "Command evidence needs review."}`),
    ...input.visualChecks
      .filter((artifact) => artifact.tone === "danger" || artifact.tone === "warning")
      .map((artifact) => `${artifact.label}: ${artifact.detail ?? "Visual check needs review."}`),
    ...input.taskActions.filter((action) => action.tone === "danger").map((action) => `${action.label}: ${action.summary}`),
    ...(input.review?.missing ?? []),
    ...projectBoardProofFailureSentences(input.lastAssistantText),
  ].filter((item): item is string => Boolean(item && item.trim()));
  return projectBoardDedupeStrings(candidates.map((item) => truncateProjectBoardLedgerText(item.trim(), 240))).slice(0, 8);
}

function projectBoardProofLooksFailed(value: string | undefined): boolean {
  return Boolean(value && /\b(fail(?:ed|ing)?|error|exception|missing|not captured|cannot|unable|blank|low detail)\b/i.test(value));
}

function projectBoardProofFailureSentences(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => projectBoardProofLooksFailed(sentence))
    .slice(0, 4);
}

function projectBoardDedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function projectBoardProofVisualRoleFromArtifactData(
  text: string,
  width: number | undefined,
  height: number | undefined,
): ProjectBoardProofVisualRole {
  const role = projectBoardProofVisualRoleFromText(text);
  if (role !== "generic") return role;
  const shortestEdge = Math.min(width ?? Number.POSITIVE_INFINITY, height ?? Number.POSITIVE_INFINITY);
  const longestEdge = Math.max(width ?? 0, height ?? 0);
  if (shortestEdge <= 500 && longestEdge > 0) return "mobile";
  if (shortestEdge <= 900 && longestEdge <= 1200 && longestEdge > 0) return "tablet";
  if (longestEdge >= 1000) return "desktop";
  return "generic";
}
