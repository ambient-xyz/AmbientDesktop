import { describe, expect, it } from "vitest";

import {
  installRouteToolDescriptor,
  installRouteToolDescriptors,
  piToolFieldsFromDescriptor,
  privilegedActionToolDescriptor,
  privilegedActionToolDescriptors,
  providerCatalogToolDescriptor,
  providerCatalogToolDescriptors,
} from "./desktopToolRegistry";
import {
  installRouteToolDescriptors as focusedInstallRouteToolDescriptors,
  piToolFieldsFromDescriptor as focusedPiToolFieldsFromDescriptor,
  privilegedActionToolDescriptors as focusedPrivilegedActionToolDescriptors,
  providerCatalogToolDescriptors as focusedProviderCatalogToolDescriptors,
} from "./desktopToolRoutingDescriptors";

describe("desktopToolRoutingDescriptors", () => {
  it("keeps the public registry routing descriptor exports wired to the focused module", () => {
    expect(installRouteToolDescriptors).toBe(focusedInstallRouteToolDescriptors);
    expect(providerCatalogToolDescriptors).toBe(focusedProviderCatalogToolDescriptors);
    expect(privilegedActionToolDescriptors).toBe(focusedPrivilegedActionToolDescriptors);
    expect(piToolFieldsFromDescriptor).toBe(focusedPiToolFieldsFromDescriptor);

    expect(installRouteToolDescriptor("ambient_install_route_plan")).toBe(focusedInstallRouteToolDescriptors[0]);
    expect(providerCatalogToolDescriptor("ambient_provider_catalog")).toBe(focusedProviderCatalogToolDescriptors[0]);
    expect(privilegedActionToolDescriptor("ambient_privileged_action_request")).toBe(
      focusedPrivilegedActionToolDescriptors.find((tool) => tool.name === "ambient_privileged_action_request"),
    );
  });
});
