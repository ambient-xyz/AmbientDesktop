import type { MiniCpmVisionDiagnosticItem } from "../../shared/types";

export function MiniCpmVisionDiagnosticsList({
  diagnostics,
  compact = false,
}: {
  diagnostics: readonly MiniCpmVisionDiagnosticItem[];
  compact?: boolean;
}) {
  if (!diagnostics.length) return null;
  return (
    <div className={`voice-provider-diagnostics ${diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "error" : "warning"}`}>
      {!compact && <strong>MiniCPM-V diagnostics</strong>}
      {diagnostics.map((diagnostic) => (
        <div key={diagnostic.code} className="voice-provider-cache-activity">
          <small>
            {diagnostic.title} · {diagnostic.code}
          </small>
          {!compact && <small>{diagnostic.detail}</small>}
          <small>{diagnostic.nextAction}</small>
        </div>
      ))}
    </div>
  );
}
