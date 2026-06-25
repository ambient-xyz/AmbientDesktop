import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import type { MiniCpmVisionRuntimeInstallResult, MiniCpmVisionRuntimeMacosSecurity } from "../../shared/localRuntimeTypes";

export function macosQuarantineStatus(binaryPath: string): MiniCpmVisionRuntimeInstallResult["macosQuarantine"] {
  if (platform() !== "darwin") return "not-checked";
  const result = spawnSync("xattr", ["-p", "com.apple.quarantine", binaryPath], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 && result.stdout.trim() ? "present" : "not-present";
}

export function assessMacosManagedRuntimeSecurity(binaryPath: string): MiniCpmVisionRuntimeMacosSecurity | undefined {
  if (platform() !== "darwin") return undefined;
  const quarantineBefore = macosQuarantineStatus(binaryPath) ?? "not-checked";
  let quarantineAction: MiniCpmVisionRuntimeMacosSecurity["quarantineAction"] = "not-needed";
  if (quarantineBefore === "present") {
    const remove = spawnSync("xattr", ["-d", "com.apple.quarantine", binaryPath], { encoding: "utf8", timeout: 5000 });
    quarantineAction = remove.status === 0 ? "removed-after-checksum" : "failed";
  }
  const quarantineAfter = macosQuarantineStatus(binaryPath) ?? "not-checked";
  const codeSignature = assessMacosCodeSignature(binaryPath);
  const gatekeeper = assessMacosGatekeeper(binaryPath);
  const gatekeeperEligible = quarantineAfter !== "present" && codeSignature.status === "valid" && gatekeeper.status === "accepted";
  const ambientManagedEligible = quarantineAfter !== "present" && codeSignature.status === "valid";
  const eligible = gatekeeperEligible || ambientManagedEligible;
  const promotionPolicy: MiniCpmVisionRuntimeMacosSecurity["promotionPolicy"] | undefined = gatekeeperEligible
    ? "gatekeeper-accepted"
    : ambientManagedEligible
      ? "ambient-managed-valid-signature"
      : undefined;
  return {
    platform: "darwin",
    quarantineBefore,
    quarantineAction,
    quarantineAfter,
    codeSignature: codeSignature.status,
    ...(codeSignature.detail ? { codeSignatureDetail: codeSignature.detail } : {}),
    gatekeeperAssessment: gatekeeper.status,
    ...(gatekeeper.detail ? { gatekeeperDetail: gatekeeper.detail } : {}),
    defaultDownloadPromotion: eligible ? "eligible" : "blocked",
    ...(promotionPolicy ? { promotionPolicy } : {}),
    ...(eligible ? {} : { promotionBlocker: "Default managed runtime download requires a checksum-verified, quarantine-free macOS runtime with a valid code signature, or a notarized/Gatekeeper-accepted binary." }),
  };
}

function assessMacosCodeSignature(binaryPath: string): {
  status: MiniCpmVisionRuntimeMacosSecurity["codeSignature"];
  detail?: string;
} {
  const result = spawnSync("codesign", ["--verify", "--verbose=2", binaryPath], { encoding: "utf8", timeout: 10_000 });
  const detail = processDetail(result);
  if (result.error) return { status: "not-run", detail };
  if (result.status === 0) return { status: "valid", ...(detail ? { detail } : {}) };
  if (/not signed|code object is not signed/i.test(detail)) return { status: "unsigned", detail };
  return { status: "invalid", detail };
}

function assessMacosGatekeeper(binaryPath: string): {
  status: MiniCpmVisionRuntimeMacosSecurity["gatekeeperAssessment"];
  detail?: string;
} {
  const result = spawnSync("spctl", ["-a", "-vv", "--type", "exec", binaryPath], { encoding: "utf8", timeout: 10_000 });
  const detail = processDetail(result);
  if (result.error) return { status: "not-run", detail };
  return { status: result.status === 0 ? "accepted" : "rejected", ...(detail ? { detail } : {}) };
}

function processDetail(result: { error?: Error; stderr?: string | Buffer | null; stdout?: string | Buffer | null }): string {
  const detail = [result.error?.message, processOutputText(result.stderr), processOutputText(result.stdout)]
    .filter((item): item is string => Boolean(item))
    .join("\n")
    .trim();
  return detail.length > 1000 ? `${detail.slice(0, 1000)}...` : detail;
}

function processOutputText(value: string | Buffer | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = typeof value === "string" ? value : value.toString("utf8");
  return text.trim() || undefined;
}
