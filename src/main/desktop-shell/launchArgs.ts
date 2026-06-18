import {
  parseAmbientFeatureFlagLaunchArgs,
  type ParsedAmbientFeatureFlagLaunchArgs,
} from "../../shared/featureFlags";

export interface AmbientLaunchArgsSnapshot {
  featureFlags: ParsedAmbientFeatureFlagLaunchArgs;
}

export function parseAmbientLaunchArgs(args: readonly string[]): AmbientLaunchArgsSnapshot {
  return {
    featureFlags: parseAmbientFeatureFlagLaunchArgs(args),
  };
}
