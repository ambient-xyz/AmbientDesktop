import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          bootstrap: resolve(rootDir, "src/main/desktop-shell/bootstrap.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs",
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    define: {
      "import.meta.env.AMBIENT_LEGACY_WORKFLOW_COMPILER": JSON.stringify(process.env.AMBIENT_LEGACY_WORKFLOW_COMPILER ?? ""),
    },
  },
});
