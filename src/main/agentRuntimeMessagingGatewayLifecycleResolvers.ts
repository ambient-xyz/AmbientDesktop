import type {
  MessagingGatewayLifecycleApplyResult,
  MessagingGatewayLifecyclePreview,
} from "../shared/messagingGateway";
import type { MessagingGatewayLifecycleApplyInput } from "./agentRuntimeMessagingGatewayLifecycleApplyTools";
import type { MessagingGatewayLifecyclePreviewInput } from "./agentRuntimeMessagingGatewayLifecyclePreviewTools";

export interface MessagingGatewayLifecycleRunnerLike {
  refreshProviderReadiness(providerId: string): Promise<unknown>;
  previewLifecycle(input: MessagingGatewayLifecyclePreviewInput): MessagingGatewayLifecyclePreview;
  applyLifecycle(input: MessagingGatewayLifecycleApplyInput): Promise<MessagingGatewayLifecycleApplyResult>;
}

export interface MessagingGatewayLifecycleResolvers {
  refreshProviderReadiness: (providerId: string) => Promise<unknown>;
  previewLifecycle: (input: MessagingGatewayLifecyclePreviewInput) => MessagingGatewayLifecyclePreview;
  applyLifecycle: (input: MessagingGatewayLifecycleApplyInput) => Promise<MessagingGatewayLifecycleApplyResult>;
}

export function createMessagingGatewayLifecycleResolvers(
  runner: MessagingGatewayLifecycleRunnerLike,
): MessagingGatewayLifecycleResolvers {
  return {
    refreshProviderReadiness: (providerId) => runner.refreshProviderReadiness(providerId),
    previewLifecycle: (input) => runner.previewLifecycle(input),
    applyLifecycle: (input) => runner.applyLifecycle(input),
  };
}
