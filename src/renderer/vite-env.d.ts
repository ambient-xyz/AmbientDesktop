/// <reference types="vite/client" />

import type { AmbientDesktopApi } from "../shared/types";

interface ImportMetaEnv {
  readonly AMBIENT_LEGACY_WORKFLOW_COMPILER?: string;
}

declare global {
  interface Window {
    ambientDesktop: AmbientDesktopApi;
  }
}
