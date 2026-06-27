export type ProjectBoardProofEvidenceTone = "success" | "warning" | "danger" | "neutral";

export interface ProjectBoardProofEvidenceMetric {
  label: string;
  value: string;
  tone: ProjectBoardProofEvidenceTone;
}

export interface ProjectBoardProofEvidenceFile {
  path: string;
  status?: string;
  category: "implementation" | "test" | "visual" | "config" | "docs" | "generated" | "dependency" | "other";
  categoryLabel: string;
  meaningful: boolean;
}

export interface ProjectBoardProofEvidenceFileGroup {
  label: string;
  files: ProjectBoardProofEvidenceFile[];
}

export type ProjectBoardProofVisualRole = "mobile" | "desktop" | "tablet" | "animation" | "browser" | "generic";

export interface ProjectBoardProofEvidenceArtifact {
  kind: "screenshot" | "browser_trace" | "command" | "log";
  label: string;
  path?: string;
  detail?: string;
  previewSrc?: string;
  width?: number;
  height?: number;
  dimensionsLabel?: string;
  viewportLabel?: string;
  visualRole?: ProjectBoardProofVisualRole;
  tone: ProjectBoardProofEvidenceTone;
}

export interface ProjectBoardTaskActionEvidence {
  id: string;
  action: string;
  label: string;
  summary: string;
  createdAt?: string;
  tone: ProjectBoardProofEvidenceTone;
}

export interface ProjectBoardProofEvidenceReview {
  status: string;
  summary: string;
  reviewer?: string;
  model?: string;
  confidence?: string;
  evidenceQuality?: string;
  recommendedAction?: string;
  missing: string[];
  satisfied: string[];
}

export interface ProjectBoardProofInspectionItem {
  label: string;
  detail: string;
  tone: ProjectBoardProofEvidenceTone;
  target?: "command-evidence" | "visual-evidence" | "pm-judge" | "proof-issues";
}

export interface ProjectBoardProofVisualInspectionItem {
  label: string;
  expectation?: string;
  statusLabel: string;
  tone: ProjectBoardProofEvidenceTone;
  artifact?: ProjectBoardProofEvidenceArtifact;
  frames?: ProjectBoardProofEvidenceArtifact[];
  role: ProjectBoardProofVisualRole;
  viewportLabel?: string;
  dimensionsLabel?: string;
  thumbnailSrc?: string;
  comparisonLabel?: string;
}

export interface ProjectBoardProofPacketInspectionModel {
  headline: string;
  detail: string;
  qualityLabel: string;
  qualityTone: ProjectBoardProofEvidenceTone;
  issueCount: number;
  issueTarget: "proof-issues" | "visual-evidence" | "inspection-checklist";
  workspaceLabel?: string;
  diffLabel: string;
  checklist: ProjectBoardProofInspectionItem[];
  visualEvidence: ProjectBoardProofVisualInspectionItem[];
  failedAssertions: string[];
  transcriptExcerpt?: string;
}

export interface ProjectBoardProofInspectionNavigationChecklistItem {
  label: string;
  checkId: string;
  target?: ProjectBoardProofInspectionItem["target"];
  targetId?: string;
  ariaLabel?: string;
}

export interface ProjectBoardProofInspectionNavigationModel {
  anchorPrefix: string;
  inspectionId: string;
  checklistId: string;
  issueTargetId: string;
  pmJudgeId: string;
  commandEvidenceId: string;
  visualEvidenceId: string;
  proofIssuesId: string;
  issueJumpAriaLabel?: string;
  checklist: ProjectBoardProofInspectionNavigationChecklistItem[];
}

export interface ProjectBoardProofEvidenceModel {
  hasProof: boolean;
  summary: string;
  metrics: ProjectBoardProofEvidenceMetric[];
  files: ProjectBoardProofEvidenceFile[];
  fileGroups: ProjectBoardProofEvidenceFileGroup[];
  artifacts: ProjectBoardProofEvidenceArtifact[];
  taskActions: ProjectBoardTaskActionEvidence[];
  review?: ProjectBoardProofEvidenceReview;
  assistantSummary?: string;
  hook?: ProjectBoardProofEvidenceArtifact;
  focus?: ProjectBoardProofEvidenceArtifact;
  gitStatus: string[];
  diffPreview?: string;
  inspection: ProjectBoardProofPacketInspectionModel;
  error?: string;
}
