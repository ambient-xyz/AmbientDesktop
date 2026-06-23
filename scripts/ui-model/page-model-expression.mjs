const PAGE_MODEL_EXPRESSION_HEADER = `
    (() => {
      const scenario = `;

const PAGE_MODEL_COLLECTION_SECTION = `;
      const TEXT_TAGS = new Set(["A", "BUTTON", "CODE", "DD", "DT", "H1", "H2", "H3", "H4", "H5", "H6", "INPUT", "KBD", "LABEL", "LI", "OPTION", "P", "PRE", "SELECT", "SMALL", "SPAN", "STRONG", "TEXTAREA"]);
      const INTERACTIVE_SELECTOR = "button,a[href],input,select,textarea,[role='button'],[role='tab'],[role='menuitem'],[role='checkbox'],[role='radio'],[role='switch'],[tabindex]:not([tabindex='-1'])";
      const DIALOG_SELECTOR = "[role='dialog'],.api-dialog,.permission-dialog,.git-confirm-dialog,.git-branch-dialog,.browser-copy-dialog,.media-modal,.command-palette";
      const OVERLAY_SELECTOR = "[role='tooltip'],[role='menu'],[role='listbox'],.info-tooltip-bubble,[class*='popover' i],[class*='dropdown' i],[class*='menu' i]";
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body?.scrollWidth ?? 0,
        documentScrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body?.scrollHeight ?? 0,
      };
      const violations = [];
      const nodeRecords = [];
      const elementToRecord = new Map();
      const visibleElements = [...document.querySelectorAll("body *")]
        .filter((element) => isVisibleElement(element))
        .slice(0, 5000);

      for (const element of visibleElements) {
        const record = describeElement(element);
        elementToRecord.set(element, record);
        nodeRecords.push(record);
      }

      const maxScrollWidth = Math.max(viewport.documentScrollWidth, viewport.bodyScrollWidth);
      if (maxScrollWidth > viewport.width + 1) {
        violations.push({
          type: "page-horizontal-overflow",
          severity: "error",
          selector: "document",
          message: "Document has unintended horizontal overflow.",
          details: { maxScrollWidth, viewportWidth: viewport.width, overflowPx: Math.round(maxScrollWidth - viewport.width) },
        });
      }

      for (const element of visibleElements) {
        const record = elementToRecord.get(element);
        const text = record.text.trim();
        if (text && isTextCandidate(element, record)) {
          const allowed = element.closest("[data-ui-allow-truncation='true'],[data-ui-overflow='clip-intentional']");
          const hasDisclosure = Boolean(record.title || record.ariaLabel || element.getAttribute("aria-describedby") || hasNearbyTextRecovery(element));
          const clippedX = record.overflow.deltaX > 1 && !record.overflow.scrollableX && clips(record.styles.overflowX);
          const clippedY = record.overflow.deltaY > 1 && !record.overflow.scrollableY && clips(record.styles.overflowY);
          if (!allowed && (clippedX || clippedY) && (!hasDisclosure || clippedY)) {
            violations.push({
              type: clippedY ? "text-vertical-clipping" : "text-horizontal-clipping",
              severity: clippedY ? "error" : "warning",
              selector: record.selector,
              message: clippedY ? "Visible text is clipped vertically without an intentional overflow annotation." : "Visible text is clipped horizontally without a disclosure affordance.",
              text: record.text,
              rect: record.rect,
              details: {
                overflow: record.overflow,
                styles: record.styles,
                hasDisclosure,
                allowWith: "Add wrapping/flexible sizing, a disclosure affordance, or data-ui-allow-truncation='true' for intentional truncation.",
              },
            });
          }
        }

        if (element.matches(DIALOG_SELECTOR)) {
          const outside = outsideViewport(record.rect, viewport, 1);
          if (outside) {
            violations.push({
              type: "dialog-outside-viewport",
              severity: "error",
              selector: record.selector,
              message: "Dialog-like element extends outside the viewport.",
              text: record.text,
              rect: record.rect,
              details: outside,
            });
          }
        } else if (element.matches(OVERLAY_SELECTOR)) {
          const outside = outsideViewport(record.rect, viewport, 1);
          if (outside) {
            violations.push({
              type: "overlay-outside-viewport",
              severity: "error",
              selector: record.selector,
              message: "Overlay-like element extends outside the viewport.",
              text: record.text,
              rect: record.rect,
              details: outside,
            });
          }
        }
      }

      for (const violation of findInteractiveOverlaps(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findControlClusterLayoutIssues(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findCompressedControls(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findMissingAccessibleLabels(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findFocusRingIssues(elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findLowContrastText(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findRequiredActionIssues(elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findOffscreenActiveMenuItems(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findStickyHeaderOverlaps(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findUnreachableScrollContent(elementToRecord)) {
        violations.push(violation);
      }

      const alignmentGroups = collectAlignmentGroups();
      for (const group of alignmentGroups) {
        if (group.violations.length > 0) violations.push(...group.violations);
      }

      return {
        scenario,
        page: {
          title: document.title,
          url: location.href,
          textPreview: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1000),
        },
        viewport,
        summary: {
          visibleNodeCount: nodeRecords.length,
          interactiveNodeCount: nodeRecords.filter((node) => node.interactive).length,
          textNodeCount: nodeRecords.filter((node) => node.text).length,
          violationCount: violations.length,
        },
        nodes: nodeRecords,
        alignmentGroups,
        violations,
      };

`;

const PAGE_MODEL_ELEMENT_HELPERS_SECTION = `      function describeElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = elementText(element);
        const role = element.getAttribute("role") || implicitRole(element);
        const record = {
          id: stableNodeId(element),
          selector: selectorFor(element),
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").replace(/\\s+/g, " ").trim().slice(0, 180),
          role,
          ariaLabel: element.getAttribute("aria-label") || "",
          title: element.getAttribute("title") || "",
          text: text.slice(0, 300),
          directText: directText(element).slice(0, 200),
          rect: roundedRect(rect),
          client: { width: element.clientWidth, height: element.clientHeight },
          scroll: { width: element.scrollWidth, height: element.scrollHeight },
          overflow: {
            deltaX: Math.round((element.scrollWidth - element.clientWidth) * 100) / 100,
            deltaY: Math.round((element.scrollHeight - element.clientHeight) * 100) / 100,
            scrollableX: element.scrollWidth > element.clientWidth + 1 && ["auto", "scroll"].includes(style.overflowX),
            scrollableY: element.scrollHeight > element.clientHeight + 1 && ["auto", "scroll"].includes(style.overflowY),
          },
          styles: {
            display: style.display,
            position: style.position,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            whiteSpace: style.whiteSpace,
            textOverflow: style.textOverflow,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
            opacity: style.opacity,
            outlineOffset: style.outlineOffset,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            zIndex: style.zIndex,
          },
          data: {
            allowTruncation: element.closest("[data-ui-allow-truncation='true']") !== null,
            ownAllowTruncation: element.getAttribute("data-ui-allow-truncation") === "true",
            ownAllowCompressedControl: element.getAttribute("data-ui-allow-compressed-control") === "true",
            ownAllowLonelyRow: element.getAttribute("data-ui-allow-lonely-row") === "true",
            ownAllowFragmentedControls: element.getAttribute("data-ui-allow-fragmented-controls") === "true",
            ownAllowSmallTarget: element.getAttribute("data-ui-allow-small-target") === "true",
            ownAllowUnlabeledControl: element.getAttribute("data-ui-allow-unlabeled-control") === "true",
            ownAllowStickyOverlap: element.getAttribute("data-ui-allow-sticky-overlap") === "true",
            ownAllowUnreachableScroll: element.getAttribute("data-ui-allow-unreachable-scroll") === "true",
            alignGroup: element.getAttribute("data-ui-align-group") || "",
            alignAxis: element.getAttribute("data-ui-align-axis") || "",
            overflowIntent: element.getAttribute("data-ui-overflow") || "",
            scrollContainer: element.getAttribute("data-ui-scroll-container") || "",
            stickyGuard: element.getAttribute("data-ui-sticky-guard") || "",
          },
          interactive: element.matches(INTERACTIVE_SELECTOR),
        };
        return record;
      }

      function isVisibleElement(element) {
        if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
        if (element.closest("[hidden],[aria-hidden='true']")) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        return rect.bottom >= -200 && rect.right >= -200 && rect.top <= window.innerHeight + 200 && rect.left <= window.innerWidth + 200;
      }

      function isTextCandidate(element, record) {
        if (record.rect.width < 3 || record.rect.height < 3) return false;
        if (record.text.length > 500) return false;
        if (TEXT_TAGS.has(element.tagName)) return true;
        if (["button", "link", "heading", "tab", "menuitem", "checkbox", "radio", "switch"].includes(record.role)) return true;
        const visibleChildren = [...element.children].filter((child) => isVisibleElement(child));
        return directText(element).trim().length > 0 && visibleChildren.length <= 1;
      }

      function clips(value) {
        return value === "hidden" || value === "clip";
      }

      function hasNearbyTextRecovery(element) {
        const container = element.closest(".project-board-card,.task-row,.workflow-artifact-row,.permission-dialog,.modal,[role='dialog']");
        if (!container) return false;
        return [...container.querySelectorAll("button,a,[role='button']")].some((control) => {
          const label = [
            control.getAttribute("aria-label"),
            control.getAttribute("title"),
            control.textContent,
          ].filter(Boolean).join(" ");
          return /\\b(details?|open|inspect|view|expand|more)\\b/i.test(label);
        });
      }

      function directText(element) {
        return [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.nodeValue || "")
          .join(" ")
          .replace(/\\s+/g, " ")
          .trim();
      }

      function elementText(element) {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          return element.value || element.getAttribute("placeholder") || element.getAttribute("aria-label") || "";
        }
        return (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim();
      }

      function roundedRect(rect) {
        return {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
          top: round(rect.top),
          right: round(rect.right),
          bottom: round(rect.bottom),
          left: round(rect.left),
        };
      }

      function round(value) {
        return Math.round(value * 100) / 100;
      }

      function stableNodeId(element) {
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 5) {
          const label = current.id ? "#" + current.id : current.tagName.toLowerCase() + classSuffix(current);
          parts.unshift(label);
          current = current.parentElement;
        }
        return parts.join(">");
      }

      function selectorFor(element) {
        if (element.id) return "#" + cssEscape(element.id);
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 6) {
          let part = current.tagName.toLowerCase();
          const stableClasses = String(current.className || "")
            .split(/\\s+/)
            .filter((item) => item && !/[0-9a-f]{6,}|css-|^_/i.test(item))
            .slice(0, 2);
          if (stableClasses.length) part += "." + stableClasses.map(cssEscape).join(".");
          const parent = current.parentElement;
          if (parent) {
            const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
          }
          parts.unshift(part);
          current = parent;
        }
        return "body > " + parts.join(" > ");
      }

      function classSuffix(element) {
        const value = String(element.className || "")
          .split(/\\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(".");
        return value ? "." + value : "";
      }

      function cssEscape(value) {
        return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
      }

      function implicitRole(element) {
        const tag = element.tagName;
        if (/^H[1-6]$/.test(tag)) return "heading";
        if (tag === "A" && element.getAttribute("href")) return "link";
        if (tag === "BUTTON") return "button";
        if (tag === "INPUT" || tag === "TEXTAREA") return "textbox";
        if (tag === "SELECT") return "combobox";
        if (tag === "NAV") return "navigation";
        if (tag === "MAIN") return "main";
        return "";
      }

      function outsideViewport(rect, currentViewport, margin) {
        const outside = {
          left: rect.left < margin,
          top: rect.top < margin,
          right: rect.right > currentViewport.width - margin,
          bottom: rect.bottom > currentViewport.height - margin,
        };
        return outside.left || outside.top || outside.right || outside.bottom ? outside : null;
      }

`;

const PAGE_MODEL_LAYOUT_DETECTORS_SECTION = `      function findInteractiveOverlaps(elements, records) {
        const interactive = elements.filter((element) => records.get(element)?.interactive);
        const byParent = new Map();
        for (const element of interactive) {
          const parent = element.parentElement;
          if (!parent) continue;
          if (!byParent.has(parent)) byParent.set(parent, []);
          byParent.get(parent).push(element);
        }
        const overlapViolations = [];
        for (const siblings of byParent.values()) {
          if (siblings.length > 20) continue;
          for (let i = 0; i < siblings.length; i += 1) {
            for (let j = i + 1; j < siblings.length; j += 1) {
              const a = records.get(siblings[i]);
              const b = records.get(siblings[j]);
              if (!a || !b) continue;
              const area = overlapArea(a.rect, b.rect);
              if (area <= 8) continue;
              if (siblings[i].contains(siblings[j]) || siblings[j].contains(siblings[i])) continue;
              overlapViolations.push({
                type: "interactive-overlap",
                severity: "error",
                selector: a.selector,
                relatedSelector: b.selector,
                message: "Interactive controls overlap within the same parent.",
                text: [a.text, b.text].filter(Boolean).join(" / ").slice(0, 240),
                rect: a.rect,
                relatedRect: b.rect,
                details: { overlapArea: area },
              });
            }
          }
        }
        return overlapViolations.slice(0, 50);
      }

      function findControlClusterLayoutIssues(elements, records) {
        const issues = [];
        const parentCandidates = elements.filter((element) => {
          const style = getComputedStyle(element);
          const record = records.get(element);
          if (!record || record.rect.width < 320) return false;
          const className = String(element.className || "");
          const looksLikeCluster = /controls|toolbar|actions|filters|switcher|toggle/i.test(className);
          return (style.display === "flex" || style.display === "inline-flex") && (style.flexWrap !== "nowrap" || looksLikeCluster);
        });
        for (const parent of parentCandidates) {
          const parentRecord = records.get(parent);
          const children = [...parent.children]
            .filter((child) => records.has(child) && isControlClusterItem(child, records.get(child)))
            .filter((child) => !child.closest("[data-ui-ignore-cluster='true']"));
          if (children.length < 4) continue;
          const rows = groupControlRows(children, records);
          if (rows.length <= 1) continue;
          const parentRect = parentRecord.rect;
          const rowSummaries = rows.map((row, index) => {
            const rowLeft = Math.min(...row.map((item) => records.get(item).rect.left));
            const rowRight = Math.max(...row.map((item) => records.get(item).rect.right));
            const rowTop = Math.min(...row.map((item) => records.get(item).rect.top));
            const rowBottom = Math.max(...row.map((item) => records.get(item).rect.bottom));
            return {
              index,
              count: row.length,
              left: round(rowLeft),
              right: round(rowRight),
              top: round(rowTop),
              bottom: round(rowBottom),
              width: round(rowRight - rowLeft),
              fillRatio: round((rowRight - rowLeft) / Math.max(1, parentRect.width)),
              unusedRight: round(parentRect.right - rowRight),
              selectors: row.map((item) => records.get(item).selector),
              texts: row.map((item) => records.get(item).text || records.get(item).ariaLabel || records.get(item).title).filter(Boolean),
            };
          });

          const last = rowSummaries.at(-1);
          if (
            last &&
            last.count === 1 &&
            last.fillRatio < 0.35 &&
            last.unusedRight > Math.min(260, parentRect.width * 0.3) &&
            !parent.closest("[data-ui-allow-lonely-row='true']")
          ) {
            issues.push({
              type: "control-cluster-lonely-row",
              severity: "warning",
              selector: parentRecord.selector,
              relatedSelector: last.selectors[0],
              message: "A wrapped control cluster leaves a single small control alone on the last row.",
              text: last.texts[0] || "",
              rect: parentRect,
              details: {
                rowCount: rows.length,
                lastRow: last,
                parentText: parentRecord.text.slice(0, 240),
                allowWith: "Rebalance controls, move the control to a compact affordance, or annotate the cluster with data-ui-allow-lonely-row='true' if intentional.",
              },
            });
          }

          if (rows.length > 2 && parentRect.width >= 440 && !parent.closest("[data-ui-allow-fragmented-controls='true']")) {
            issues.push({
              type: "control-cluster-fragmented",
              severity: "warning",
              selector: parentRecord.selector,
              message: "A control cluster wraps into more than two visual rows.",
              text: parentRecord.text.slice(0, 240),
              rect: parentRect,
              details: { rowCount: rows.length, rows: rowSummaries },
            });
          }

          for (const row of rowSummaries) {
            if (row.count < 2) continue;
            const heights = rows[row.index].map((item) => records.get(item).rect.height);
            const tops = rows[row.index].map((item) => records.get(item).rect.top);
            const heightDelta = round(Math.max(...heights) - Math.min(...heights));
            const topDelta = round(Math.max(...tops) - Math.min(...tops));
            if (heightDelta > 8 || topDelta > 5) {
              issues.push({
                type: "control-row-alignment-drift",
                severity: "warning",
                selector: parentRecord.selector,
                message: "Controls sharing a row have noticeably different heights or vertical alignment.",
                rect: parentRect,
                details: { row, heightDelta, topDelta },
              });
            }
          }
        }
        return issues.slice(0, 80);
      }

      function isControlClusterItem(element, record) {
        if (!record) return false;
        if (element.matches("button,select,input,textarea,[role='button'],[role='tab'],[role='switch'],[role='checkbox'],[role='radio']")) return true;
        if (/button|select|toggle|control|chip|usage|picker/i.test(record.className)) return true;
        return false;
      }

      function groupControlRows(children, records) {
        const rows = [];
        const sorted = [...children].sort((a, b) => records.get(a).rect.top - records.get(b).rect.top || records.get(a).rect.left - records.get(b).rect.left);
        for (const child of sorted) {
          const rect = records.get(child).rect;
          const center = rect.top + rect.height / 2;
          let row = rows.find((candidate) => Math.abs(candidate.center - center) <= 10);
          if (!row) {
            row = { center, items: [] };
            rows.push(row);
          }
          row.items.push(child);
          row.center = row.items.reduce((sum, item) => {
            const itemRect = records.get(item).rect;
            return sum + itemRect.top + itemRect.height / 2;
          }, 0) / row.items.length;
        }
        return rows.map((row) => row.items.sort((a, b) => records.get(a).rect.left - records.get(b).rect.left));
      }

      function findCompressedControls(elements, records) {
        const issues = [];
        for (const element of elements) {
          const record = records.get(element);
          if (!record) continue;
          if (element.matches("select")) {
            const value = element.options?.[element.selectedIndex]?.textContent?.trim() || element.value || record.text;
            const style = getComputedStyle(element);
            const measured = measureTextWidth(value, style.font);
            const available = Math.max(0, record.rect.width - 28);
            if (value.length >= 12 && measured > available * 1.35 && !element.closest("[data-ui-allow-compressed-control='true']")) {
              issues.push({
                type: "compressed-select-label",
                severity: "warning",
                selector: record.selector,
                message: "A select control is too narrow to show its active value clearly.",
                text: value,
                rect: record.rect,
                details: {
                  measuredTextWidth: round(measured),
                  availableTextWidth: round(available),
                  widthRatio: round(available / Math.max(1, measured)),
                  hasDisclosure: Boolean(record.title || record.ariaLabel),
                  allowWith: "Widen the select, abbreviate the visible label intentionally, or annotate with data-ui-allow-compressed-control='true'.",
                },
              });
            }
          }
          if (record.interactive && !element.closest("[data-ui-allow-small-target='true']")) {
            const isInlineTextLink = element.tagName === "A" && record.rect.height < 24 && record.text.length > 0;
            const minSide = Math.min(record.rect.width, record.rect.height);
            if (!isInlineTextLink && minSide > 0 && minSide < 24) {
              issues.push({
                type: "small-interactive-target",
                severity: "warning",
                selector: record.selector,
                message: "Interactive target is smaller than the minimum practical hit area.",
                text: record.text || record.ariaLabel || record.title,
                rect: record.rect,
                details: { minSide, recommendedMinSide: 24 },
              });
            }
          }
        }
        return issues.slice(0, 80);
      }

      function findMissingAccessibleLabels(elements, records) {
        const issues = [];
        for (const element of elements) {
          const record = records.get(element);
          if (!record?.interactive) continue;
          if (!needsExplicitAccessibleName(element, record)) continue;
          if (accessibleNameFor(element, record)) continue;
          issues.push({
            type: "missing-accessible-label",
            severity: "warning",
            selector: record.selector,
            message: "Icon-only interactive control does not expose an accessible name.",
            rect: record.rect,
            details: {
              role: record.role,
              tag: record.tag,
              className: record.className,
              allowWith: "Add visible text, aria-label, aria-labelledby, a title, or an associated label.",
            },
          });
        }
        return issues.slice(0, 80);
      }

      function findFocusRingIssues(records) {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement || active instanceof SVGElement)) return [];
        if (active === document.body || active === document.documentElement) return [];
        if (!isVisibleElement(active)) return [];

        const record = records.get(active) || describeElement(active);
        const style = getComputedStyle(active);
        const outlineWidth = parseCssPixels(style.outlineWidth);
        const outlineOffset = parseCssPixels(style.outlineOffset);
        const shadowSpread = maxBoxShadowExtent(style.boxShadow);
        const hasIndicator =
          (outlineWidth > 0 && style.outlineStyle !== "none") ||
          shadowSpread > 0 ||
          style.outlineStyle === "auto";
        if (!hasIndicator) return [];

        const focusMargin = Math.max(2, outlineWidth + Math.abs(outlineOffset), shadowSpread);
        const focusRect = expandRect(record.rect, focusMargin);
        const viewportClip = outsideViewport(focusRect, viewport, 0);
        if (viewportClip) {
          return [
            {
              type: "focus-ring-clipped",
              severity: "warning",
              selector: record.selector,
              message: "Focused control's visible focus indicator extends outside the viewport.",
              text: record.text || record.ariaLabel || record.title,
              rect: record.rect,
              details: {
                focusRect,
                focusMargin: round(focusMargin),
                clip: viewportClip,
                styles: {
                  outlineWidth: style.outlineWidth,
                  outlineOffset: style.outlineOffset,
                  outlineStyle: style.outlineStyle,
                  boxShadow: style.boxShadow,
                },
              },
            },
          ];
        }

        for (let ancestor = active.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (!clips(ancestorStyle.overflowX) && !clips(ancestorStyle.overflowY)) continue;
          const ancestorRecord = records.get(ancestor) || describeElement(ancestor);
          const clip = rectClipDelta(focusRect, ancestorRecord.rect, ancestorStyle);
          if (!clip) continue;
          return [
            {
              type: "focus-ring-clipped",
              severity: "warning",
              selector: record.selector,
              relatedSelector: ancestorRecord.selector,
              message: "Focused control's visible focus indicator is clipped by an overflow container.",
              text: record.text || record.ariaLabel || record.title,
              rect: record.rect,
              relatedRect: ancestorRecord.rect,
              details: {
                focusRect,
                focusMargin: round(focusMargin),
                clip,
                overflow: {
                  x: ancestorStyle.overflowX,
                  y: ancestorStyle.overflowY,
                },
                styles: {
                  outlineWidth: style.outlineWidth,
                  outlineOffset: style.outlineOffset,
                  outlineStyle: style.outlineStyle,
                  boxShadow: style.boxShadow,
                },
              },
            },
          ];
        }

        return [];
      }

`;

const PAGE_MODEL_CONTRAST_DETECTORS_SECTION = `      function findLowContrastText(elements, records) {
        const issues = [];
        for (const element of elements) {
          const record = records.get(element);
          if (!record) continue;
          if (element.closest("[data-ui-allow-low-contrast='true']")) continue;
          if (!isTextContrastCandidate(element, record)) continue;
          const text = contrastTextFor(element, record);
          if (!text) continue;

          const style = getComputedStyle(element);
          const foreground = parseCssColor(style.color);
          if (!foreground) continue;
          const background = effectiveBackgroundColor(element);
          if (!background) continue;

          const foregroundAlpha = clamp01(foreground.a * effectiveOpacity(element));
          const foregroundOnBackground = blendColors({ ...foreground, a: foregroundAlpha }, background);
          const ratio = contrastRatio(foregroundOnBackground, background);
          const fontSize = parseCssPixels(style.fontSize);
          const fontWeight = parseFontWeight(style.fontWeight);
          const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
          const disabled = element.matches(":disabled,[aria-disabled='true']") || Boolean(element.closest("[aria-disabled='true']"));
          const threshold = disabled ? 3 : largeText ? 3 : 4.5;
          if (ratio >= threshold) continue;

          issues.push({
            type: "low-contrast-text",
            severity: ratio < 3 ? "error" : "warning",
            selector: record.selector,
            message: "Visible text has insufficient contrast against its effective background.",
            text,
            rect: record.rect,
            details: {
              contrastRatio: round(ratio),
              requiredRatio: threshold,
              color: style.color,
              effectiveTextColor: colorToString(foregroundOnBackground),
              effectiveBackgroundColor: colorToString(background),
              backgroundColor: style.backgroundColor,
              backgroundImage: style.backgroundImage === "none" ? "" : style.backgroundImage.slice(0, 160),
              opacity: round(effectiveOpacity(element)),
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              largeText,
              disabled,
              allowWith: "Adjust semantic foreground/background tokens or annotate intentionally decorative text with data-ui-allow-low-contrast='true'.",
            },
          });
        }
        return issues.slice(0, 120);
      }

      function isTextContrastCandidate(element, record) {
        if (!isTextCandidate(element, record)) return false;
        if (record.rect.width < 3 || record.rect.height < 3) return false;
        if (record.text.length > 500) return false;
        if (element.matches("svg,canvas,img,video")) return false;
        if (element.closest("svg")) return false;
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
        if (record.directText.trim().length > 0) return true;
        if (element.children.length === 0 && record.text.trim().length > 0) return true;
        if (record.interactive && record.text.trim().length > 0 && [...element.children].filter((child) => isVisibleElement(child)).length <= 1) return true;
        return false;
      }

      function contrastTextFor(element, record) {
        const text = (
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? record.text
            : record.directText || (element.children.length === 0 ? record.text : record.interactive ? record.text : "")
        ).replace(/\\s+/g, " ").trim();
        if (!text) return "";
        if (text.length === 1 && !record.interactive) return "";
        return text.slice(0, 240);
      }

      function effectiveBackgroundColor(element) {
        const fallback = document.documentElement.dataset.theme === "dark"
          ? { r: 15, g: 20, b: 24, a: 1 }
          : { r: 255, g: 255, b: 255, a: 1 };
        const ancestors = [];
        for (let current = element; current && current instanceof Element; current = current.parentElement) {
          ancestors.push(current);
        }
        let background = fallback;
        for (const current of ancestors.reverse()) {
          const parsed = parseCssColor(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.a > 0) background = blendColors(parsed, background);
        }
        return { ...background, a: 1 };
      }

      function effectiveOpacity(element) {
        let opacity = 1;
        for (let current = element; current && current instanceof Element; current = current.parentElement) {
          const parsed = Number.parseFloat(getComputedStyle(current).opacity);
          if (Number.isFinite(parsed)) opacity *= clamp01(parsed);
        }
        return opacity;
      }

      function parseCssColor(value) {
        if (!value || value === "transparent") return null;
        const srgbMatch = String(value).match(/^color\\(\\s*srgb\\s+(.+)\\)$/i);
        if (srgbMatch) {
          const numbers = srgbMatch[1].match(/-?\\d*\\.?\\d+(?:e-?\\d+)?/gi)?.map(Number) ?? [];
          if (numbers.length < 3) return null;
          return {
            r: clamp255(numbers[0] * 255),
            g: clamp255(numbers[1] * 255),
            b: clamp255(numbers[2] * 255),
            a: clamp01(numbers.length >= 4 ? numbers[3] : 1),
          };
        }
        const numbers = String(value).match(/-?\\d*\\.?\\d+/g)?.map(Number) ?? [];
        if (numbers.length < 3) return null;
        return {
          r: clamp255(numbers[0]),
          g: clamp255(numbers[1]),
          b: clamp255(numbers[2]),
          a: clamp01(numbers.length >= 4 ? numbers[3] : 1),
        };
      }

      function blendColors(foreground, background) {
        const alpha = clamp01(foreground.a);
        const inverse = 1 - alpha;
        return {
          r: foreground.r * alpha + background.r * inverse,
          g: foreground.g * alpha + background.g * inverse,
          b: foreground.b * alpha + background.b * inverse,
          a: 1,
        };
      }

      function contrastRatio(foreground, background) {
        const fg = relativeLuminance(foreground);
        const bg = relativeLuminance(background);
        const lighter = Math.max(fg, bg);
        const darker = Math.min(fg, bg);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function relativeLuminance(color) {
        const values = [color.r, color.g, color.b].map((channel) => {
          const value = clamp255(channel) / 255;
          return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        });
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      }

      function parseFontWeight(value) {
        if (value === "bold") return 700;
        if (value === "normal") return 400;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : 400;
      }

      function colorToString(color) {
        return "rgb(" + Math.round(color.r) + ", " + Math.round(color.g) + ", " + Math.round(color.b) + ")";
      }

      function clamp01(value) {
        if (!Number.isFinite(value)) return 1;
        return Math.min(1, Math.max(0, value));
      }

      function clamp255(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.min(255, Math.max(0, value));
      }

`;

const PAGE_MODEL_VISIBILITY_DETECTORS_SECTION = `      function findRequiredActionIssues(records) {
        const issues = [];
        for (const element of document.querySelectorAll("[data-ui-required-action]")) {
          if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
          const requiredAction = element.getAttribute("data-ui-required-action") || "";
          const hiddenReason = hiddenElementReason(element);
          const record = records.get(element) || describeElement(element);
          if (hiddenReason) {
            issues.push({
              type: "required-action-hidden",
              severity: "error",
              selector: record.selector,
              message: "Required action is present in the active UI state but is hidden or has no usable box.",
              text: record.text || record.ariaLabel || record.title || requiredAction,
              rect: record.rect,
              details: { requiredAction, hiddenReason },
            });
            continue;
          }

          const outside = outsideViewport(record.rect, viewport, 1);
          const clipInfo = firstClippingAncestorClip(element, record.rect, records, true);
          if (!outside && !clipInfo) continue;
          issues.push({
            type: "required-action-hidden",
            severity: "error",
            selector: record.selector,
            relatedSelector: clipInfo?.ancestor.selector,
            message: outside ? "Required action extends outside the viewport." : "Required action is clipped by a scroll or overflow container.",
            text: record.text || record.ariaLabel || record.title || requiredAction,
            rect: record.rect,
            relatedRect: clipInfo?.ancestor.rect,
            details: { requiredAction, outside, clip: clipInfo?.clip, overflow: clipInfo?.overflow },
          });
        }
        return issues.slice(0, 80);
      }

      function findOffscreenActiveMenuItems(elements, records) {
        const issues = [];
        const menuSelector = "[role='menu'],[role='listbox'],[role='tree'],.command-list,.model-picker-menu,.project-board-plan-picker";
        const activeSelector = "[aria-selected='true'],[aria-current='true'],.selected,.active";
        for (const menu of elements.filter((element) => element.matches(menuSelector))) {
          const menuRecord = records.get(menu);
          if (!menuRecord) continue;
          for (const active of menu.querySelectorAll(activeSelector)) {
            if (!(active instanceof HTMLElement || active instanceof SVGElement)) continue;
            if (active === menu || !isActiveMenuCandidate(active)) continue;
            const record = records.get(active) || describeElement(active);
            const outside = outsideViewport(record.rect, viewport, 0);
            const clipInfo = firstClippingAncestorClip(active, record.rect, records, true);
            if (!outside && !clipInfo) continue;
            issues.push({
              type: "offscreen-active-menu-item",
              severity: "warning",
              selector: record.selector,
              relatedSelector: clipInfo?.ancestor.selector || menuRecord.selector,
              message: outside ? "Selected menu or listbox item extends outside the viewport." : "Selected menu or listbox item is clipped by its scroll container.",
              text: record.text || record.ariaLabel || record.title,
              rect: record.rect,
              relatedRect: clipInfo?.ancestor.rect || menuRecord.rect,
              details: {
                outside,
                clip: clipInfo?.clip,
                overflow: clipInfo?.overflow,
                menuSelector: menuRecord.selector,
              },
            });
          }
        }
        return issues.slice(0, 80);
      }

      function isActiveMenuCandidate(element) {
        if (element.matches("[role='option'],[role='menuitem'],[role='treeitem'],button,a[href]")) return true;
        return /command-row|picker-option|menuitem|option/i.test(String(element.className || ""));
      }

      function findStickyHeaderOverlaps(elements, records) {
        const issues = [];
        const stickySources = elements.filter((element) => {
          const record = records.get(element);
          if (!record) return false;
          if (record.rect.width < 32 || record.rect.height < 16) return false;
          if (element.closest("[data-ui-allow-sticky-overlap='true']")) return false;
          if (record.styles.position !== "sticky" && record.styles.position !== "fixed") return false;
          return isStickyOverlapSource(element, record);
        });
        const targets = elements.filter((element) => {
          const record = records.get(element);
          if (!record) return false;
          if (record.rect.width < 4 || record.rect.height < 4) return false;
          if (element.closest("[data-ui-allow-sticky-overlap='true']")) return false;
          return isStickyOverlapTarget(element, record);
        });

        for (const sticky of stickySources) {
          const stickyRecord = records.get(sticky);
          const stickyZ = zIndexValue(stickyRecord);
          for (const target of targets) {
            if (sticky === target || sticky.contains(target) || target.contains(sticky)) continue;
            const targetRecord = records.get(target);
            if (!targetRecord) continue;
            if (stickyRecord.selector === targetRecord.selector) continue;
            if (!stickyDominatesTarget(stickyRecord, stickyZ, targetRecord)) continue;
            const area = overlapArea(stickyRecord.rect, targetRecord.rect);
            if (area <= 24) continue;
            const targetArea = Math.max(1, targetRecord.rect.width * targetRecord.rect.height);
            const coverage = round(area / targetArea);
            const centerCovered = pointInsideRect(
              { x: targetRecord.rect.left + targetRecord.rect.width / 2, y: targetRecord.rect.top + targetRecord.rect.height / 2 },
              stickyRecord.rect,
            );
            if (!centerCovered && coverage < 0.45 && area < 220) continue;
            issues.push({
              type: "sticky-header-overlap",
              severity: "error",
              selector: stickyRecord.selector,
              relatedSelector: targetRecord.selector,
              message: "Sticky or fixed header-like surface overlaps visible content or controls.",
              text: [stickyRecord.text || stickyRecord.ariaLabel || stickyRecord.title, targetRecord.text || targetRecord.ariaLabel || targetRecord.title].filter(Boolean).join(" / ").slice(0, 240),
              rect: stickyRecord.rect,
              relatedRect: targetRecord.rect,
              details: {
                overlapArea: area,
                targetCoverage: coverage,
                centerCovered,
                sourcePosition: stickyRecord.styles.position,
                sourceZIndex: stickyRecord.styles.zIndex,
                targetZIndex: targetRecord.styles.zIndex,
                allowWith: "Reserve layout space, lower the sticky layer, or annotate intentional overlays with data-ui-allow-sticky-overlap='true'.",
              },
            });
          }
        }
        return issues.slice(0, 80);
      }

      function findUnreachableScrollContent(records) {
        const issues = [];
        for (const element of document.querySelectorAll("[data-ui-scroll-container]")) {
          if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
          if (!isVisibleElement(element)) continue;
          if (element.closest("[data-ui-allow-unreachable-scroll='true']")) continue;
          const record = records.get(element) || describeElement(element);
          const style = getComputedStyle(element);
          const overflowX = style.overflowX;
          const overflowY = style.overflowY;
          const extraX = element.scrollWidth > element.clientWidth + 1;
          const extraY = element.scrollHeight > element.clientHeight + 1;
          const unreachableX = extraX && clips(overflowX);
          const unreachableY = extraY && clips(overflowY);
          if (!unreachableX && !unreachableY) continue;
          issues.push({
            type: "unreachable-scroll-content",
            severity: "error",
            selector: record.selector,
            message: "Annotated scroll container has clipped overflow that cannot be reached by scrolling.",
            text: record.text,
            rect: record.rect,
            details: {
              scrollContainer: element.getAttribute("data-ui-scroll-container") || "required",
              client: record.client,
              scroll: record.scroll,
              overflow: { x: overflowX, y: overflowY },
              unreachable: { x: unreachableX, y: unreachableY },
              allowWith: "Use overflow auto/scroll for required scroll containers, remove the scroll-container annotation, or explicitly annotate an intentional clip.",
            },
          });
        }
        return issues.slice(0, 80);
      }

      function isStickyOverlapSource(element, record) {
        if (record.data.stickyGuard === "true") return true;
        const label = [element.tagName, record.role, record.className, record.ariaLabel, record.title].join(" ");
        if (element.tagName === "HEADER") return true;
        if (/\\b(header|topbar|toolbar|menubar|composer|sticky|dock|rail)\\b/i.test(label)) return true;
        return record.styles.position === "fixed" && /\\b(action|status|banner|notice)\\b/i.test(label);
      }

      function isStickyOverlapTarget(element, record) {
        if (record.interactive) return true;
        if (TEXT_TAGS.has(element.tagName) && (record.directText || record.text).trim().length > 0) return true;
        if (["button", "link", "heading", "tab", "menuitem", "checkbox", "radio", "switch"].includes(record.role)) return true;
        return false;
      }

      function stickyDominatesTarget(stickyRecord, stickyZ, targetRecord) {
        if (stickyRecord.data.stickyGuard === "true") return true;
        if (stickyRecord.styles.position === "fixed" && stickyZ >= zIndexValue(targetRecord)) return true;
        return stickyZ > zIndexValue(targetRecord);
      }

      function zIndexValue(record) {
        const parsed = Number.parseInt(record?.styles?.zIndex ?? "0", 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }

`;

const PAGE_MODEL_ACCESSIBILITY_HELPERS_SECTION = `      function needsExplicitAccessibleName(element, record) {
        if (element.closest("[data-ui-allow-unlabeled-control='true']")) return false;
        if (element instanceof HTMLInputElement) return ["button", "checkbox", "radio", "submit", "reset"].includes(element.type);
        if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return true;
        if (record.role === "button" || record.role === "tab" || record.role === "menuitem" || record.role === "checkbox" || record.role === "radio" || record.role === "switch") {
          return true;
        }
        return element.matches("button,a[href],[role='button'],[role='tab'],[role='menuitem'],[role='checkbox'],[role='radio'],[role='switch']");
      }

      function accessibleNameFor(element, record) {
        const candidates = [
          record.ariaLabel,
          labelledByText(element),
          associatedLabelText(element),
          record.title,
          record.text,
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : "",
          element instanceof HTMLImageElement ? element.alt : "",
        ];
        return candidates.map((item) => String(item || "").replace(/\\s+/g, " ").trim()).find(Boolean) || "";
      }

      function labelledByText(element) {
        const ids = (element.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
        return ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
      }

      function associatedLabelText(element) {
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
          const explicit = [...(element.labels || [])].map((label) => label.textContent || "").join(" ");
          if (explicit.trim()) return explicit;
        }
        return element.closest("label")?.textContent || "";
      }

      function measureTextWidth(text, font) {
        const canvas = window.__ambientUiModelMeasureCanvas || (window.__ambientUiModelMeasureCanvas = document.createElement("canvas"));
        const context = canvas.getContext("2d");
        if (!context) return text.length * 8;
        context.font = font;
        return context.measureText(text).width;
      }

      function parseCssPixels(value) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }

      function hiddenElementReason(element) {
        if (element.closest("[hidden]")) return "hidden-attribute";
        if (element.closest("[aria-hidden='true']")) return "aria-hidden";
        const style = getComputedStyle(element);
        if (style.display === "none") return "display-none";
        if (style.visibility === "hidden") return "visibility-hidden";
        if (Number(style.opacity) === 0) return "opacity-zero";
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return "empty-rect";
        return "";
      }

      function maxBoxShadowExtent(value) {
        if (!value || value === "none") return 0;
        const pixelValues = [...String(value).matchAll(/(-?\\d*\\.?\\d+)px/g)].map((match) => Math.abs(Number.parseFloat(match[1])));
        return pixelValues.length ? Math.max(...pixelValues) : 0;
      }

      function expandRect(rect, amount) {
        return {
          x: round(rect.x - amount),
          y: round(rect.y - amount),
          width: round(rect.width + amount * 2),
          height: round(rect.height + amount * 2),
          top: round(rect.top - amount),
          right: round(rect.right + amount),
          bottom: round(rect.bottom + amount),
          left: round(rect.left - amount),
        };
      }

      function firstClippingAncestorClip(element, rect, records, includeScrollable = false) {
        for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          const clipsX = includeScrollable ? clipsOrScrolls(ancestorStyle.overflowX) : clips(ancestorStyle.overflowX);
          const clipsY = includeScrollable ? clipsOrScrolls(ancestorStyle.overflowY) : clips(ancestorStyle.overflowY);
          if (!clipsX && !clipsY) continue;
          const ancestorRecord = records.get(ancestor) || describeElement(ancestor);
          const clip = rectClipDelta(rect, ancestorRecord.rect, ancestorStyle, includeScrollable);
          if (!clip) continue;
          return {
            ancestor: ancestorRecord,
            clip,
            overflow: {
              x: ancestorStyle.overflowX,
              y: ancestorStyle.overflowY,
            },
          };
        }
        return null;
      }

      function clipsOrScrolls(value) {
        return clips(value) || value === "auto" || value === "scroll";
      }

      function rectClipDelta(rect, clipRect, clipStyle, includeScrollable = false) {
        const clip = {};
        const clipsX = includeScrollable ? clipsOrScrolls(clipStyle.overflowX) : clips(clipStyle.overflowX);
        const clipsY = includeScrollable ? clipsOrScrolls(clipStyle.overflowY) : clips(clipStyle.overflowY);
        if (clipsX) {
          if (rect.left < clipRect.left - 1) clip.left = round(clipRect.left - rect.left);
          if (rect.right > clipRect.right + 1) clip.right = round(rect.right - clipRect.right);
        }
        if (clipsY) {
          if (rect.top < clipRect.top - 1) clip.top = round(clipRect.top - rect.top);
          if (rect.bottom > clipRect.bottom + 1) clip.bottom = round(rect.bottom - clipRect.bottom);
        }
        return Object.keys(clip).length ? clip : null;
      }

      function overlapArea(a, b) {
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return Math.round(width * height * 100) / 100;
      }

      function pointInsideRect(point, rect) {
        return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
      }

`;

const PAGE_MODEL_ALIGNMENT_SECTION = `      function collectAlignmentGroups() {
        const groups = new Map();
        for (const element of document.querySelectorAll("[data-ui-align-group]")) {
          if (!isVisibleElement(element)) continue;
          const name = element.getAttribute("data-ui-align-group") || "";
          if (!name) continue;
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(element);
        }
        return [...groups.entries()].map(([name, items]) => {
          const records = items.map((item) => describeElement(item));
          const axis = items[0].getAttribute("data-ui-align-axis") || "top";
          const values = records.map((record) => record.rect[axis]).filter((value) => typeof value === "number");
          const min = Math.min(...values);
          const max = Math.max(...values);
          const delta = Math.round((max - min) * 100) / 100;
          const violations = delta > 2
            ? [{
                type: "alignment-group-drift",
                severity: "warning",
                selector: "[data-ui-align-group='" + name + "']",
                message: "Annotated alignment group exceeds tolerance.",
                details: { group: name, axis, min, max, delta, tolerance: 2 },
              }]
            : [];
          return { name, axis, count: records.length, min, max, delta, nodes: records.map((record) => record.selector), violations };
        });
      }
    })()
`;

const PAGE_MODEL_EXPRESSION_SECTIONS = [
  PAGE_MODEL_COLLECTION_SECTION,
  PAGE_MODEL_ELEMENT_HELPERS_SECTION,
  PAGE_MODEL_LAYOUT_DETECTORS_SECTION,
  PAGE_MODEL_CONTRAST_DETECTORS_SECTION,
  PAGE_MODEL_VISIBILITY_DETECTORS_SECTION,
  PAGE_MODEL_ACCESSIBILITY_HELPERS_SECTION,
  PAGE_MODEL_ALIGNMENT_SECTION,
];
const PAGE_MODEL_EXPRESSION_TRAILING_INDENT = "  ";

export function pageModelExpression(scenario) {
  return `${PAGE_MODEL_EXPRESSION_HEADER}${JSON.stringify(scenario.name)}${PAGE_MODEL_EXPRESSION_SECTIONS.join("")}${PAGE_MODEL_EXPRESSION_TRAILING_INDENT}`;
}
