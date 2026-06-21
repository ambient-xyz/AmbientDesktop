import type { DesktopToolDescriptor } from "./desktopToolDescriptorTypes";

export const ambientCliMaintenanceToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_cli_package_uninstall",
    label: "CLI Package Uninstall",
    description: "Uninstall an Ambient-managed CLI package and remove its copied package files.",
    promptSnippet: "ambient_cli_package_uninstall: With approval, uninstall an Ambient-managed CLI package by package id or name.",
    promptGuidelines: [
      "Use ambient_cli_package_uninstall when the user wants to remove an installed Ambient CLI package.",
      "This tool only removes packages copied into Ambient-owned CLI package state.",
      "After uninstall, declared skills and commands disappear after the Pi session refreshes or on the next turn.",
      "Do not use this tool in Planner Mode.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string", description: "Exact installed Ambient CLI package id." },
        packageName: { type: "string", description: "Installed Ambient CLI package name." },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "write-workspace",
    permissionScope: "cli-package-uninstall",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 120_000,
  },
];
