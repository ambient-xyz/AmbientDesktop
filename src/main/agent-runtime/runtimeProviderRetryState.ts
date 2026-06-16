export interface RuntimeProviderRetrySnapshot {
  providerRetryAttemptCount: number;
  providerRetryLastError?: string | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
}

export interface RuntimeProviderRetryState {
  providerRetryAttemptCount: () => number;
  setProviderRetryAttemptCount: (value: number) => void;
  providerRetryLastError: () => string | undefined;
  setProviderRetryLastError: (value: string | undefined) => void;
  providerRetryBeforeVisibleOutput: () => boolean;
  setProviderRetryBeforeVisibleOutput: (value: boolean) => void;
  providerRetryRecovered: () => boolean;
  setProviderRetryRecovered: (value: boolean) => void;
  snapshot: () => RuntimeProviderRetrySnapshot;
}

export function createRuntimeProviderRetryState(): RuntimeProviderRetryState {
  let providerRetryAttemptCount = 0;
  let providerRetryLastError: string | undefined;
  let providerRetryBeforeVisibleOutput = false;
  let providerRetryRecovered = false;

  return {
    providerRetryAttemptCount: () => providerRetryAttemptCount,
    setProviderRetryAttemptCount: (value) => {
      providerRetryAttemptCount = value;
    },
    providerRetryLastError: () => providerRetryLastError,
    setProviderRetryLastError: (value) => {
      providerRetryLastError = value;
    },
    providerRetryBeforeVisibleOutput: () => providerRetryBeforeVisibleOutput,
    setProviderRetryBeforeVisibleOutput: (value) => {
      providerRetryBeforeVisibleOutput = value;
    },
    providerRetryRecovered: () => providerRetryRecovered,
    setProviderRetryRecovered: (value) => {
      providerRetryRecovered = value;
    },
    snapshot: () => ({
      providerRetryAttemptCount,
      providerRetryLastError,
      providerRetryBeforeVisibleOutput,
      providerRetryRecovered,
    }),
  };
}
