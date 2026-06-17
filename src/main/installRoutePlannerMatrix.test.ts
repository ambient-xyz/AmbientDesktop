import { mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAmbientCliPackages, runAmbientCliPackageCommand } from "./ambientCliPackages";
import {
  registerCapabilityBuilderPackage,
  scaffoldCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
  type CapabilityBuilderInstallerShape,
} from "./capability-builder/capabilityBuilder";

describe("Ambient install route real install matrix", () => {
  let workspace = "";

  beforeEach(async () => {
    workspace = await realpath(await mkdtemp(join(tmpdir(), "ambient-install-route-matrix-")));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("installs and smokes generated Pi marketplace wrappers as Ambient-owned packages", async () => {
    const cases: Array<{
      name: string;
      goal: string;
      installerShape: CapabilityBuilderInstallerShape;
      responseFormats?: string[];
    }> = [
      {
        name: "ambient-generated-pi-weather-wrapper",
        goal: "Adapt a simple Pi weather skill into an Ambient wrapper that returns concise JSON.",
        installerShape: "custom-cli",
        responseFormats: ["JSON"],
      },
      {
        name: "ambient-generated-pi-unit-wrapper",
        goal: "Adapt a simple Pi unit conversion skill into an Ambient wrapper with a narrow CLI command.",
        installerShape: "custom-cli",
      },
      {
        name: "ambient-generated-pi-search-wrapper",
        goal: "Adapt a simple Pi public API search skill into an Ambient wrapper without executing upstream extension hooks.",
        installerShape: "search-provider",
        responseFormats: ["JSON"],
      },
    ];

    for (const item of cases) {
      const scaffolded = await scaffoldCapabilityBuilderPackage(workspace, {
        name: item.name,
        goal: item.goal,
        installerShape: item.installerShape,
        locality: "local",
        responseFormats: item.responseFormats,
      });
      expect(scaffolded.files).toEqual(expect.arrayContaining(["ambient-cli.json", "SKILL.md", "scripts/run.mjs", "tests/smoke.test.mjs"]));

      const validated = await validateCapabilityBuilderPackage(workspace, {
        packageName: item.name,
        includeSmokeTests: true,
      });
      expect(validated.succeeded, item.name).toBe(true);
      expect(validated.commands.map((command) => command.source), item.name).toEqual(expect.arrayContaining(["healthCheck", "smokeTest"]));

      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: item.name });
      expect(registered.installedPackage.name).toBe(item.name);
      expect(registered.installedPackage.generated?.schemaVersion).toBe("ambient-capability-builder-v1");
      expect(registered.installedPackage.generated?.status).toMatch(/^(validated|registered)$/);

      const catalog = await discoverAmbientCliPackages(workspace, { includeHealth: true });
      const installed = catalog.packages.find((pkg) => pkg.name === item.name);
      expect(installed?.healthChecks?.every((check) => check.passed), item.name).toBe(true);
      const commandName = installed?.commands[0]?.name;
      expect(commandName, item.name).toBeTruthy();

      const smoke = await runAmbientCliPackageCommand(workspace, {
        packageName: item.name,
        command: commandName!,
      });
      expect(smoke.stdout, item.name).toContain("Draft capability scaffold");
    }
  });
});
