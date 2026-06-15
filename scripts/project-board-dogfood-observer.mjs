export function shouldUseSqliteObserverFallback(error, board, options = {}) {
  const env = options.env ?? process.env;
  if (env.AMBIENT_PROJECT_BOARD_DOGFOOD_SQLITE_FALLBACK_ON_CDP_FAILURE === "0") return false;
  if (!board || !Array.isArray(board.cards) || !Array.isArray(board.synthesisRuns)) return false;
  if (board.cards.length === 0 && board.synthesisRuns.length === 0) return false;
  return isCdpObserverFailure(error);
}

export function isCdpObserverFailure(error, outputText = "") {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return /(CDP|Runtime\.evaluate|websocket|Render frame was disposed|WebFrameMain|frame was disposed)/i.test(
    `${message}\n${outputText}`,
  );
}
