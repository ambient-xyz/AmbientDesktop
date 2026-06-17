import { describe, expect, it } from "vitest";

import { selectAmbientCliPackageForRuntime } from "./agentRuntimeAmbientCliPackageSelection";

describe("agentRuntimeAmbientCliPackageSelection", () => {
  it("selects a package by id", () => {
    expect(selectAmbientCliPackageForRuntime(packageFixtures(), { packageId: "pkg-2" })).toMatchObject({
      id: "pkg-2",
      name: "beta",
    });
  });

  it("selects a package by unique name", () => {
    expect(selectAmbientCliPackageForRuntime(packageFixtures(), { packageName: "alpha" })).toMatchObject({
      id: "pkg-1",
      name: "alpha",
    });
  });

  it("requires a matching package id", () => {
    expect(() => selectAmbientCliPackageForRuntime(packageFixtures(), { packageId: "missing" })).toThrow(
      "Ambient CLI package \"missing\" was not found.",
    );
  });

  it("requires a unique package name", () => {
    expect(() => selectAmbientCliPackageForRuntime(packageFixtures(), { packageName: "beta" })).toThrow(
      "Ambient CLI package name \"beta\" matched multiple packages. Specify packageId.",
    );
  });

  it("requires a matching package name", () => {
    expect(() => selectAmbientCliPackageForRuntime(packageFixtures(), { packageName: "missing" })).toThrow(
      "Ambient CLI package \"missing\" was not found.",
    );
  });

  it("requires an id or name selector", () => {
    expect(() => selectAmbientCliPackageForRuntime(packageFixtures(), {})).toThrow("packageId or packageName is required.");
  });
});

function packageFixtures(): any[] {
  return [
    packageFixture({ id: "pkg-1", name: "alpha" }),
    packageFixture({ id: "pkg-2", name: "beta" }),
    packageFixture({ id: "pkg-3", name: "beta" }),
  ];
}

function packageFixture(overrides: Record<string, unknown>): any {
  return {
    id: "pkg",
    name: "package",
    rootPath: "/workspace/.ambient/cli-packages/package",
    source: "local",
    installed: true,
    skills: [],
    commands: [],
    envRequirements: [],
    errors: [],
    ...overrides,
  };
}
