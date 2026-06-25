import type { AmbientInstallRoutePlan } from "../agentRuntimeInstallRouteFacade";

export interface PiRawInstallRouteMetadata {
  routeKind: "raw-pi-exception";
  selectedSource: string;
  targetPackage?: string;
  approvalBoundary: "privileged-approval-required";
  reason: string;
}

export interface PiRawInstallRouteValidationInput {
  toolName: string;
  params: Record<string, unknown>;
  source: string;
  latestInstallRouteLane?: () => AmbientInstallRoutePlan["lane"] | undefined;
}

const RAW_PI_EXCEPTION_ROUTE_KIND = "raw-pi-exception";
const RAW_PI_EXCEPTION_APPROVAL_BOUNDARY = "privileged-approval-required";
const RAW_PI_EXCEPTION_LANE: AmbientInstallRoutePlan["lane"] = "pi-marketplace-privileged-review";

export function requirePiRawInstallRouteMetadata(input: PiRawInstallRouteValidationInput): PiRawInstallRouteMetadata {
  const latestLane = input.latestInstallRouteLane?.();
  const route = parseInstallRoute(input.params.installRoute);
  if (!route) throw new Error(piRawInstallRouteRequiredMessage(input.toolName, latestLane));
  if (route.routeKind !== RAW_PI_EXCEPTION_ROUTE_KIND) {
    throw new Error([
      `Raw Pi install route rejected for ${input.toolName}.`,
      `Expected installRoute.routeKind="${RAW_PI_EXCEPTION_ROUTE_KIND}".`,
      `Received routeKind="${route.routeKind}".`,
      piRawInstallRouteNextStep(latestLane),
    ].join("\n"));
  }
  if (route.approvalBoundary !== RAW_PI_EXCEPTION_APPROVAL_BOUNDARY) {
    throw new Error([
      `Raw Pi install route rejected for ${input.toolName}.`,
      `Expected installRoute.approvalBoundary="${RAW_PI_EXCEPTION_APPROVAL_BOUNDARY}".`,
      `Received approvalBoundary="${route.approvalBoundary}".`,
      piRawInstallRouteNextStep(latestLane),
    ].join("\n"));
  }
  if (normalizeRouteSource(route.selectedSource) !== normalizeRouteSource(input.source)) {
    throw new Error([
      `Raw Pi install route rejected for ${input.toolName}.`,
      "installRoute.selectedSource must match the source being installed.",
      `Source: ${input.source}`,
      `Selected source: ${route.selectedSource}`,
      piRawInstallRouteNextStep(latestLane),
    ].join("\n"));
  }
  if (input.latestInstallRouteLane && latestLane !== RAW_PI_EXCEPTION_LANE) {
    throw new Error([
      `Raw Pi install route rejected for ${input.toolName}.`,
      `Latest ambient_install_route_plan lane must be "${RAW_PI_EXCEPTION_LANE}" before raw Pi install side effects.`,
      latestLane ? `Latest lane: ${latestLane}` : "No install route plan has been completed in this thread.",
      piRawInstallRouteNextStep(latestLane),
    ].join("\n"));
  }
  return route;
}

export function piRawInstallRouteGrantConditions(route: PiRawInstallRouteMetadata): Record<string, unknown> {
  return { installRoute: route };
}

export function piRawInstallRouteApprovalDetail(route: PiRawInstallRouteMetadata): string {
  return [
    `Route kind: ${route.routeKind}`,
    `Selected source: ${route.selectedSource}`,
    route.targetPackage ? `Target package: ${route.targetPackage}` : undefined,
    `Approval boundary: ${route.approvalBoundary}`,
    `Route reason: ${route.reason}`,
  ].filter(Boolean).join("\n");
}

export const piRawInstallRouteInputSchema = {
  type: "object",
  description: "Required for unwrapped raw Pi install exceptions after ambient_install_route_plan selects pi-marketplace-privileged-review. Reviewed Pi wrappers do not need this raw exception lane.",
  properties: {
    routeKind: {
      type: "string",
      enum: [RAW_PI_EXCEPTION_ROUTE_KIND],
      description: "Must be raw-pi-exception for unwrapped raw Pi install side effects.",
    },
    selectedSource: {
      type: "string",
      description: "Exact source being installed; must match source.",
    },
    targetPackage: {
      type: "string",
      description: "Optional expected package name from the route or scan.",
    },
    approvalBoundary: {
      type: "string",
      enum: [RAW_PI_EXCEPTION_APPROVAL_BOUNDARY],
      description: "Must match the privileged review approval boundary.",
    },
    reason: {
      type: "string",
      description: "Short reason the user explicitly approved the raw Pi exception path instead of a reviewed wrapper or Capability Builder route.",
    },
  },
  required: ["routeKind", "selectedSource", "approvalBoundary", "reason"],
  additionalProperties: false,
} as const;

function parseInstallRoute(value: unknown): PiRawInstallRouteMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const route = value as Record<string, unknown>;
  const routeKind = stringField(route, "routeKind");
  const selectedSource = stringField(route, "selectedSource");
  const approvalBoundary = stringField(route, "approvalBoundary");
  const reason = stringField(route, "reason");
  if (!routeKind || !selectedSource || !approvalBoundary || !reason) return undefined;
  const targetPackage = stringField(route, "targetPackage");
  return {
    routeKind: routeKind as PiRawInstallRouteMetadata["routeKind"],
    selectedSource,
    ...(targetPackage ? { targetPackage } : {}),
    approvalBoundary: approvalBoundary as PiRawInstallRouteMetadata["approvalBoundary"],
    reason,
  };
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function normalizeRouteSource(value: string): string {
  return value.trim();
}

function piRawInstallRouteRequiredMessage(toolName: string, latestLane: AmbientInstallRoutePlan["lane"] | undefined): string {
  return [
    `Raw Pi install route metadata is required for ${toolName}.`,
    `Pass installRoute.routeKind="${RAW_PI_EXCEPTION_ROUTE_KIND}", selectedSource matching source, approvalBoundary="${RAW_PI_EXCEPTION_APPROVAL_BOUNDARY}", and a reason after ambient_install_route_plan selects ${RAW_PI_EXCEPTION_LANE}.`,
    piRawInstallRouteNextStep(latestLane),
  ].join("\n");
}

function piRawInstallRouteNextStep(latestLane: AmbientInstallRoutePlan["lane"] | undefined): string {
  return [
    latestLane ? `Latest install route lane: ${latestLane}.` : "No install route plan has been completed in this thread.",
    "Next: use ambient_cli_package_install_pi_catalog for reviewed wrappers, ambient_capability_builder_plan for generated wrappers, or ambient_pi_privileged_scan followed by an explicit raw-pi-exception installRoute only for approved raw exceptions.",
  ].join(" ");
}
