import { delay, evaluate, waitFor } from "./e2e-electron-smoke-cdp-helpers.mjs";

export function selectorTextIncludesPredicate(selector, text) {
  return new Function(
    `return document.querySelector(${JSON.stringify(selector)})?.textContent?.includes(${JSON.stringify(text)}) === true;`,
  );
}

export async function expectText(cdp, text) {
  const found = await evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(text)})`);
  if (!found) throw new Error(`Expected page text to contain: ${text}`);
}

export async function assertNoHorizontalOverflow(cdp, label) {
  const result = await evaluate(
    cdp,
    `
    (() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }))()
  `,
  );
  const maxScrollWidth = Math.max(result.scrollWidth, result.bodyScrollWidth);
  if (maxScrollWidth > result.innerWidth + 1) {
    throw new Error(`${label} has horizontal overflow: ${maxScrollWidth}px > ${result.innerWidth}px.`);
  }
}

export async function captureScreenshot(cdp) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!result.data || result.data.length < 1000) throw new Error("Screenshot capture returned an empty image.");
}

export async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

export async function clickButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")].filter(isVisibleElement);
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found: ${label}`);
}

export async function openProjectBoardSetup(cdp) {
  const alreadyOpen = await evaluate(cdp, `Boolean(document.querySelector(".project-board-workspace"))`);
  if (alreadyOpen) return;
  await clickButton(cdp, "Project Board");
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-workspace")), "project board setup opened");
}

export async function clickProjectBoardTab(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".project-board-tabs button")]
        .find((item) => item.textContent?.trim().startsWith(needle));
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Project board tab not found: ${label}`);
}

export async function clickProjectBoardCard(cdp, title) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const title = ${JSON.stringify(title)};
      const card = [...document.querySelectorAll('.project-board-card[role="button"]')]
        .find((item) => item.textContent?.includes(title) && isVisibleElement(item));
      if (!card) return false;
      card.scrollIntoView({ block: "center", inline: "nearest" });
      card.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Project board card not found: ${title}`);
}

export async function selectProjectBoardMapBlocker(cdp, cardTitle, optionText) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const cardTitle = ${JSON.stringify(cardTitle)};
      const optionText = ${JSON.stringify(optionText)};
      const card = [...document.querySelectorAll(".project-board-map-card")]
        .find((item) => item.textContent?.includes(cardTitle));
      const select = card?.querySelector("select");
      if (!select) return false;
      const option = [...select.options].find((item) => item.textContent?.includes(optionText) && !item.disabled);
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Project board blocker option not found for ${cardTitle}: ${optionText}`);
}

export async function selectProjectBoardSourceKind(cdp, sourceText, kind) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const sourceText = ${JSON.stringify(sourceText)};
      const kind = ${JSON.stringify(kind)};
      const item = [...document.querySelectorAll(".project-board-source-item")]
        .find((node) => node.textContent?.includes(sourceText));
      const select = item?.querySelector("select");
      if (!select) return false;
      const option = [...select.options].find((entry) => entry.value === kind);
      if (!option) return false;
      select.value = kind;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Project board source kind selector not found for ${sourceText}: ${kind}`);
}

export async function clickWorkflowAgentSidebarThread(cdp, title) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(title)};
      const rows = [...document.querySelectorAll(".automation-folder-list .thread-row")].filter(isVisibleElement);
      const row = rows.find((item) => item.textContent?.includes(needle) || item.title?.includes(needle));
      if (!row) return false;
      row.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Workflow Agent sidebar thread not found: ${title}`);
}

export async function clickWorkflowAgentView(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll(".workflow-agent-tabs button")].filter(isVisibleElement);
      const button = buttons.find((item) => item.textContent?.trim() === needle);
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Workflow Agent view tab not found: ${label}`);
}

export async function clickButtonByTitle(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll("button")]
        .find((item) => isVisibleElement(item) && (item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle)));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found by title: ${label}`);
}

export async function clickFileRow(cdp, name) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(name)};
      const row = [...document.querySelectorAll("button.file-row")]
        .find((item) => isVisibleElement(item) && item.textContent?.includes(needle));
      if (!row) return false;
      row.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`File row not found: ${name}`);
}

export async function clickEnabledButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")].filter((item) => !item.disabled && isVisibleElement(item));
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Enabled button not found: ${label}`);
}

export async function clickEnabledButtonIn(cdp, selector, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      if (!root) return false;
      const needle = ${JSON.stringify(label)};
      const buttons = [...root.querySelectorAll("button")].filter((item) => !item.disabled && isVisibleElement(item));
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Enabled button not found in ${selector}: ${label}`);
}

export async function clickEnabledButtonInRow(cdp, selector, rowText, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const selector = ${JSON.stringify(selector)};
      const rowText = ${JSON.stringify(rowText)};
      const label = ${JSON.stringify(label)};
      const root = [...document.querySelectorAll(selector)]
        .find((item) => isVisibleElement(item) && item.innerText.includes(rowText));
      const buttons = [...(root?.querySelectorAll("button") ?? [])].filter((item) => !item.disabled && isVisibleElement(item));
      const button =
        buttons.find((item) => item.textContent?.trim() === label) ??
        buttons.find((item) => item.textContent?.includes(label) || item.title?.includes(label) || item.getAttribute("aria-label")?.includes(label));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Enabled button not found in ${selector} containing ${rowText}: ${label}`);
}

export async function dragKanbanCardToColumn(cdp, cardText, columnTitle) {
  const dragged = await evaluate(
    cdp,
    `
    (() => {
      const cardText = ${JSON.stringify(cardText)};
      const columnTitle = ${JSON.stringify(columnTitle)};
      const source = [...document.querySelectorAll(".task-kanban-card")]
        .find((item) => isVisibleElement(item) && item.textContent?.includes(cardText));
      const column = [...document.querySelectorAll(".task-kanban-column")]
        .find((item) => item.querySelector(".task-kanban-column-header")?.textContent?.includes(columnTitle));
      const target = column?.querySelector(".task-kanban-column-body") ?? column;
      if (!source || !target) return false;
      const dataTransfer = new DataTransfer();
      const eventInit = { bubbles: true, cancelable: true, dataTransfer };
      source.dispatchEvent(new DragEvent("dragstart", eventInit));
      target.dispatchEvent(new DragEvent("dragenter", eventInit));
      target.dispatchEvent(new DragEvent("dragover", eventInit));
      target.dispatchEvent(new DragEvent("drop", eventInit));
      source.dispatchEvent(new DragEvent("dragend", eventInit));
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!dragged) throw new Error(`Kanban drag failed: ${cardText} -> ${columnTitle}`);
}

export async function clickPluginCandidateAction(cdp, pluginName, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const pluginName = ${JSON.stringify(pluginName)};
      const label = ${JSON.stringify(label)};
      const row = [...document.querySelectorAll(".plugin-import-row")]
        .find((item) => item.textContent?.includes(pluginName));
      if (!row) return false;
      const button = [...row.querySelectorAll("button")]
        .find((item) => !item.disabled && item.textContent?.trim() === label);
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Plugin candidate button not found: ${pluginName} / ${label}`);
}

export async function clickGitConfirmButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".git-confirm-dialog button")]
        .find((item) => !item.disabled && item.textContent?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Git confirmation button not found: ${label}`);
}

export async function clickSelector(cdp, selector) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return false;
      target.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Selector not found: ${selector}`);
}

export async function selectBranch(cdp, branch) {
  await clickButton(cdp, "Switch Git branch");
  await waitFor(cdp, () => Boolean(document.querySelector(".git-branch-menu")), "branch menu");
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const branch = ${JSON.stringify(branch)};
      const button = [...document.querySelectorAll(".git-branch-menu button")]
        .find((item) => item.textContent?.trim() === branch);
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Branch selector not found for ${branch}`);
}

export async function clickNthButton(cdp, label, index) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")]
        .filter((item) => item.textContent?.includes(needle) || item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      const button = buttons[${index}];
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found: ${label} at index ${index}`);
}

export async function fillInput(cdp, selector, value) {
  const filled = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!filled) throw new Error(`Input not found: ${selector}`);
}

export async function selectAutomationField(cdp, label, value) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const label = ${JSON.stringify(label)};
      const value = ${JSON.stringify(value)};
      const field = [...document.querySelectorAll(".automation-field")]
        .find((item) => item.querySelector("strong")?.textContent?.trim() === label);
      const select = field?.querySelector("select");
      if (!select) return false;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value === value;
    })()
  `,
  );
  if (!selected) throw new Error(`Automation select not found: ${label}=${value}`);
}

export async function pressComposerKey(cdp, key) {
  const dispatched = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".composer textarea");
      if (!input) return false;
      input.focus();
      input.selectionStart = input.value.length;
      input.selectionEnd = input.value.length;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
      return true;
    })()
  `,
  );
  if (!dispatched) throw new Error(`Unable to dispatch composer key: ${key}`);
}

export async function typeTerminal(cdp, text) {
  const focused = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".terminal-input-row input");
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      return true;
    })()
  `,
  );
  if (!focused) throw new Error("Unable to focus terminal input.");
  await cdp.send("Input.insertText", { text });
}

export async function pressTerminalKey(cdp, key) {
  if (key === "Enter") {
    const clicked = await evaluate(
      cdp,
      `
      (() => {
        const runButton = [...document.querySelectorAll(".terminal-input-row button")]
          .find((button) => button.textContent?.trim() === "Run");
        if (!runButton) return false;
        runButton.click();
        return true;
      })()
    `,
    );
    if (!clicked) throw new Error("Unable to submit terminal input.");
    return;
  }
  const focused = await evaluate(
    cdp,
    `
    (() => {
      const output = document.querySelector(".terminal-output");
      if (!output) return false;
      output.focus();
      return true;
    })()
  `,
  );
  if (!focused) throw new Error(`Unable to focus terminal for key: ${key}`);
  if (key.length === 1) {
    await cdp.send("Input.dispatchKeyEvent", { type: "char", key, text: key, unmodifiedText: key });
    return;
  }
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: key === "Enter" ? 13 : key === "Backspace" ? 8 : key === "Tab" ? 9 : 0,
    nativeVirtualKeyCode: key === "Enter" ? 13 : key === "Backspace" ? 8 : key === "Tab" ? 9 : 0,
  });
}

export async function pasteComposerText(cdp, text) {
  const pasted = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".composer textarea");
      if (!input) return false;
      input.focus();
      const data = new DataTransfer();
      data.setData("text/plain", ${JSON.stringify(text)});
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      return true;
    })()
  `,
  );
  if (!pasted) throw new Error("Unable to dispatch composer paste");
}

export async function assertRightPanelResize(cdp) {
  const before = await evaluate(
    cdp,
    `
    (() => {
      const panel = document.querySelector(".right-panel");
      const handle = document.querySelector(".right-panel-resize-handle");
      if (!panel || !handle) return { ok: false, reason: "missing panel or handle" };
      const panelRect = panel.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      return {
        ok: true,
        width: panelRect.width,
        x: handleRect.left + handleRect.width / 2,
        y: handleRect.top + Math.min(40, handleRect.height / 2),
      };
    })()
  `,
  );
  if (!before.ok) throw new Error(`Right panel resize failed: ${JSON.stringify(before)}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x, y: before.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: before.x, y: before.y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x - 90, y: before.y, button: "left", buttons: 1 });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: before.x - 90,
    y: before.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await delay(120);
  const after = await evaluate(cdp, `document.querySelector(".right-panel")?.getBoundingClientRect().width ?? 0`);
  if (after <= before.width + 40) throw new Error(`Right panel resize failed: ${JSON.stringify({ before: before.width, after })}`);
}

export async function assertSidebarResize(cdp) {
  const result = await evaluate(
    cdp,
    `
    (async () => {
      const sidebar = document.querySelector(".sidebar");
      const handle = document.querySelector(".sidebar-resize-handle");
      if (!sidebar || !handle) return { ok: false, reason: "missing sidebar or handle" };
      const before = sidebar.getBoundingClientRect().width;
      const handleRect = handle.getBoundingClientRect();
      const targetX = Math.min(window.innerWidth - 260, before + 90);
      handle.dispatchEvent(new MouseEvent("mousedown", {
        clientX: handleRect.left + handleRect.width / 2,
        bubbles: true,
        cancelable: true,
      }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: targetX, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: targetX, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const after = sidebar.getBoundingClientRect().width;
      const stored = Number(window.localStorage.getItem("ambient:sidebar-width"));
      return { ok: after > before + 40 && Math.abs(after - stored) <= 1, before, after, stored };
    })()
  `,
  );
  if (!result.ok) throw new Error(`Sidebar resize failed: ${JSON.stringify(result)}`);
}

export async function assertFilePaneResize(cdp) {
  const result = await evaluate(
    cdp,
    `
    (async () => {
      const tree = document.querySelector(".file-tree");
      const handle = document.querySelector(".file-pane-resize-handle");
      if (!tree || !handle) return { ok: false, reason: "missing file tree or handle" };
      const before = tree.getBoundingClientRect().width;
      const x = handle.getBoundingClientRect().left;
      handle.dispatchEvent(new MouseEvent("mousedown", { clientX: x, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: x + 80, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: x + 80, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const after = tree.getBoundingClientRect().width;
      return { ok: after > before + 40, before, after };
    })()
  `,
  );
  if (!result.ok) throw new Error(`File pane resize failed: ${JSON.stringify(result)}`);
}
