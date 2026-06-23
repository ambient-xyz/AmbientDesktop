export function voiceToolUpdate(toolName: string, text: string): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-voice",
      toolName,
      status: "running",
    },
  };
}
