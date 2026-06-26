import type { RuntimeSurfaceApprovalResponseMode, RuntimeSurfaceSnapshot } from "../../shared/messagingGateway";
import type {
  MessagingRemoteSurfaceApprovalResponseRequest,
  MessagingRemoteSurfacePermissionGrantRevokeRequest,
} from "./messagingRemoteSurfaceCommandTypes";
import { normalizeCommand } from "./messagingRemoteSurfaceCommandParsing";

export function approvalResponseCommand(
  normalized: string,
  surface: RuntimeSurfaceSnapshot,
):
  | {
      kind: "respond_approval";
      targetSurface: "notifications";
      targetApproval?: RuntimeSurfaceSnapshot["pendingApprovals"][number];
      targetApprovalResponse?: MessagingRemoteSurfaceApprovalResponseRequest;
      blocker?: string;
    }
  | undefined {
  const match = normalized.match(
    /^(approve|allow|deny|reject|decline)(?:\s+(?:permission|approval|request))?\s+([a-z0-9._:-]+)(?:\s+(.+))?$/,
  );
  if (!match) return undefined;
  const verb = match[1] ?? "";
  const target = match[2] ?? "";
  const modeText = (match[3] ?? "").trim();
  const approval = resolveApprovalTarget(target, surface);
  if (!approval) {
    return {
      kind: "respond_approval",
      targetSurface: "notifications",
      blocker: `Approval target was not found in the current runtime snapshot: ${target}.`,
    };
  }
  const response = responseModeForApprovalCommand(verb, modeText);
  if (!response) {
    return {
      kind: "respond_approval",
      targetSurface: "notifications",
      targetApproval: approval,
      blocker: `Unsupported approval response: ${modeText}. Use once, always thread, always workflow, always project, always workspace, or deny.`,
    };
  }
  if (!approval.responseModes.includes(response)) {
    return {
      kind: "respond_approval",
      targetSurface: "notifications",
      targetApproval: approval,
      blocker: `Approval response ${response} is not available for this request. Available responses: ${approval.responseModes.join(", ")}.`,
    };
  }
  return {
    kind: "respond_approval",
    targetSurface: "notifications",
    targetApproval: approval,
    targetApprovalResponse: {
      requestId: approval.id,
      title: approval.title,
      response,
      reason: `remote surface command ${verb} approval`,
    },
  };
}

function resolveApprovalTarget(
  target: string,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["pendingApprovals"][number] | undefined {
  const index = Number.parseInt(target, 10);
  if (Number.isFinite(index) && String(index) === target) return surface.pendingApprovals[index - 1];
  const normalized = normalizeCommand(target);
  return (
    surface.pendingApprovals.find((approval) => normalizeCommand(approval.id) === normalized) ??
    surface.pendingApprovals.find((approval) => normalizeCommand(approval.title) === normalized) ??
    surface.pendingApprovals.find((approval) => normalizeCommand(approval.title).includes(normalized))
  );
}

function responseModeForApprovalCommand(verb: string, modeText: string): RuntimeSurfaceApprovalResponseMode | undefined {
  if (["deny", "reject", "decline"].includes(verb)) return "deny";
  const normalized = normalizeCommand(modeText).replace(/[-_]/g, " ");
  if (!normalized || normalized === "once" || normalized === "allow once") return "allow_once";
  if (normalized === "always thread" || normalized === "thread" || normalized === "for thread") return "always_thread";
  if (normalized === "always workflow" || normalized === "workflow" || normalized === "for workflow") return "always_workflow";
  if (normalized === "always project" || normalized === "project" || normalized === "for project") return "always_project";
  if (normalized === "always workspace" || normalized === "workspace" || normalized === "for workspace") return "always_workspace";
  if (normalized === "deny") return "deny";
  return undefined;
}

export function permissionGrantRevokeCommand(
  normalized: string,
  surface: RuntimeSurfaceSnapshot,
):
  | {
      kind: "revoke_permission_grant";
      targetSurface: "notifications";
      targetPermissionGrant?: RuntimeSurfaceSnapshot["permissionGrants"][number];
      targetGrantRevoke?: MessagingRemoteSurfacePermissionGrantRevokeRequest;
      blocker?: string;
    }
  | undefined {
  const match =
    normalized.match(/^(?:revoke|remove|delete|clear)(?:\s+(?:permission|persistent|active))?\s+grant\s+(.+)$/) ??
    normalized.match(/^(?:revoke|remove|delete|clear)\s+permission\s+(.+)$/);
  if (!match) return undefined;
  const target = match[1] ?? "";
  const grant = resolvePermissionGrantTarget(target, surface);
  if (!grant) {
    return {
      kind: "revoke_permission_grant",
      targetSurface: "notifications",
      blocker: `Permission grant target was not found in the current runtime snapshot: ${target}.`,
    };
  }
  return {
    kind: "revoke_permission_grant",
    targetSurface: "notifications",
    targetPermissionGrant: grant,
    targetGrantRevoke: {
      grantId: grant.id,
      targetLabel: grant.targetLabel,
      reason: "remote surface command revoked permission grant",
    },
  };
}

function resolvePermissionGrantTarget(
  target: string,
  surface: RuntimeSurfaceSnapshot,
): RuntimeSurfaceSnapshot["permissionGrants"][number] | undefined {
  const index = Number.parseInt(target, 10);
  if (Number.isFinite(index) && String(index) === target) return surface.permissionGrants[index - 1];
  const normalized = normalizeCommand(target);
  return (
    surface.permissionGrants.find((grant) => normalizeCommand(grant.id) === normalized) ??
    surface.permissionGrants.find((grant) => normalizeCommand(grant.targetLabel) === normalized) ??
    surface.permissionGrants.find((grant) => normalizeCommand(grant.targetLabel).includes(normalized))
  );
}
