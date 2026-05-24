/** Canonical Browsergent types. Implement against these, not ad hoc shapes. */

// --- BrowserCommand ---

export type BrowserCommand =
  | { kind: "page.snapshot"; options?: SnapshotOptions }
  | { kind: "page.click"; refId: RefId }
  | { kind: "page.fill"; refId: RefId; text: string }
  | { kind: "page.clear"; refId: RefId }
  | { kind: "page.select"; refId: RefId; value: string }
  | { kind: "page.press"; key: Key }
  | { kind: "page.scroll"; direction: Direction; amount?: number }
  | { kind: "page.extract"; refId?: RefId }
  | { kind: "page.goto"; url: string }
  | { kind: "page.back" }
  | { kind: "page.forward" }
  | { kind: "page.reload" };

export type RefId = string;
export type Direction = "up" | "down";
export type Key = "Enter" | "Tab" | "Escape" | "Backspace" | string;

export interface SnapshotOptions {
  onlyVisible?: boolean;
  maxElements?: number;
}

// --- BrowserResult ---

export type BrowserResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code: ErrorCode; details?: Record<string, unknown> };

export type ErrorCode =
  | "E_STALE"
  | "E_NOT_FOUND"
  | "E_NOT_INTERACTABLE"
  | "E_NOT_FILLABLE"
  | "E_NOT_SELECT"
  | "E_PERMISSION"
  | "E_NAVIGATION"
  | "E_UNSUPPORTED"
  | "E_UNKNOWN";

// --- PageSnapshot ---

export interface PageSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: ReadonlyArray<ElementSnapshot>;
}

export interface ElementSnapshot {
  refId: RefId;
  role: string;
  tag: string;
  text: string;
  label?: string;
  placeholder?: string;
  value?: string;
  enabled: boolean;
  visible: boolean;
  attributes?: Record<string, string>;
}
