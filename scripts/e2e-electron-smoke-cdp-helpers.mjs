import { createServer } from "node:net";

export async function findOpenPort(startPort) {
  for (let candidate = startPort; candidate < startPort + 100; candidate += 1) {
    if (await canListenOnPort(candidate)) return candidate;
  }
  throw new Error(`Unable to find an open CDP port starting at ${startPort}.`);
}

export function canListenOnPort(candidate) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port: candidate }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function waitForTarget(cdpPort) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.webSocketDebuggerUrl && item.type === "page") ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for Electron CDP target.");
}

export async function waitForMiniWindowTarget(cdpPort, title) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const targets = await listCdpTargets(cdpPort);
    const target = targets.find((item) => item.type === "page" && item.title === title && item.url.startsWith("data:text/html"));
    if (target) {
      await delay(500);
      const stableTargets = await listCdpTargets(cdpPort);
      const stable = stableTargets.find((item) => item.id === target.id && item.title === title);
      if (stable) return;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for thread mini window target titled ${title}.`);
}

export async function listCdpTargets(cdpPort) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  return response.json();
}

export async function waitForCdpPortClosed(cdpPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    } catch {
      return;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for CDP port ${cdpPort} to close.`);
}

export function waitForProcessExit(proc, timeoutMs) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return Promise.race([new Promise((resolve) => proc.once("exit", resolve)), delay(timeoutMs)]);
}

export function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const api = {
      debugContext: "",
      send(method, params = {}) {
        const id = nextId++;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((innerResolve, innerReject) => {
          pending.set(id, { resolve: innerResolve, reject: innerReject });
          setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            const context = api.debugContext ? ` (${api.debugContext})` : "";
            innerReject(new Error(`Timed out waiting for CDP ${method}${context}.`));
          }, 15_000);
        });
      },
      close() {
        socket.close();
      },
    };
    socket.addEventListener("open", () => {
      resolve(api);
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed.")));
  });
}

export async function evaluate(cdp, expression) {
  const previousContext = cdp.debugContext;
  cdp.debugContext = expression.replace(/\s+/g, " ").slice(0, 220);
  const result = await cdp
    .send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    .finally(() => {
      cdp.debugContext = previousContext;
    });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

export async function waitFor(cdp, predicate, label, timeoutMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await approveOutsideWorkspacePrompt(cdp);
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

export async function approveOutsideWorkspacePrompt(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      if (!document.body.innerText.includes("Allow outside-workspace")) return false;
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Allow once");
      button?.click();
      return Boolean(button);
    })()
  `,
  ).catch(() => false);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
