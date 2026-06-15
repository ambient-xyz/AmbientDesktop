export const WELCOME_ONBOARDING_METADATA_KIND = "ambient-welcome-onboarding";
export const WELCOME_ONBOARDING_SEED_VERSION = 2;

export type WelcomeOnboardingPageKind = "instructions" | "core_setup" | "plugin_setup";

export interface WelcomeOnboardingMessageMetadata extends Record<string, unknown> {
  kind: typeof WELCOME_ONBOARDING_METADATA_KIND;
  version: number;
  pageKind: WelcomeOnboardingPageKind;
  productOwned: true;
}

export function welcomeOnboardingMessageMetadata(pageKind: WelcomeOnboardingPageKind): WelcomeOnboardingMessageMetadata {
  return {
    kind: WELCOME_ONBOARDING_METADATA_KIND,
    version: WELCOME_ONBOARDING_SEED_VERSION,
    pageKind,
    productOwned: true,
  };
}

export function welcomeOnboardingPageKindFromMetadata(metadata: unknown): WelcomeOnboardingPageKind | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const record = metadata as Record<string, unknown>;
  if (record.kind !== WELCOME_ONBOARDING_METADATA_KIND) return undefined;
  if (record.productOwned !== true) return undefined;
  const pageKind = record.pageKind;
  return pageKind === "instructions" || pageKind === "core_setup" || pageKind === "plugin_setup" ? pageKind : undefined;
}

export function isCurrentWelcomeOnboardingMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return (
    record.kind === WELCOME_ONBOARDING_METADATA_KIND &&
    record.productOwned === true &&
    record.version === WELCOME_ONBOARDING_SEED_VERSION &&
    Boolean(welcomeOnboardingPageKindFromMetadata(metadata))
  );
}
