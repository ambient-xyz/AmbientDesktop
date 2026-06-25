import net from "node:net";

export async function invoke(cdp, method, input) {
  const args = input === undefined ? "()" : `(${JSON.stringify(input)})`;
  return evaluate(cdp, `window.ambientDesktop.${method}${args}`);
}

export async function invokeDetached(cdp, method, input, errorSlot) {
  const args = input === undefined ? "()" : `(${JSON.stringify(input)})`;
  const slot = JSON.stringify(errorSlot);
  return evaluate(
    cdp,
    [
      `window[${slot}] = null;`,
      `Promise.resolve(window.ambientDesktop.${method}${args}).catch((error) => {`,
      `window[${slot}] = String(error && error.message ? error.message : error);`,
      "});",
      "true;",
    ].join(""),
  );
}

export async function clickButton(cdp, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clicked = await evaluate(
      cdp,
      `(() => {
        const label = ${JSON.stringify(label)}.toLowerCase();
        const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.toLowerCase().includes(label) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (clicked) return;
    await delay(250);
  }
  const buttons = await evaluate(
    cdp,
    `[...document.querySelectorAll("button")].map((item) => item.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30)`,
  ).catch(() => []);
  throw new Error(`Could not find button: ${label}. Buttons: ${buttons.join(" | ")}`);
}

export async function openProjectBoardSetup(cdp) {
  const alreadyOpen = await evaluate(cdp, `Boolean(document.querySelector(".project-board-workspace"))`);
  if (alreadyOpen) return;
  await clickButton(cdp, "Project Board");
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-workspace")), "project board setup opened");
}

export async function clickProjectBoardReviewTab(cdp, timeoutMs = 15_000) {
  const labels = ["PM Review", "Decisions"];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const clicked = await evaluate(
        cdp,
        `(() => {
          const label = ${JSON.stringify(label)}.toLowerCase();
          const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.toLowerCase().includes(label) && !item.disabled);
          if (!button) return false;
          button.click();
          return true;
        })()`,
      );
      if (clicked) return;
    }
    await delay(250);
  }
  const buttons = await evaluate(
    cdp,
    `[...document.querySelectorAll("button")].map((item) => item.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30)`,
  ).catch(() => []);
  throw new Error(`Could not find project board review tab (${labels.join(" / ")}). Buttons: ${buttons.join(" | ")}`);
}

export async function clickButtonIn(cdp, selector, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clicked = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        if (!root) return false;
        const label = ${JSON.stringify(label)}.toLowerCase();
        const button = [...root.querySelectorAll("button")].find((item) => item.textContent?.toLowerCase().includes(label) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (clicked) return;
    await delay(250);
  }
  const buttons = await evaluate(
    cdp,
    `(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      return root ? [...root.querySelectorAll("button")].map((item) => item.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 30) : [];
    })()`,
  ).catch(() => []);
  throw new Error(`Could not find button ${label} inside ${selector}. Buttons: ${buttons.join(" | ")}`);
}

export async function selectSourceInReview(cdp, sourceKeys, timeoutMs = 15_000) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const selected = await evaluate(
      cdp,
      `(() => {
        const keys = ${JSON.stringify(keys)};
        const review = document.querySelector(".project-board-source-review");
        if (!review) return false;
        const article = [...review.querySelectorAll(".project-board-source-item")].find((item) => keys.some((key) => item.innerText.includes(key)));
        if (!article) return false;
        article.click();
        return true;
      })()`,
    );
    if (selected) return;
    await delay(250);
  }
  const sources = await evaluate(
    cdp,
    `(() => {
      const review = document.querySelector(".project-board-source-review");
      return review ? [...review.querySelectorAll(".project-board-source-item")].map((item) => item.innerText.replace(/\\s+/g, " ").trim()).slice(0, 12) : [];
    })()`,
  ).catch(() => []);
  throw new Error(`Could not select source ${keys.join(" / ")}. Source Review items: ${sources.join(" | ")}`);
}

export async function setSourceKindFromUi(cdp, sourceKeys, kind, timeoutMs = 15_000) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const updated = await evaluate(
      cdp,
      `(() => {
        const keys = ${JSON.stringify(keys)};
        const kind = ${JSON.stringify(kind)};
        const review = document.querySelector(".project-board-source-review");
        if (!review) return false;
        const article = [...review.querySelectorAll(".project-board-source-item")].find((item) => keys.some((key) => item.innerText.includes(key)));
        const select = article?.querySelector("select");
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        if (setter) setter.call(select, kind);
        else select.value = kind;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        article.click();
        return true;
      })()`,
    );
    if (updated) return;
    await delay(250);
  }
  throw new Error(`Could not reclassify source ${keys.join(" / ")} to ${kind} from Source Review UI.`);
}

export async function readSourceClassificationUiState(cdp, sourceKeys) {
  const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
  return evaluate(
    cdp,
    `(() => {
      const keys = ${JSON.stringify(keys)};
      const review = document.querySelector(".project-board-source-review");
      const article = review ? [...review.querySelectorAll(".project-board-source-item")].find((item) => keys.some((key) => item.innerText.includes(key))) : null;
      const detail = document.querySelector(".project-board-source-detail");
      const refreshButtons = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Refresh Sources"));
      const detailElaborate = detail ? [...detail.querySelectorAll("button")].find((button) => button.textContent?.includes("Elaborate Cards")) : null;
      const refreshTitle = refreshButtons.map((button) => button.getAttribute("title") || "").find(Boolean) || "";
      const refreshTitleIncludesPreservation = refreshButtons.some((button) =>
        /Ignored sources stay visible|User source classifications are preserved/.test(button.getAttribute("title") || "")
      );
      const detailText = detail?.innerText ?? "";
      return {
        sourceReviewVisible: Boolean(article),
        itemText: article?.innerText ?? "",
        detailText,
        selectValue: article?.querySelector("select")?.value ?? null,
        ignoredFilterVisible: Boolean(
          review && [...review.querySelectorAll("button")].some((button) => /Ignored:\\s*[1-9]/.test(button.textContent || ""))
        ),
        refreshTitle,
        refreshTitleIncludesPreservation,
        refreshCopyIncludesPreservation:
          refreshTitleIncludesPreservation ||
          /User reclassified source|Refresh preserves user classifications|Ignored sources stay visible/.test(detailText),
        detailElaborateDisabled: detailElaborate ? detailElaborate.disabled === true : null,
      };
    })()`,
  );
}

export async function fillInput(cdp, selector, value) {
  const filled = await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
  if (!filled) throw new Error(`Could not fill input: ${selector}`);
}

export function selectorTextIncludesPredicate(selector, text) {
  return new Function(
    `return document.querySelector(${JSON.stringify(selector)})?.textContent?.includes(${JSON.stringify(text)}) === true;`,
  );
}

export async function waitForPlanningRunStart(cdp, boardId, previousRunId, label, timeoutMs) {
  return waitForState(
    cdp,
    async () => {
      const detachedError = await readDetachedDogfoodError(cdp);
      if (detachedError) throw new Error(`${label} failed before a planning run started: ${detachedError}`);
      const board = (await readProjectBoardWithSynthesisDetails().catch(() => undefined)) ?? (await currentBoard(cdp));
      const run = latestPlanningSynthesisRunForBoard(board, boardId, previousRunId);
      if (run) return { board, run };
      const latest = latestRunForBoard(board, boardId);
      if (latest && latest.id !== previousRunId && latest.status === "running") return { board, run: latest };
      if (board.cards.length > 0) return { board, run: undefined };
      return undefined;
    },
    label,
    timeoutMs ?? Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PLANNING_START_TIMEOUT_MS || 60_000),
  );
}

export async function waitForState(cdp, read, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

export async function waitFor(cdp, predicate, label, timeoutMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(250);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

export async function waitForTarget(cdpPort) {
  const targetTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_TARGET_TIMEOUT_MS || 0) || 120_000;
  const deadline = Date.now() + targetTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`http://127.0.0.1:${cdpPort}/json/version`, 2_000);
      const target = await response.json();
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron browser CDP endpoint after ${targetTimeoutMs.toLocaleString()}ms.`);
}

export async function waitForPageTarget(cdp) {
  const targetTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_TARGET_TIMEOUT_MS || 0) || 120_000;
  const deadline = Date.now() + targetTimeoutMs;
  while (Date.now() < deadline) {
    const targets = await cdp.send("Target.getTargets").catch(() => ({ targetInfos: [] }));
    const pageTarget =
      targets.targetInfos?.find((item) => item.type === "page" && !item.url.startsWith("devtools://")) ??
      targets.targetInfos?.find((item) => item.type === "page");
    if (pageTarget?.targetId) return pageTarget;
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron page CDP target after ${targetTimeoutMs.toLocaleString()}ms.`);
}

export async function connectCdpWithRetry(url, label) {
  const targetTimeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_TARGET_TIMEOUT_MS || 0) || 120_000;
  const deadline = Date.now() + targetTimeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    let cdp;
    try {
      cdp = await connectCdp(url, { commandTimeoutMs: options.commandTimeoutMs });
      await cdp.send("Target.getTargets");
      return cdp;
    } catch (error) {
      lastError = error;
      cdp?.close();
      await delay(500);
    }
  }
  throw new Error(
    `Timed out connecting to ${label} after ${targetTimeoutMs.toLocaleString()}ms${lastError ? `: ${lastError.message}` : ""}.`,
  );
}

export async function findOpenPort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const selected = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (selected) resolvePromise(selected);
        else reject(new Error("Could not allocate a CDP port."));
      });
    });
    server.on("error", reject);
  });
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function connectCdp(url, options = {}) {
  const commandTimeoutMs = Number(options.commandTimeoutMs || 0) || 120_000;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    let opened = false;
    const rejectPending = (error) => {
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    };
    const send = (method, params = {}, sessionId) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error(`CDP websocket is not open for ${method}.`));
      }
      const id = nextId++;
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      socket.send(JSON.stringify(message));
      return new Promise((innerResolve, innerReject) => {
        pending.set(id, { resolve: innerResolve, reject: innerReject });
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          innerReject(new Error(`Timed out waiting for CDP ${method}.`));
        }, commandTimeoutMs);
      });
    };
    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        send,
        session(sessionId) {
          return {
            send(method, params = {}) {
              return send(method, params, sessionId);
            },
            close() {
              socket.close();
            },
          };
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      const error = new Error("CDP websocket failed.");
      if (!opened) reject(error);
      rejectPending(error);
    });
    socket.addEventListener("close", () => {
      const error = new Error("CDP websocket closed.");
      if (!opened) reject(error);
      rejectPending(error);
    });
  });
}

export function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
