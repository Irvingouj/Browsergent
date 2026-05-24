/**
 * Content script: executes typed BrowserCommand objects.
 * Never evals JS. Never accepts CSS selectors. Uses ref_id only.
 */

import type {
  BrowserCommand,
  BrowserResult,
  PageSnapshot,
  ElementSnapshot,
  RefId,
  SnapshotOptions,
  ErrorCode,
} from "../types/browser";

const refMap = new WeakMap<Element, RefId>();
let nextRefId = 0;

function assignRefId(el: Element): RefId {
  let existing = refMap.get(el);
  if (existing) return existing;
  const id: RefId = `e${nextRefId}`;
  nextRefId++;
  refMap.set(el, id);
  return id;
}

function resolveElement(refId: RefId): { ok: true; element: Element } | { ok: false; error: string; code: ErrorCode } {
  const all = document.querySelectorAll(
    "a[href], button, input, select, textarea, [role], [contenteditable='true'], [onclick]"
  );
  for (const el of all) {
    if (refMap.get(el) === refId) {
      if (!el.isConnected) {
        return { ok: false, error: "Element disconnected", code: "E_STALE" };
      }
      return { ok: true, element: el };
    }
  }
  return { ok: false, error: `No element with ref_id ${refId}`, code: "E_STALE" };
}

function isVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  if (htmlEl.offsetParent === null && (htmlEl as HTMLInputElement).type !== "hidden") return false;
  const style = window.getComputedStyle(htmlEl);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function getRole(el: Element): string {
  return el.getAttribute("role") ?? implicitRole(el);
}

function implicitRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "a": return "link";
    case "button": return "button";
    case "input": {
      const type = (el as HTMLInputElement).type;
      return type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : "textbox";
    }
    case "select": return "combobox";
    case "textarea": return "textbox";
    default: return "generic";
  }
}

function truncate(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

const INTERACTIVE_SELECTOR =
  "a[href], button, input, select, textarea, [role], [contenteditable='true'], [onclick]";

function executeSnapshot(options?: SnapshotOptions): BrowserResult {
  const onlyVisible = options?.onlyVisible ?? true;
  const maxElements = options?.maxElements ?? 100;

  const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const elements: ElementSnapshot[] = [];

  for (const el of candidates) {
    if (elements.length >= maxElements) break;

    const visible = isVisible(el);
    if (onlyVisible && !visible) continue;

    const refId = assignRefId(el);
    const tag = el.tagName.toLowerCase();
    const text = truncate((el.textContent ?? "").trim());
    const role = getRole(el);
    const label = el.getAttribute("aria-label") ?? undefined;
    const placeholder = (el as HTMLInputElement).placeholder || undefined;

    let value: string | undefined;
    if (tag === "input" && (el as HTMLInputElement).type !== "password") {
      value = (el as HTMLInputElement).value || undefined;
    } else if (tag === "textarea") {
      value = (el as HTMLTextAreaElement).value || undefined;
    } else if (tag === "select") {
      value = (el as HTMLSelectElement).value || undefined;
    }

    const enabled = !(el as HTMLInputElement).disabled;

    elements.push({ refId, role, tag, text, label, placeholder, value, enabled, visible });
  }

  const snapshot: PageSnapshot = {
    url: location.href,
    title: document.title,
    timestamp: Date.now(),
    elements,
  };

  return { ok: true, value: snapshot };
}

function executeClick(refId: RefId): BrowserResult {
  const resolved = resolveElement(refId);
  if (!resolved.ok) return resolved;
  const el = resolved.element as HTMLElement;
  if (!isVisible(el)) {
    return { ok: false, error: "Element not visible", code: "E_NOT_INTERACTABLE" };
  }
  el.click();
  return { ok: true, value: { clicked: true } };
}

function executeFill(refId: RefId, text: string): BrowserResult {
  const resolved = resolveElement(refId);
  if (!resolved.ok) return resolved;
  const el = resolved.element as HTMLInputElement;
  if (!isVisible(el)) {
    return { ok: false, error: "Element not visible", code: "E_NOT_INTERACTABLE" };
  }
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && el.contentEditable !== "true") {
    return { ok: false, error: "Element not fillable", code: "E_NOT_FILLABLE" };
  }
  if (el.disabled) {
    return { ok: false, error: "Element disabled", code: "E_NOT_INTERACTABLE" };
  }

  if (el.contentEditable === "true") {
    el.textContent = text;
  } else {
    el.value = text;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, value: { filled: true } };
}

function executeClear(refId: RefId): BrowserResult {
  const resolved = resolveElement(refId);
  if (!resolved.ok) return resolved;
  const el = resolved.element as HTMLInputElement;
  el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, value: { cleared: true } };
}

function executeSelect(refId: RefId, value: string): BrowserResult {
  const resolved = resolveElement(refId);
  if (!resolved.ok) return resolved;
  const el = resolved.element as HTMLSelectElement;
  if (el.tagName.toLowerCase() !== "select") {
    return { ok: false, error: "Element is not a select", code: "E_NOT_SELECT" };
  }
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, value: { selected: true } };
}

function executePress(key: string): BrowserResult {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  return { ok: true, value: { pressed: key } };
}

function executeScroll(direction: "up" | "down", amount?: number): BrowserResult {
  const delta = (amount ?? 300) * (direction === "down" ? 1 : -1);
  window.scrollBy(0, delta);
  return { ok: true, value: { scrolled: true } };
}

function executeExtract(refId?: RefId): BrowserResult {
  if (refId) {
    const resolved = resolveElement(refId);
    if (!resolved.ok) return resolved;
    return { ok: true, value: { text: (resolved.element.textContent ?? "").trim() } };
  }
  return { ok: true, value: { text: document.body.innerText } };
}

export function executeCommand(command: BrowserCommand): BrowserResult {
  switch (command.kind) {
    case "page.snapshot":
      return executeSnapshot(command.options);
    case "page.click":
      return executeClick(command.refId);
    case "page.fill":
      return executeFill(command.refId, command.text);
    case "page.clear":
      return executeClear(command.refId);
    case "page.select":
      return executeSelect(command.refId, command.value);
    case "page.press":
      return executePress(command.key);
    case "page.scroll":
      return executeScroll(command.direction, command.amount);
    case "page.extract":
      return executeExtract(command.refId);
    default:
      return { ok: false, error: `Unknown command: ${(command as { kind: string }).kind}`, code: "E_UNSUPPORTED" as const };
  }
}

chrome.runtime.onMessage.addListener(
  (message: { type: "executeCommand"; command: BrowserCommand }, _sender, sendResponse) => {
    if (message.type !== "executeCommand") return false;
    const result = executeCommand(message.command);
    sendResponse({ type: "commandResult", result });
    return false;
  }
);
