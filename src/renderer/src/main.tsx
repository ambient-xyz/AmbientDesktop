import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/oswald/600.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyStoredAppearanceHint } from "./appearance";
import "./styles.css";

function stringifyRendererError(input: unknown): string {
  if (input instanceof Error) return input.stack ?? input.message;
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function installRendererDiagnostics(): void {
  const originalPerformanceMeasure = window.performance?.measure?.bind(window.performance);
  if (originalPerformanceMeasure) {
    try {
      window.performance.measure = ((measureName: string, startOrMeasureOptions?: string | PerformanceMeasureOptions, endMark?: string) => {
        try {
          return originalPerformanceMeasure(measureName, startOrMeasureOptions as PerformanceMeasureOptions, endMark);
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "DataCloneError" &&
            startOrMeasureOptions &&
            typeof startOrMeasureOptions === "object"
          ) {
            return originalPerformanceMeasure(measureName, {
              start: startOrMeasureOptions.start,
              end: startOrMeasureOptions.end,
              duration: startOrMeasureOptions.duration,
            });
          }
          throw error;
        }
      }) as Performance["measure"];
    } catch {
      // Some runtimes may expose performance.measure as read-only; diagnostics should not block startup.
    }
  }

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const hasUpdateDepthWarning = args.some((arg) => typeof arg === "string" && arg.includes("Maximum update depth exceeded"));
    if (hasUpdateDepthWarning) {
      originalConsoleError(...args, "[renderer:update-depth-callsite]", new Error().stack);
      return;
    }
    originalConsoleError(...args);
  };

  window.addEventListener("error", (event) => {
    console.error(
      "[renderer:uncaught-error]",
      event.message,
      `${event.filename}:${event.lineno}:${event.colno}`,
      stringifyRendererError(event.error),
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[renderer:unhandled-rejection]", stringifyRendererError(event.reason));
  });
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error; errorText?: string }> {
  state: { error?: Error; errorText?: string } = {};

  static getDerivedStateFromError(error: Error): { error: Error; errorText: string } {
    return { error, errorText: stringifyRendererError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[renderer:react-error-boundary]", stringifyRendererError(error), info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 32,
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#f8fafc",
          color: "#111827",
        }}
      >
        <section
          style={{
            maxWidth: 920,
            margin: "10vh auto 0",
            border: "1px solid #d8dee7",
            borderRadius: 8,
            background: "#ffffff",
            padding: 24,
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Ambient renderer crashed</h1>
          <p style={{ margin: "0 0 18px", color: "#4b5563", lineHeight: 1.45 }}>
            The desktop shell is still running, but the UI hit an unrecoverable renderer error. The error details were
            written to the app log.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              background: "#ffffff",
              color: "#111827",
              font: "inherit",
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            Reload window
          </button>
          <pre
            style={{
              marginTop: 18,
              maxHeight: 300,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: 12,
              background: "#f9fafb",
              color: "#374151",
              fontSize: 12,
            }}
          >
            {this.state.errorText}
          </pre>
        </section>
      </main>
    );
  }
}

applyStoredAppearanceHint();
installRendererDiagnostics();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
