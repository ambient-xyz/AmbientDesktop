import type { PiExtensionSandboxInstallPreview } from "./piExtensionSandboxPackages";
import type { PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

export type PiResourceCountsForPermission = Record<"extension" | "skill" | "prompt" | "theme", number>;

export interface PiToolingApprovalDetailFormatterDependencies {
  workspacePath(): string;
}

export interface PiToolingApprovalDetailFormatter {
  formatPiExtensionSandboxInstallApprovalDetail(preview: PiExtensionSandboxInstallPreview): string;
  formatPiPrivilegedInstallApprovalDetail(scan: PiPrivilegedSecurityScan): string;
  formatPiResourceCountsForPermission(counts: PiResourceCountsForPermission): string;
}

export function formatPiResourceCountsForPermission(counts: PiResourceCountsForPermission): string {
  return `extensions ${counts.extension}, skills ${counts.skill}, prompts ${counts.prompt}, themes ${counts.theme}`;
}

export function formatPiPrivilegedInstallApprovalDetail(
  scan: PiPrivilegedSecurityScan,
  workspacePath: string,
): string {
  const findings = scan.findings.length
    ? scan.findings.map((finding) => `- [${finding.severity}] ${finding.category}: ${finding.message}`).join("\n")
    : "- No high-risk patterns found by the heuristic scan.";
  return [
    `Workspace: ${workspacePath}`,
    `Package: ${scan.packageName}`,
    scan.version ? `Version: ${scan.version}` : undefined,
    `Source: ${scan.source}`,
    `Scan origin: ${scan.scanOrigin}`,
    `Fingerprint: ${scan.fingerprint}`,
    `Recommendation: ${scan.recommendation}`,
    `Findings: ${scan.findings.length}`,
    findings,
    "Effect: copy package into Ambient-managed privileged Pi install state as disabled.",
    "Alpha does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.",
    scan.caveat,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function formatPiExtensionSandboxInstallApprovalDetail(
  preview: PiExtensionSandboxInstallPreview,
  workspacePath: string,
): string {
  const tools = preview.candidate?.tools.map((tool) => tool.name).join(", ") || "none";
  return [
    `Workspace: ${workspacePath}`,
    `Source: ${preview.source}`,
    preview.resolvedSource ? `Repository: ${preview.resolvedSource}` : undefined,
    preview.packagePath ? `Package path: ${preview.packagePath}` : undefined,
    preview.sha ? `SHA: ${preview.sha}` : undefined,
    preview.packageName ? `Package: ${preview.packageName}` : undefined,
    preview.version ? `Version: ${preview.version}` : undefined,
    preview.entrypoint ? `Entrypoint: ${preview.entrypoint}` : undefined,
    `Allowed network hosts: ${preview.allowedNetworkHosts.join(", ") || "none"}`,
    `Tools: ${tools}`,
    "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
    "Effect: copy the package into Ambient-managed Pi extension sandbox state.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function createPiToolingApprovalDetailFormatter({
  workspacePath,
}: PiToolingApprovalDetailFormatterDependencies): PiToolingApprovalDetailFormatter {
  return {
    formatPiExtensionSandboxInstallApprovalDetail: (preview) =>
      formatPiExtensionSandboxInstallApprovalDetail(preview, workspacePath()),
    formatPiPrivilegedInstallApprovalDetail: (scan) =>
      formatPiPrivilegedInstallApprovalDetail(scan, workspacePath()),
    formatPiResourceCountsForPermission,
  };
}
