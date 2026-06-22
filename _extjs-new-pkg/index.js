var Zt = Object.defineProperty;
var Vt = (e, r, n) => r in e ? Zt(e, r, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[r] = n;
var M = (e, r, n) => Vt(e, typeof r != "symbol" ? r + "" : r, n);
import { z as t } from "zod";
import { collectDocument as zt, formatSnapshot as Ve, init as Qt } from "@pi-oxide/dom-semantic-tree";
const Ce = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  none: 5
};
let ze = "trace";
function Xt(e) {
  ze = e;
}
function Jt(e) {
  return Ce[e] >= Ce[ze];
}
function Qe(e, r = "info") {
  var n;
  if (e === null) return "null";
  if (e === void 0) return "undefined";
  if (typeof e == "string") return e;
  if (typeof e == "number" || typeof e == "boolean")
    return String(e);
  if (typeof e == "bigint") return `${e}n`;
  if (e instanceof Error) {
    const a = r === "debug" || r === "trace" ? e.stack : (n = e.stack) == null ? void 0 : n.split(`
`)[0];
    return JSON.stringify({ message: e.message, name: e.name, stack: a });
  }
  if (typeof e == "function") return "[Function]";
  if (typeof e == "symbol") return String(e);
  if (typeof e == "object")
    try {
      return JSON.stringify(e);
    } catch (a) {
      return a instanceof TypeError && a.message.includes("circular") ? "[Circular]" : `[Unserializable: ${a instanceof Error ? a.message : String(a)}]`;
    }
  return String(e);
}
function Yt(e) {
  return `[extension-js][${e}]`;
}
function er(e, r) {
  if (!e) return "";
  const n = [];
  try {
    for (const [a, o] of Object.entries(e))
      n.push(`${a}=${Qe(o, r)}`);
  } catch {
    return " metadata=[unreadable]";
  }
  return n.length > 0 ? ` ${n.join(" ")}` : "";
}
function ae(e, r) {
  return r.length === 0 ? { event: e } : r.length === 1 && typeof r[0] == "object" && r[0] !== null && !Array.isArray(r[0]) ? { event: e, metadata: r[0] } : {
    event: e,
    metadata: { _args: r.map((n) => Qe(n)).join(" ") }
  };
}
class Ae {
  constructor(r = "root") {
    this.namespace = r;
  }
  log(r, n, a) {
    try {
      if (!Jt(r)) return;
      const o = Yt(this.namespace), i = er(a, r), s = `${o} ${n}${i}`;
      switch (r) {
        case "trace":
        case "debug":
        case "info":
          console.log(s);
          break;
        case "warn":
          console.warn(s);
          break;
        case "error":
          console.error(s);
          break;
        case "none":
          break;
        default: {
          const c = r;
          break;
        }
      }
    } catch {
    }
  }
  trace(r, ...n) {
    const { event: a, metadata: o } = ae(r, n);
    this.log("trace", a, o);
  }
  debug(r, ...n) {
    const { event: a, metadata: o } = ae(r, n);
    this.log("debug", a, o);
  }
  info(r, ...n) {
    const { event: a, metadata: o } = ae(r, n);
    this.log("info", a, o);
  }
  warn(r, ...n) {
    const { event: a, metadata: o } = ae(r, n);
    this.log("warn", a, o);
  }
  error(r, ...n) {
    const { event: a, metadata: o } = ae(r, n);
    this.log("error", a, o);
  }
  child(r) {
    return new Ae(`${this.namespace}.${r}`);
  }
  timer(r, n, a = "info") {
    const o = typeof performance < "u" && performance.now, i = o ? performance.now() : Date.now();
    return (s) => {
      try {
        const c = o ? performance.now() : Date.now(), l = Math.round(c - i), u = {
          ...n,
          ...s,
          duration_ms: l
        };
        this.log(a, r, u);
      } catch {
      }
    };
  }
}
const h = new Ae("root"), Xe = /* @__PURE__ */ new Set();
function tr(e) {
  Xe.add(e);
}
function Je(e) {
  return Xe.has(e);
}
function se(e) {
  return e == null ? {} : e instanceof Map ? Object.fromEntries(
    [...e.entries()].map(([r, n]) => [
      r,
      se(n)
    ])
  ) : Array.isArray(e) ? e.map(se) : e;
}
const rr = "Content script is not connected on this tab. This tab was likely open before the extension loaded (MV3 does not retro-inject).";
function nr(e) {
  return [
    `await page.goto(${JSON.stringify(e || "")})`,
    "Or ask the user to refresh the target tab, then retry fill/click"
  ];
}
function fe(e, r) {
  const n = r || "unknown url", a = {
    message: e !== void 0 ? `Content script is not connected on tab ${e} (${n}).` : `Content script is not connected on this tab (${n}).`,
    code: "E_CONTENT_SCRIPT",
    category: "content-script",
    hint: rr,
    recovery: nr(r)
  };
  return e !== void 0 && (a.details = { tabId: e, url: n }), a;
}
function ar(e) {
  return {
    message: `No active tab resolved for ${e}.`,
    code: "E_NO_TAB",
    category: "resource",
    recovery: [
      "const t = await web.tab.current(); console.log(t.tabId, t.url)",
      "Ensure the user is focused on a normal http(s) page tab, not chrome:// or the side panel"
    ]
  };
}
function or(e, r) {
  var s, c;
  const n = e ? "refId" : r != null && r.label ? "label" : null, a = e || (r == null ? void 0 : r.label) || "";
  let o = `Element not found${n ? ` by ${n} "${a}"` : ""}`;
  if (r != null && r.label && ((s = r.candidates) != null && s.length)) {
    const l = r.candidates.map((u) => u.name || u.refId).filter(Boolean).slice(0, 5);
    l.length > 0 ? o += `. Candidates: ${l.join(", ")}` : o += ". Candidates: none";
  }
  const i = {
    message: o,
    code: "E_STALE",
    category: "resource",
    hint: "RefIds are ephemeral. They are assigned at snapshot time and invalidated when the DOM is replaced (navigation, SPA rerender, autocomplete).",
    recovery: [
      "const d = await page.snapshot_data(); find the target in d.nodes",
      "Use a fresh refId from that snapshot only",
      "Do not reuse refIds from before press/click/navigation"
    ],
    details: { staleRefId: e || void 0 }
  };
  return (c = r == null ? void 0 : r.candidates) != null && c.length && (i.details = { ...i.details, candidates: r.candidates }), i;
}
function ir(e) {
  return e.includes("Could not establish connection") || e.includes("Receiving end does not exist") || e.includes("Timeout waiting for content-script ping") || e.includes("content script not available") || e.includes("message port closed before a response was received");
}
function Se(e) {
  const r = new Error(e.message);
  throw r.code = e.code, e.category && (r.category = e.category), e.hint && (r.hint = e.hint), e.recovery && (r.recovery = e.recovery), e.details && (r.details = e.details), r;
}
function sr(e, r) {
  let n = `Element not found by label "${e}"`;
  if (r != null && r.length) {
    const a = r.map((o) => o.name || o.refId).filter(Boolean).slice(0, 5);
    n += a.length > 0 ? `. Candidates: ${a.join(", ")}` : ". Candidates: none";
  }
  return {
    message: n,
    code: "E_NOT_FOUND",
    category: "resource",
    hint: "No element matched this label. Check candidates or snapshot for visible controls.",
    recovery: [
      "const d = await page.snapshot_data(); find the target in d.nodes",
      "Try a more specific label or use refId from snapshot"
    ],
    details: r != null && r.length ? { label: e, candidates: r } : { label: e }
  };
}
function cr(e) {
  if (!(e instanceof Error)) return {};
  const r = e.name !== "Error" ? e.name : void 0, n = e.stack;
  let a;
  if (n) {
    const o = n.match(/:(\d+):\d+\)?$/m);
    o && (a = parseInt(o[1], 10));
  }
  return { name: r, stack: n, line: a };
}
function Ye(e, r) {
  if (typeof e == "object" && e !== null && "code" in e && typeof e.code == "string" && "message" in e && typeof e.message == "string") {
    const c = e;
    return c.hint || c.recovery ? c : c.code === "E_CONTENT_SCRIPT" ? fe(r == null ? void 0 : r.tabId, r == null ? void 0 : r.url) : c;
  }
  const n = (e instanceof Error ? e.message : String(e)) || "", { name: a, stack: o, line: i } = cr(e);
  if (ir(n))
    return fe(r == null ? void 0 : r.tabId, r == null ? void 0 : r.url);
  if (n.includes("permission") || n.includes("Permission")) {
    const c = {
      message: n,
      code: "E_PERMISSION",
      category: "permission"
    };
    return (a || o || i) && (c.details = { name: a, stack: o, line: i }), c;
  }
  if (n.includes("not found") || n.includes("No tab") || n.includes("No active tab")) {
    const c = {
      message: n,
      code: "E_NOT_FOUND",
      category: "resource"
    };
    return (a || o || i) && (c.details = { name: a, stack: o, line: i }), c;
  }
  const s = {
    message: n,
    code: "E_EXTENSION",
    category: "extension"
  };
  return (a || o || i) && (s.details = { name: a, stack: o, line: i }), s;
}
function Z(e) {
  return e instanceof t.ZodEffects ? Z(e.innerType()) : e instanceof t.ZodDefault ? Z(e.removeDefault()) : e instanceof t.ZodPipeline ? Z(e._def.in) : e instanceof t.ZodOptional || e instanceof t.ZodNullable || e instanceof t.ZodBranded || e instanceof t.ZodReadonly ? Z(e.unwrap()) : e instanceof t.ZodCatch ? Z(e.removeCatch()) : e;
}
function T(e, r = 0, n = 2) {
  if (r > n) return "...";
  if (e instanceof t.ZodObject) {
    const a = e.shape, o = Object.keys(a).filter((s) => !s.startsWith("__"));
    return o.length === 0 ? "{ }" : r >= n - 1 ? "{ ... }" : `{ ${o.map((s) => {
      const c = a[s], l = c instanceof t.ZodOptional, u = T(l ? c.unwrap() : c, r + 1, n);
      return `${s}${l ? "?" : ""}: ${u}`;
    }).join(", ")} }`;
  }
  if (e instanceof t.ZodUnion)
    return e.options.map((a) => T(a, r, n)).join(" or ");
  if (e instanceof t.ZodString) return "string";
  if (e instanceof t.ZodNumber) return "number";
  if (e instanceof t.ZodBoolean) return "boolean";
  if (e instanceof t.ZodBigInt) return "bigint";
  if (e instanceof t.ZodNull) return "null";
  if (e instanceof t.ZodArray) {
    const a = T(e.element, r + 1, n);
    return a === "unknown" || a === "any" ? "array" : `${a}[]`;
  }
  if (e instanceof t.ZodTuple)
    return `[${e.items.map((a) => T(a, r + 1, n)).join(", ")}]`;
  if (e instanceof t.ZodRecord) {
    const a = T(
      e._def.valueType,
      r + 1,
      n
    );
    return a === "unknown" || a === "any" ? "{ [key: string]: unknown }" : `{ [key: string]: ${a} }`;
  }
  return e instanceof t.ZodOptional ? `${T(e.unwrap(), r, n)}?` : e instanceof t.ZodLiteral ? JSON.stringify(e.value) : e instanceof t.ZodEnum ? e.options.map((a) => `"${a}"`).join(" | ") : e instanceof t.ZodAny ? "any" : e instanceof t.ZodUnknown ? "unknown" : e instanceof t.ZodVoid ? "void" : e instanceof t.ZodUndefined ? "undefined" : e instanceof t.ZodEffects ? T(e.innerType(), r, n) : e instanceof t.ZodDefault ? T(e.removeDefault(), r, n) : e instanceof t.ZodNullable ? `${T(e.unwrap(), r, n)} | null` : e instanceof t.ZodLazy ? "lazy" : e instanceof t.ZodPromise ? `Promise<${T(e.unwrap(), r + 1, n)}>` : e instanceof t.ZodFunction ? "function" : e instanceof t.ZodDate ? "Date" : e instanceof t.ZodMap ? "Map" : e instanceof t.ZodSet ? "Set" : e instanceof t.ZodIntersection ? `${T(e._def.left, r, n)} & ${T(e._def.right, r, n)}` : e instanceof t.ZodDiscriminatedUnion ? e.options.map((a) => T(a, r, n)).join(" or ") : e instanceof t.ZodBranded ? T(e.unwrap(), r, n) : e instanceof t.ZodNaN ? "NaN" : e instanceof t.ZodCatch ? T(e.removeCatch(), r, n) : e instanceof t.ZodPipeline ? T(e._def.in, r, n) : e instanceof t.ZodReadonly ? `readonly ${T(e.unwrap(), r, n)}` : "unknown";
}
function lr(e) {
  const r = Z(e);
  if (!(r instanceof t.ZodObject))
    return [];
  const n = r.shape;
  return Object.keys(n).filter((o) => !o.startsWith("__")).map((o) => {
    const i = n[o];
    let s = !1, c = !1, l = i;
    for (; ; ) {
      if (l instanceof t.ZodOptional) {
        s = !0, l = l.unwrap();
        continue;
      }
      if (l instanceof t.ZodDefault) {
        s = !0, l = l.removeDefault();
        continue;
      }
      if (l instanceof t.ZodEffects) {
        l = l.innerType();
        continue;
      }
      if (l instanceof t.ZodNullable) {
        c = !0, l = l.unwrap();
        continue;
      }
      if (l instanceof t.ZodBranded) {
        l = l.unwrap();
        continue;
      }
      if (l instanceof t.ZodReadonly) {
        l = l.unwrap();
        continue;
      }
      if (l instanceof t.ZodCatch) {
        l = l.removeCatch();
        continue;
      }
      if (l instanceof t.ZodPipeline) {
        l = l._def.in;
        continue;
      }
      break;
    }
    const u = T(l, 1, 3) + (c ? " | null" : ""), m = i.description ?? l.description ?? "";
    return {
      name: o,
      type: u,
      required: !s,
      description: m
    };
  });
}
function et(e) {
  return T(e, 0, 3);
}
function dr(e) {
  return e === null ? "null" : e === void 0 ? "undefined" : Array.isArray(e) ? "array" : typeof e;
}
function ur(e, r, n, a) {
  const o = n.filter((c) => c.path.length === 0), i = n.filter((c) => c.path.length > 0);
  if (o.length > 0 && i.length === 0) {
    const c = o.some((u) => u.code === "custom"), l = o.some(
      (u) => u.code !== "invalid_type" && u.code !== "invalid_literal" && u.code !== "invalid_union"
    );
    if (!c && !l) {
      const u = T(r), m = dr(a);
      return `Invalid parameters for ${e}: expected ${u}${u === "{ }" ? " or no args" : ""}, received ${m}`;
    }
  }
  const s = n.map((c) => `at '${c.path.length > 0 ? c.path.join(".") : "root"}': ${c.message}`);
  return `Invalid parameters for ${e}: ${s.join("; ")}`;
}
async function mr(e, r, n, a, o) {
  const i = e.safeParse(se(a));
  if (!i.success)
    return {
      ok: !1,
      error: {
        message: ur(
          o,
          e,
          i.error.issues,
          a
        ),
        code: "E_INVALID_PARAMS",
        category: "validation"
      }
    };
  try {
    const s = await n(i.data), c = r.safeParse(s);
    if (!c.success) {
      const l = c.error.issues.map((u) => {
        const m = u.path.join(".");
        return `invalid return value${m ? ` at '${m}'` : ""} (${u.message})`;
      });
      return {
        ok: !1,
        error: {
          message: `Invalid return value for ${o}: ${l.join("; ")}`,
          code: "E_INVALID_RETURN",
          category: "validation"
        }
      };
    }
    return { ok: !0, value: c.data };
  } catch (s) {
    const c = Ye(s), l = c.code === "E_EXTENSION" && (typeof s != "object" || s === null || !("code" in s));
    return {
      ok: !1,
      error: {
        ...c,
        code: l ? "E_HANDLER" : c.code,
        message: `${o}: ${c.message}`
      }
    };
  }
}
function pr(e, r) {
  return r !== "main-thread" ? r : Je(e) ? "content-script" : r;
}
const ve = h.child("tool-registry"), De = /* @__PURE__ */ new Map(), pe = /* @__PURE__ */ new Map();
let tt = !1, be = null;
function Te(e) {
  be = e;
}
function Ne() {
  return be == null ? void 0 : be.signal;
}
function X() {
  const e = Ne();
  if (e != null && e.aborted)
    throw new Error("Runner aborted: ExtensionSession stopped");
}
function rt(e) {
  p({
    ...e,
    owner: "content-script",
    handler: async () => {
      throw new Error(`${e.action} runs in the content script`);
    }
  });
}
function p(e) {
  if (tt)
    throw new Error(`JS registry is frozen; cannot register "${e.action}"`);
  if (pe.has(e.action))
    throw new Error(`Tool "${e.action}" is already registered`);
  const r = `${e.namespace}.${e.name}`;
  let n = !1, a = "";
  for (const [c, l] of pe)
    if (`${l.namespace}.${l.name}` === r) {
      n = !0, a = c;
      break;
    }
  if (n)
    throw new Error(
      `Duplicate public name "${r}" for action "${e.action}" (already registered by "${a}")`
    );
  const o = pr(e.action, e.owner), i = {
    ...e,
    owner: o
  };
  if (pe.set(e.action, i), o !== "main-thread")
    return;
  const s = {
    action: e.action,
    namespace: e.namespace,
    description: e.description,
    params: e.params,
    returns: e.returns,
    handler: async (c, l, u, m) => {
      const f = {
        action: i.action,
        callId: l,
        runId: u,
        signal: m
      };
      return i.handler(c, f);
    },
    paramTypes: e.paramTypes ?? [],
    returnType: e.returnType ?? et(e.returns),
    returnDoc: e.returnDoc ?? "Result",
    errorCode: e.errorCode,
    errorCategory: e.errorCategory,
    example: e.example
  };
  De.set(e.action, s);
}
function Oe(e) {
  return De.get(e);
}
function br() {
  tt = !0;
  const e = nt(), r = [];
  for (const n of e)
    n.owner === "main-thread" ? Oe(n.action) || r.push(`${n.action} (main-thread: no tool handler)`) : n.owner === "content-script" ? Je(n.action) || r.push(
      `${n.action} (content-script: missing from content-script action set)`
    ) : r.push(`${n.action} (unknown owner: ${n.owner})`);
  if (r.length > 0)
    throw new Error(
      `Manifest integrity failure: ${r.length} orphan entries lack executable handlers:
` + r.map((n) => `  - ${n}`).join(`
`)
    );
}
function nt() {
  var r, n, a, o, i;
  const e = [];
  for (const [s, c] of pe) {
    if (c.owner === "rust") continue;
    const l = c.paramTypes && c.paramTypes.length > 0 ? c.paramTypes : lr(c.params), u = {
      type: c.returnType ?? et(c.returns),
      description: c.returnDoc ?? "Result"
    };
    e.push({
      action: s,
      namespace: c.namespace,
      name: c.name,
      publicName: `${c.namespace}.${c.name}`,
      description: c.description,
      fields: c.fields ?? null,
      aliases: ((r = c.aliases) == null ? void 0 : r.map((m) => ({
        namespace: m.namespace,
        name: m.name,
        fields: m.fields ?? null
      }))) ?? null,
      owner: c.owner,
      paramsDoc: l,
      returnsDoc: u,
      errorCode: c.errorCode,
      errorCategory: c.errorCategory,
      permission: c.permission,
      example: c.example,
      prerequisites: (n = c.agentMeta) == null ? void 0 : n.prerequisites,
      notes: (a = c.agentMeta) == null ? void 0 : a.notes,
      tags: (o = c.agentMeta) == null ? void 0 : o.tags,
      relatedApis: (i = c.agentMeta) == null ? void 0 : i.relatedApis
    });
  }
  return e;
}
async function C(e, r, n, a, o) {
  ve.debug("dispatch_start", { action: e, callId: n, runId: a });
  const i = De.get(e);
  if (!i)
    return {
      ok: !1,
      error: {
        message: `Unknown main-thread action: ${e}`,
        code: "E_UNKNOWN",
        category: "unknown"
      }
    };
  X();
  const s = await mr(
    i.params,
    i.returns,
    async (c) => i.handler(c, n, a, o),
    r,
    e
  );
  return s.ok ? (ve.debug("dispatch_done", {
    action: e,
    ok: !0,
    resultType: typeof s.value
  }), s) : (ve.warn("dispatch_error", {
    action: e,
    error: s.error.message,
    code: s.error.code
  }), s.error.code === "E_HANDLER" ? {
    ok: !1,
    error: {
      ...s.error,
      code: i.errorCode,
      category: i.errorCategory ?? s.error.category
    }
  } : s);
}
const Be = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  coerceWasmParams: se,
  dispatchTool: C,
  freezeJsRegistry: br,
  getRunnerSignal: Ne,
  getSerializableJsManifest: nt,
  getTool: Oe,
  registerContentScriptJsCall: rt,
  registerJsCall: p,
  setRunnerAbortController: Te,
  throwIfAborted: X
}, Symbol.toStringTag, { value: "Module" }));
let F = null, ge = !1;
const at = ({ tabId: e }) => {
  F = e;
}, ot = (e, r) => {
  var a;
  const n = window.chrome;
  (a = n == null ? void 0 : n.runtime) != null && a.id && r.status === "complete" && (F = e, n.tabs.sendMessage(e, { action: "ping" }).catch(() => {
  }));
};
function hr(e) {
  var r;
  ge || (r = e == null ? void 0 : e.runtime) != null && r.id && (ge = !0, e.tabs.onActivated.addListener(at), e.tabs.onUpdated.addListener(ot), e.tabs.query({ active: !0, lastFocusedWindow: !0 }).then((n) => {
    const a = n[0];
    (a == null ? void 0 : a.id) !== void 0 && (F = a.id);
  }).catch(() => {
  }));
}
function fr() {
  var r;
  const e = window.chrome;
  !((r = e == null ? void 0 : e.runtime) != null && r.id) || !ge || (e.tabs.onActivated.removeListener(at), e.tabs.onUpdated.removeListener(ot), ge = !1);
}
async function it() {
  var n;
  const e = h.child("tab-context");
  if (e.debug("resolveActiveTabId_start", { activeTabId: F }), F !== null)
    return e.debug("resolveActiveTabId_result", { tabId: F }), F;
  const r = window.chrome;
  if (!((n = r == null ? void 0 : r.runtime) != null && n.id))
    return e.warn("resolveActiveTabId_result", {
      tabId: null,
      reason: "no_extension"
    }), null;
  try {
    const o = (await r.tabs.query({ active: !0 }))[0];
    if (o && typeof o.id == "number")
      return F = o.id, e.debug("resolveActiveTabId_result", { tabId: o.id }), o.id;
  } catch {
  }
  return e.warn("resolveActiveTabId_result", { tabId: null, reason: "not_found" }), null;
}
function gr(e) {
  if (typeof e == "number" && Number.isFinite(e))
    return e;
  if (typeof e == "bigint") {
    const r = Number(e);
    return Number.isSafeInteger(r) ? r : null;
  }
  return null;
}
function yr(e, r) {
  const n = r.tabId ?? r.tab_id, a = gr(n);
  if (a !== null)
    return a;
  if (n != null)
    throw new Error("tabId must be a finite number or safe integer bigint");
  if (e === "required")
    throw new Error("tabId is required for this action");
  if (F !== null)
    return F;
  throw new Error("No active tab available");
}
function I(e, r, n, a) {
  const o = new Error(e);
  return o.code = r, n && (o.category = n), a != null && a.hint && (o.hint = a.hint), a != null && a.recovery && (o.recovery = a.recovery), a != null && a.details && (o.details = a.details), o;
}
function _r(e) {
  throw I(e.message, e.code, e.category, {
    hint: e.hint,
    recovery: e.recovery,
    details: e.details
  });
}
let ie = null;
const ye = {
  action: null,
  alarms: "alarms",
  bookmarks: "bookmarks",
  browsingData: "browsingData",
  contextMenus: "contextMenus",
  cookies: "cookies",
  declarativeNetRequest: "declarativeNetRequest",
  desktopCapture: "desktopCapture",
  downloads: "downloads",
  history: "history",
  identity: "identity",
  idle: "idle",
  management: "management",
  notifications: "notifications",
  offscreen: "offscreen",
  pageCapture: "pageCapture",
  permissions: null,
  runtime: null,
  scripting: "scripting",
  sessions: "sessions",
  sidePanel: "sidePanel",
  storage: "storage",
  system: "system.cpu",
  tabGroups: "tabGroups",
  tabs: "tabs",
  topSites: "topSites",
  tts: "tts",
  windows: "windows"
};
async function st() {
  var e, r, n, a;
  if (typeof chrome < "u" && ((e = chrome.runtime) != null && e.id))
    try {
      const o = ((n = (r = chrome.runtime).getManifest) == null ? void 0 : n.call(r).permissions) ?? [];
      let i = [];
      (a = chrome.permissions) != null && a.getAll && (i = (await chrome.permissions.getAll()).permissions ?? []), ie = /* @__PURE__ */ new Set([...o, ...i]);
    } catch {
      ie = null;
    }
  else
    ie = null;
}
async function ct() {
  await st();
}
function lt(e) {
  if (e.length === 0) return null;
  const r = e[0];
  if (r === "system" && e.length >= 2) {
    const n = e[1];
    if (n === "cpu" || n === "memory" || n === "storage")
      return `system.${n}`;
  }
  return r in ye ? ye[r] : r;
}
function dt(e) {
  const r = e.match(/^chrome_([a-zA-Z0-9]+)_/);
  if (!r) return null;
  const n = r[1];
  return n in ye ? ye[n] : n;
}
function ut(e) {
  return e === null ? !0 : ie === null ? !1 : ie.has(e);
}
function qe(e, r) {
  if (r !== null && !ut(r))
    throw I(
      `Permission denied: ${r} required for ${e}`,
      "E_PERMISSION",
      "permission"
    );
}
const wr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  checkPermission: qe,
  hasPermission: ut,
  initCapabilities: st,
  manifestPermissionForApiPath: lt,
  permissionFromChromeAction: dt,
  refreshCapabilities: ct
}, Symbol.toStringTag, { value: "Module" })), kr = /* @__PURE__ */ new Set([
  "bookmarks_search",
  "bookmarks_create",
  "bookmarks_delete",
  "history_search",
  "history_delete",
  "cookies_get",
  "cookies_set",
  "cookies_delete",
  "cookies_list",
  "notifications_create",
  "notifications_clear"
]);
function mt(e) {
  return e.startsWith("chrome_") || kr.has(e);
}
function pt(e, r) {
  return e(...r);
}
const Er = /* @__PURE__ */ new Set([
  "chrome_bookmarks_search",
  "bookmarks_search",
  "chrome_history_search",
  "history_search",
  "chrome_downloads_search",
  "chrome_tabs_query",
  "tab_query"
]);
function Me(e, r) {
  return r.length > 0 ? r : Er.has(e) ? [{}] : r;
}
function Pe(e, r) {
  if (!Array.isArray(e))
    throw I(
      `Native-parity action ${r} requires an argument array`,
      "E_INVALID_ARGUMENT_TRANSPORT",
      "validation"
    );
  return e;
}
function bt(e, r, n) {
  let a = e;
  for (let i = 0; i < r.length; i++) {
    const s = r[i];
    if (a = a[s], a == null)
      throw I(
        `Chrome API not available: chrome.${r.slice(0, i + 1).join(".")}`,
        "E_UNAVAILABLE",
        "extension"
      );
  }
  const o = a[n];
  if (typeof o != "function")
    throw I(
      `Chrome method not found: ${n}`,
      "E_EXTENSION",
      "extension"
    );
  return o.bind(a);
}
function we(e) {
  const r = (e instanceof Error ? e.message : String(e)) || "";
  return r.includes("permission") || r.includes("Permission") ? {
    ok: !1,
    error: {
      message: r,
      code: "E_PERMISSION",
      category: "permission"
    }
  } : r.includes("not found") || r.includes("No tab") || r.includes("No window") ? {
    ok: !1,
    error: { message: r, code: "E_NOT_FOUND", category: "resource" }
  } : {
    ok: !1,
    error: { message: r, code: "E_EXTENSION", category: "extension" }
  };
}
function he(e) {
  if (e === null || typeof e != "object") return e;
  if (Array.isArray(e)) return e.map(he);
  if (typeof e.postMessage == "function") {
    const n = e;
    return {
      name: n.name ?? "",
      connected: !0,
      sender: n.sender ? he(n.sender) : null
    };
  }
  const r = {};
  for (const n of Object.keys(e)) {
    const a = e[n];
    typeof a != "function" && (r[n] = he(a));
  }
  return r;
}
function d(e, r, n, a, o, i, s, c = [], l, u) {
  const m = Ir(e), f = a.length > 0 ? `chrome.${a.join(".")}` : r, b = lt(a);
  p({
    action: e,
    namespace: f,
    name: m,
    description: n,
    params: t.unknown(),
    returns: o,
    owner: "main-thread",
    permission: b ?? void 0,
    returnType: u ?? void 0,
    handler: async (v, g) => {
      var re;
      const x = h.child("chrome"), N = window.chrome;
      if (!((re = N == null ? void 0 : N.runtime) != null && re.id))
        throw I(
          `${e} is only available in a browser extension context`,
          "E_NO_EXTENSION",
          "permission"
        );
      qe(e, b);
      const A = Me(
        e,
        Pe(v, e)
      ), E = bt(N, a, m);
      x.debug("chrome_passthrough", { action: e, argCount: A.length });
      try {
        const q = await pt(E, A);
        x.debug("chrome_passthrough_ok", { action: e });
        const G = he(q);
        return G === void 0 ? null : G;
      } catch (q) {
        if (typeof q == "object" && q !== null && "code" in q && q.code === "E_INVALID_ARGUMENT_TRANSPORT")
          throw q;
        const G = we(q);
        throw x.debug("chrome_passthrough_err", {
          action: e,
          error: G.error.message
        }), I(
          G.error.message,
          G.error.code,
          G.error.category
        );
      }
    },
    paramTypes: c,
    returnDoc: "Chrome API result",
    errorCode: i,
    errorCategory: s,
    example: l
  });
}
function Ir(e) {
  const r = e.split("_").at(-1);
  if (!r)
    throw new Error(`Cannot derive Chrome method name from action "${e}"`);
  return r;
}
const ke = {};
function go(e, r) {
  ke[e] = r;
}
function yo(e) {
  Object.assign(ke, e);
}
function ht(e) {
  var r;
  if (Oe(e)) return !0;
  if (e.startsWith("host_")) {
    const n = e.slice(5);
    return !!ke[n] || !!((r = window.__hostHandlers) != null && r[n]);
  }
  return !1;
}
async function ft(e, r) {
  var o;
  const n = h.child("runner");
  n.debug("handleHostCallAction_start", { action: e });
  const a = ke[e] ?? ((o = window.__hostHandlers) == null ? void 0 : o[e]);
  if (!a)
    return n.debug("handleHostCallAction_result", {
      action: e,
      status: "error",
      reason: "no_handler"
    }), {
      ok: !1,
      error: {
        message: `No handler registered for "${e}"`,
        code: "ENOHANDLER",
        category: "host"
      }
    };
  try {
    const i = await a(r);
    return n.debug("handleHostCallAction_result", { action: e, status: "ok" }), { ok: !0, value: i };
  } catch (i) {
    const s = i instanceof Error ? i.message : String(i);
    return n.debug("handleHostCallAction_result", {
      action: e,
      status: "error",
      error: s || String(i)
    }), {
      ok: !1,
      error: {
        message: s || String(i),
        code: "EHOSTCALL",
        category: "host"
      }
    };
  }
}
const _e = 3e4, gt = 300, Sr = 100, vr = 500, yt = 500, _t = 500;
function W(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e) ? e : {};
}
function z(e) {
  if (typeof e == "number" && Number.isFinite(e))
    return e;
  if (typeof e == "bigint") {
    const r = Number(e);
    return Number.isSafeInteger(r) ? r : null;
  }
  return null;
}
function Y(e) {
  if (Array.isArray(e)) {
    const a = e[0], o = z(a);
    if (o !== null) return o;
    const i = W(a);
    return z(i.id) ?? z(i.tabId) ?? z(i.tab_id);
  }
  const r = z(e);
  if (r !== null) return r;
  const n = W(e);
  return z(n.id) ?? z(n.tabId) ?? z(n.tab_id);
}
const xr = /* @__PURE__ */ new Map([
  ["tab_back", (e) => ({ tabId: e })],
  ["tab_unhover", (e) => ({ tabId: e })],
  ["tab_wait_for_load", (e) => ({ tabId: e })],
  ["tab_scroll", (e) => ({ tabId: e })],
  ["sidepanel_wait", (e) => ({ duration: e })]
]), Cr = /* @__PURE__ */ new Map([
  ["tab_create", (e) => ({ url: e })],
  ["page_new_tab", (e) => ({ url: e })],
  ["page_find", (e) => ({ selector: e })],
  ["sidepanel_press", (e) => ({ key: e })]
]), Tr = /* @__PURE__ */ new Map([
  ["tab_press", (e) => ({ tabId: e[0], key: e[1] })],
  ["tab_unhover", (e) => ({ tabId: e[0] })],
  [
    "tab_scroll",
    (e) => ({
      tabId: e[0],
      direction: e[1] ?? "down",
      amount: e[2] ?? gt
    })
  ],
  ["tab_back", (e) => ({ tabId: e[0] })],
  [
    "tab_wait_for_load",
    (e) => ({ tabId: e[0], timeout: e[1] ?? BigInt(_e) })
  ],
  ["tab_evaluate", (e) => ({ tabId: e[0], script: e[1] })],
  ["tab_fetch", (e) => ({ tabId: e[0], url: e[1], options: e[2] ?? {} })],
  ["tab_snapshot", (e) => ({ tabId: e[0], options: e[1] ?? {} })],
  ["tab_snapshot_text", (e) => ({ tabId: e[0], options: e[1] ?? {} })],
  ["tab_snapshot_data", (e) => ({ tabId: e[0], options: e[1] ?? {} })],
  [
    "page_wait_for",
    (e) => ({ selector: e[0], timeout: e[1] ?? BigInt(_e) })
  ],
  ["page_extract", (e) => ({ fields: e })],
  ["storage_get_many", (e) => ({ keys: e })],
  ["storage_delete_many", (e) => ({ keys: e })]
]);
function Rr(e, r) {
  if (r = se(r), typeof r == "string") {
    const n = Cr.get(e);
    if (n) return n(r);
  }
  if (typeof r == "number" || typeof r == "bigint") {
    const n = xr.get(e);
    if (n) return n(r);
  }
  if (Array.isArray(r)) {
    const n = Tr.get(e);
    if (n) return n(r);
  }
  return r;
}
function S(e) {
  if (!e.ok)
    throw I(
      e.error.message,
      e.error.code,
      e.error.category
    );
  return e.value;
}
function Ar(e, r) {
  if (!mt(e)) return r;
  const n = Array.isArray(r) ? r : [];
  return Me(e, n);
}
function Dr(e) {
  return {
    ok: !1,
    error: { message: `Unknown action: ${e}`, code: "E_UNKNOWN" }
  };
}
function Nr(e) {
  const r = e ?? Ne();
  if (r != null && r.aborted)
    throw new Error("Runner aborted: ExtensionSession stopped");
  return r ?? new AbortController().signal;
}
async function Or(e, r) {
  if (!ht(e.action))
    return { response: Dr(e.action) };
  if (e.action.startsWith("host_"))
    return { response: await ft(
      e.action.slice(5),
      e.params
    ), handler: "host" };
  const n = mt(e.action) ? Ar(e.action, e.params) : Rr(e.action, e.params);
  return { response: await C(
    e.action,
    n,
    e.call_id,
    e.runId,
    r
  ) };
}
function qr(e) {
  return h.child("runner").timer("command_dispatch", {
    action: e.action,
    commandId: e.call_id,
    runId: e.runId
  });
}
async function Mr(e, r) {
  const n = qr(e), { response: a, handler: o } = await Or(
    e,
    Nr(r)
  );
  return n({ ok: a.ok, ...o ? { handler: o } : {} }), a;
}
const je = 'input, textarea, select, button, a, [role="button"], [role="link"]', Pr = /* @__PURE__ */ new Set(["script", "style", "noscript", "template"]), wt = /* @__PURE__ */ new Set([
  "p",
  "span",
  "label",
  "footer",
  "header",
  "blockquote",
  "pre",
  "code",
  "figcaption",
  "td",
  "th",
  "li",
  "em",
  "strong",
  "small",
  "cite",
  "q",
  "mark",
  "time",
  "abbr",
  "dfn",
  "kbd",
  "samp",
  "var",
  "sub",
  "sup"
]);
function J(e) {
  const r = e.tagName.toLowerCase(), n = e.getAttribute("role");
  if (n) return n;
  if (r === "button" || r === "input" && e.type === "submit")
    return "button";
  if (r === "a") return "link";
  if (r === "input") {
    const a = e.type;
    if (a === "text" || a === "email" || a === "password" || a === "search")
      return "textbox";
    if (a === "checkbox") return "checkbox";
    if (a === "radio") return "radio";
    if (a === "submit" || a === "button") return "button";
  }
  return r === "textarea" ? "textbox" : r === "select" ? "combobox" : r === "img" ? "img" : r === "h1" || r === "h2" || r === "h3" || r === "h4" || r === "h5" || r === "h6" ? "heading" : r === "li" ? "listitem" : r === "ul" || r === "ol" ? "list" : r === "table" ? "table" : r === "tr" ? "row" : r === "td" || r === "th" ? "cell" : r === "nav" ? "navigation" : r === "main" ? "main" : r === "article" ? "article" : r === "section" ? "region" : r === "aside" ? "complementary" : r === "form" ? "form" : r === "dialog" || r === "modal" ? "dialog" : r === "figure" ? "figure" : r === "figcaption" ? "caption" : e.getAttribute("onclick") || e.onclick ? "button" : "generic";
}
function jr(e) {
  var r;
  for (const n of e.childNodes)
    if (n.nodeType === Node.TEXT_NODE && ((r = n.textContent) == null ? void 0 : r.trim()))
      return !0;
  return !1;
}
function Hr(e, r = 60) {
  var o, i;
  const n = [];
  for (const s of e.childNodes)
    if (s.nodeType === Node.TEXT_NODE) {
      const c = (o = s.textContent) == null ? void 0 : o.trim();
      c && n.push(c);
    }
  if (n.length > 0)
    return n.join(" ").slice(0, r);
  const a = (i = e.textContent) == null ? void 0 : i.trim();
  return a ? a.slice(0, r) : "";
}
function Ur(e) {
  let r = e;
  for (; r; ) {
    if (r.hidden || r.getAttribute("aria-hidden") === "true" || r.inert) return !0;
    const n = window.getComputedStyle(r);
    if (n.display === "none" || n.visibility === "hidden") return !0;
    r = r.parentElement;
  }
  return !1;
}
function Lr(e) {
  return Ur(e);
}
function Fr(e) {
  var s;
  const r = e.tagName.toLowerCase();
  if (Pr.has(r) || Lr(e)) return !1;
  const n = J(e);
  if (n === "presentation" || n === "none") return !1;
  if (n !== "generic") return !0;
  const a = e.getAttribute("aria-live");
  if (a && a !== "off") return !0;
  const o = e.getAttribute("role");
  return o === "status" || o === "alert" ? !0 : ((s = e.textContent) == null ? void 0 : s.trim()) || "" ? !!(wt.has(r) || jr(e)) : !1;
}
function kt(e) {
  var s, c, l;
  const r = e.getAttribute("aria-label");
  if (r) return r;
  const n = e.getAttribute("aria-labelledby");
  if (n) {
    const u = document.getElementById(n);
    if (u) return ((s = u.textContent) == null ? void 0 : s.slice(0, 60)) || "";
  }
  if (e.tagName.toLowerCase() === "img") {
    const u = e.getAttribute("alt");
    if (u) return u;
  }
  const o = e.title;
  if (o) return o;
  const i = J(e);
  if (i !== "generic" && i !== "list" && i !== "table" && i !== "row" && i !== "region" && i !== "navigation" && i !== "main")
    return ((c = e.textContent) == null ? void 0 : c.trim().slice(0, 60)) || "";
  if (i === "generic" && Fr(e)) {
    const u = Hr(e);
    if (u) return u;
    const m = e.tagName.toLowerCase();
    if (wt.has(m) || e.childElementCount === 0)
      return ((l = e.textContent) == null ? void 0 : l.trim().slice(0, 60)) || "";
  }
  return "";
}
let xe = null;
function Et() {
  return xe || (xe = Qt()), xe ?? Promise.resolve();
}
async function Ee(e) {
  const r = h.child("runner");
  r.debug("handleDomSnapshot_start", {
    interactive_only: e == null ? void 0 : e.interactive_only,
    max_nodes: e == null ? void 0 : e.max_nodes
  });
  try {
    if (await Et(), typeof document > "u" || !document.body)
      return {
        ok: !1,
        error: {
          message: "Document body not available for snapshot",
          code: "E_SNAPSHOT",
          category: "resource"
        }
      };
    const n = {};
    e && (e.max_nodes != null && (n.maxNodes = Number(e.max_nodes)), e.interactive_only != null && (n.interactiveOnly = e.interactive_only));
    const a = zt(n), o = Ve(a, "compact-text");
    return r.debug("handleDomSnapshot_result", { status: "ok" }), {
      ok: !0,
      value: { data: a, text: o }
    };
  } catch (n) {
    const a = n instanceof Error ? n.message : String(n);
    return r.debug("handleDomSnapshot_result", {
      status: "error",
      error: a || String(n)
    }), {
      ok: !1,
      error: { message: a || String(n), code: "E_SNAPSHOT" }
    };
  }
}
async function Wr(e) {
  const r = h.child("runner");
  r.debug("handleDomFormat_start", { format: e.format });
  try {
    await Et();
    const { snapshot: n, format: a } = e, o = Ve(n, a);
    return r.debug("handleDomFormat_result", { status: "ok" }), { ok: !0, value: o };
  } catch (n) {
    const a = n instanceof Error ? n.message : String(n);
    return r.debug("handleDomFormat_result", {
      status: "error",
      error: a || String(n)
    }), {
      ok: !1,
      error: { message: a || String(n), code: "E_FORMAT" }
    };
  }
}
const $e = 8 * 1024;
function Gr(e) {
  let r = "";
  for (let n = 0; n < e.length; n += $e) {
    const a = e.subarray(n, n + $e);
    for (let o = 0; o < a.length; o++)
      r += String.fromCharCode(a[o]);
  }
  return btoa(r);
}
function Br(e) {
  return e.toLowerCase().split(";")[0].trim();
}
function $r(e) {
  return e.startsWith("image/") || e.startsWith("audio/") || e.startsWith("video/") || e === "application/octet-stream" || e === "application/pdf" || e === "application/zip" || e === "application/gzip" || e === "application/x-gzip" || e === "application/x-zip-compressed" ? !0 : e.startsWith("application/vnd.");
}
function Kr(e) {
  for (let r = 0; r < e.length; r++)
    if (e[r] === 0) return !0;
  return !1;
}
function It(e) {
  return Object.fromEntries(e.headers.entries());
}
function Ke(e, r, n) {
  return {
    status: e.status,
    ok: e.ok,
    headers: It(e),
    body: Gr(r),
    bodyEncoding: "base64",
    byteLength: r.length,
    contentType: n,
    finalUrl: e.url
  };
}
function Ze(e, r, n) {
  return {
    status: e.status,
    ok: e.ok,
    headers: It(e),
    body: r,
    bodyEncoding: "text",
    byteLength: new TextEncoder().encode(r).length,
    contentType: n,
    finalUrl: e.url
  };
}
async function Zr(e) {
  const r = e.headers.get("content-type") || "", n = Br(r);
  if ($r(n)) {
    const o = new Uint8Array(await e.arrayBuffer());
    return Ke(e, o, r);
  }
  if (!n || n.startsWith("text/")) {
    const o = new Uint8Array(await e.arrayBuffer());
    if (Kr(o))
      return Ke(e, o, r);
    const i = new TextDecoder().decode(o);
    return Ze(e, i, r);
  }
  const a = await e.text();
  return Ze(e, a, r);
}
async function Vr(e) {
  X();
  const { url: r, method: n, headers: a, body: o, timeout: i } = e;
  try {
    const s = new AbortController(), c = setTimeout(
      () => s.abort(),
      Number(i) ?? _e
    ), l = {
      method: n || "GET",
      headers: typeof a == "object" && a !== null ? a : {},
      signal: s.signal
    };
    o != null && (l.body = typeof o == "string" ? o : String(o));
    const u = await fetch(r, l);
    return clearTimeout(c), { ok: !0, value: await Zr(u) };
  } catch (s) {
    return s instanceof Error && s.name === "AbortError" ? {
      ok: !1,
      error: {
        message: `Request timed out after ${i || 3e4}ms`,
        code: "ETIMEDOUT",
        category: "timeout"
      }
    } : {
      ok: !1,
      error: {
        message: (s instanceof Error ? s.message : String(s)) || String(s),
        code: "E_UNKNOWN",
        category: "network"
      }
    };
  }
}
const j = () => t.union([t.bigint(), t.number().finite()]).transform((e) => BigInt(e)), zr = t.object({
  key: t.string().describe("Storage key to retrieve")
}), Qr = t.object({
  key: t.string().describe("Storage key to set"),
  value: t.string().describe("Value to store")
}), Xr = t.object({
  key: t.string().describe("Storage key to delete")
}), Jr = t.object({}), Yr = t.object({
  items: t.record(t.string()).describe("Record of key-value string pairs to store")
}), en = t.preprocess((e) => e !== null && typeof e == "object" && !Array.isArray(e) && !("items" in e) ? { items: e } : e, Yr), tn = t.object({
  keys: t.array(t.string()).describe("Array of storage keys to retrieve"),
  defaults: t.record(t.string()).optional().describe("Default string values for missing keys")
}), rn = t.preprocess(
  (e) => Array.isArray(e) ? { keys: e } : e,
  tn
), nn = t.object({}), an = t.object({
  keys: t.array(t.string()).describe("Array of storage keys to delete")
}), on = t.preprocess(
  (e) => Array.isArray(e) ? { keys: e } : e,
  an
), sn = t.object({}), cn = t.object({}), ln = t.union([
  t.tuple([t.union([t.object({ text: t.string() }), t.string()])]),
  t.object({ text: t.string().optional(), value: t.string().optional() })
]), St = t.object({
  url: t.string().describe("URL to fetch"),
  method: t.string().default("GET").describe("HTTP method (GET, POST, PUT, DELETE, etc.)"),
  headers: t.record(t.string()).default({}).describe("Request headers as key-value pairs"),
  body: t.string().nullable().default(null).describe("Request body string"),
  timeout: j().default(30000n).describe("Timeout in milliseconds"),
  store: t.boolean().optional().describe(
    "When true, store binary responses as a handle instead of returning body bytes"
  ),
  options: t.object({}).passthrough().optional().describe("Fetch options")
}).passthrough(), dn = t.object({
  duration: j().describe("Duration to sleep in milliseconds")
}), P = () => t.string().regex(/^e\d+$/), un = 'use { refId: "e2" } or { label: "..." } object form, not positional arguments', He = (e, r) => {
  if (e.__invalidPositional !== void 0) {
    r.addIssue({
      code: t.ZodIssueCode.custom,
      message: un
    });
    return;
  }
  !e.refId && !e.label && r.addIssue({
    code: t.ZodIssueCode.custom,
    message: "Either refId or label is required"
  });
}, vt = (e, r) => {
  e.x !== void 0 || e.y !== void 0 || He(e, r);
}, R = (e) => t.preprocess(
  (r) => typeof r == "string" || typeof r == "number" ? { __invalidPositional: r } : r,
  t.object({
    __invalidPositional: t.union([t.string(), t.number()]).optional().describe("Internal flag for positional argument rejection"),
    refId: P().optional().describe("Element reference ID (e.g. e2)"),
    label: t.string().optional().describe("Human-readable element label"),
    ...e
  }).superRefine(He)
), ce = {
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID")
}, V = (e) => t.preprocess(
  (r) => typeof r == "string" || typeof r == "number" ? { __invalidPositional: r } : r,
  t.object({
    __invalidPositional: t.union([t.string(), t.number()]).optional().describe("Internal flag for positional argument rejection"),
    ...ce,
    refId: P().optional().describe("Element reference ID (e.g. e2)"),
    label: t.string().optional().describe("Human-readable element label"),
    ...e
  }).superRefine(He)
), mn = t.object({}), pn = t.object({}), bn = t.object({
  url: t.string().describe("URL to navigate to"),
  timeout: j().optional().describe("Navigation timeout in milliseconds"),
  waitUntil: t.enum(["load", "networkidle"]).optional().describe(
    "When to consider navigation complete: 'load' (tab status complete) or 'networkidle' (no in-flight requests for 500ms)"
  )
}), hn = t.object({}), fn = t.object({}), gn = t.object({}), yn = t.object({
  duration: j().default(1000n).describe("Duration to wait in milliseconds")
}), _n = R(), wn = (e, r) => {
  [e.url, e.path, e.handle].filter(
    (a) => typeof a == "string" && a.length > 0
  ).length !== 1 && r.addIssue({
    code: t.ZodIssueCode.custom,
    message: "Each file entry requires exactly one of url, path, or handle"
  });
}, xt = t.object({
  name: t.string().optional().describe("File name including extension"),
  mimeType: t.string().optional().describe("MIME type (defaults to application/octet-stream)"),
  url: t.string().url().optional().describe("HTTP(S) URL to fetch in the target tab"),
  path: t.string().min(1).optional().describe("Virtual filesystem path (resolved in worker)"),
  handle: t.string().min(1).optional().describe("Binary handle from page.fetch({ store: true })")
}).superRefine(wn), Ct = t.discriminatedUnion("kind", [
  t.object({
    kind: t.literal("bytes"),
    name: t.string().min(1),
    data: t.string().min(1),
    mimeType: t.string().optional()
  }),
  t.object({
    kind: t.literal("url"),
    url: t.string().url(),
    name: t.string().min(1),
    mimeType: t.string().optional()
  })
]), kn = R({
  value: t.string().describe("Value to fill into the element")
}), En = R({
  files: t.array(xt).min(1).describe("Files to attach to the input")
});
R({
  files: t.array(Ct).min(1).describe("Resolved files for content-script application")
});
const In = R({
  text: t.string().describe("Text to type into the element")
}), Sn = R({
  text: t.string().describe("Text to append into the element")
}), vn = t.object({
  key: t.string().describe("Key to press (e.g. Enter, Escape, ArrowDown)")
}), xn = R({
  value: t.string().describe("Value to select in the dropdown")
}), Cn = R({
  checked: t.boolean().optional().describe("Desired checked state (true to check, false to uncheck)")
}), Tn = R(), Rn = t.object({}), An = t.object({
  direction: t.string().default("down").describe("Scroll direction: up, down, left, or right"),
  amount: t.number().default(300).describe("Pixels to scroll")
}), Dn = t.preprocess(
  (e) => typeof e == "string" || typeof e == "number" ? { __invalidPositional: e } : e,
  t.object({
    __invalidPositional: t.union([t.string(), t.number()]).optional().describe("Internal flag for positional argument rejection"),
    refId: P().optional().describe("Element reference ID (e.g. e2)"),
    label: t.string().optional().describe("Human-readable element label"),
    x: t.number().optional().describe("X coordinate to scroll to"),
    y: t.number().optional().describe("Y coordinate to scroll to")
  }).superRefine(vt)
), Nn = R(), On = t.object({
  selector: t.string().describe("CSS selector to find elements")
}), qn = t.object({
  selector: t.string().describe("CSS selector for the root element(s) to introspect"),
  depth: t.number().int().min(0).max(10).default(2).describe("How many descendant levels to include (0 = root only)"),
  includeHidden: t.boolean().default(!0).describe(
    "Include elements hidden by CSS/aria (default true — this tool's purpose is to see what the curated snapshot filters out)"
  )
}), Mn = t.object({
  selector: t.string().describe("CSS selector to wait for"),
  timeout: j().default(30000n).describe("Timeout in milliseconds")
}), Pn = t.object({
  fields: t.array(t.string()).describe("Array of field names to extract")
}), jn = t.preprocess(
  (e) => Array.isArray(e) ? { fields: e } : e,
  Pn
), Hn = t.union([
  t.number(),
  t.array(t.object({}).passthrough()),
  t.object({}).passthrough()
]), Un = t.object({}), Ln = t.object({
  active: t.boolean().optional().describe("Whether the tabs are active"),
  currentWindow: t.boolean().optional().describe("Whether the tabs are in the current window"),
  url: t.string().optional().describe("URL pattern to match tabs against")
}).passthrough(), Ue = Ln, Tt = t.preprocess(
  (e) => typeof e == "string" ? { url: e } : e,
  t.object({
    url: t.string().optional().describe("URL to open in the new tab"),
    active: t.boolean().optional().describe("Whether to focus the new tab")
  })
), Rt = t.union([
  t.number(),
  t.array(
    t.object({
      id: t.number().optional(),
      tabId: t.number().optional(),
      tab_id: t.number().optional()
    }).passthrough()
  ),
  t.object({
    id: t.number().optional(),
    tabId: t.number().optional(),
    tab_id: t.number().optional()
  }).passthrough()
]), At = Rt, Fn = Rt, Wn = V(), Gn = V({
  value: t.string().describe("Value to fill into the element")
}), Bn = V({
  files: t.array(xt).min(1).describe("Files to attach to the input")
});
V({
  files: t.array(Ct).min(1).describe("Resolved files for content-script application")
});
const $n = t.preprocess(
  (e) => typeof e == "string" || typeof e == "number" ? { __invalidPositional: e } : e,
  t.object({
    __invalidPositional: t.union([t.string(), t.number()]).optional().describe("Internal flag for positional argument rejection"),
    ...ce,
    refId: P().optional().describe("Element reference ID (e.g. e2)"),
    label: t.string().optional().describe("Human-readable element label"),
    x: t.number().optional().describe("X coordinate to scroll to"),
    y: t.number().optional().describe("Y coordinate to scroll to")
  }).superRefine(vt)
), Kn = V({
  text: t.string().describe("Text to type into the element")
}), Zn = t.object({
  ...ce,
  key: t.string().describe("Key to press (e.g. Enter, Escape, ArrowDown)")
}), Vn = V({
  value: t.string().describe("Value to select in the dropdown")
}), zn = V({
  checked: t.boolean().optional().describe("Desired checked state (true to check, false to uncheck)")
}), Qn = V(), Xn = t.object({
  ...ce
}), Jn = t.object({
  ...ce,
  direction: t.string().default("down").describe("Scroll direction: up, down, left, or right"),
  amount: t.number().default(300).describe("Pixels to scroll")
}), Yn = V(), ea = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID"),
  script: t.string().optional().describe("Script to evaluate"),
  code: t.string().optional().describe("Alternative script code"),
  js: t.string().optional().describe("Alternative JS code")
}).passthrough(), ta = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID")
}).passthrough(), ra = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID")
}).passthrough(), na = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID"),
  timeout: t.number().optional().describe("Timeout in milliseconds")
}).passthrough(), aa = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID"),
  url: t.string().optional().describe("URL to fetch"),
  options: t.object({}).passthrough().optional().describe("Fetch options")
}).passthrough(), oa = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID"),
  max_nodes: t.number().optional().describe("Maximum nodes to include"),
  options: t.object({}).passthrough().optional().describe("Snapshot options")
}).passthrough(), ia = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID"),
  max_nodes: t.number().optional().describe("Maximum nodes to include"),
  options: t.object({}).passthrough().optional().describe("Snapshot options")
}).passthrough(), sa = t.object({
  tabId: t.union([t.number(), t.bigint()]).optional().describe("Target tab ID"),
  max_nodes: t.number().optional().describe("Maximum nodes to include"),
  options: t.object({}).passthrough().optional().describe("Snapshot options")
}).passthrough(), ca = R(), la = R(), da = R({
  value: t.string().optional().describe("Value to fill into the element")
}), ua = R({
  text: t.string().optional().describe("Text to type into the element")
}), ma = t.object({
  key: t.string().optional().describe("Key to press (e.g. Enter, Escape, ArrowDown)")
}), pa = R({
  value: t.string().optional().describe("Value to select in the dropdown")
}), ba = R({
  checked: t.boolean().optional().describe("Desired checked state (true to check, false to uncheck)")
}), ha = R(), fa = t.object({}), ga = t.object({
  direction: t.string().optional().describe("Scroll direction: up, down, left, or right"),
  amount: t.number().optional().describe("Pixels to scroll")
}), ya = R(), _a = R({
  text: t.string().optional().describe("Text to append into the element")
}), wa = t.object({}), ka = t.object({}), Ea = t.object({
  duration: j().default(1000n).describe("Duration to wait in milliseconds")
}), Ia = t.object({
  interactive_only: t.boolean().default(!1).describe("Only include interactive elements"),
  max_nodes: j().default(500n).describe("Maximum number of nodes to include in snapshot")
}), Sa = t.object({
  interactive_only: t.boolean().default(!1).describe("Only include interactive elements"),
  max_nodes: j().default(500n).describe("Maximum number of nodes to include in snapshot")
}), va = t.object({
  interactive_only: t.boolean().default(!1).describe("Only include interactive elements"),
  max_nodes: j().default(500n).describe("Maximum number of nodes to include in snapshot")
}), xa = t.object({
  interactive_only: t.boolean().default(!1).describe("Only include interactive elements"),
  max_nodes: j().default(500n).describe("Maximum number of nodes to include in snapshot")
}), Ca = t.object({
  snapshot: t.object({}).passthrough().describe("Raw DOM snapshot data to format"),
  format: t.string().optional().describe("Output format (e.g. markdown, html)")
}), Ta = t.object({
  max_nodes: t.number().optional().describe("Maximum nodes to include"),
  options: t.object({}).passthrough().optional().describe("Snapshot options")
}).passthrough(), Ra = t.object({
  max_nodes: t.number().optional().describe("Maximum nodes to include"),
  options: t.object({}).passthrough().optional().describe("Snapshot options")
}).passthrough(), Aa = t.object({
  max_nodes: t.number().optional().describe("Maximum nodes to include"),
  options: t.object({}).passthrough().optional().describe("Snapshot options")
}).passthrough(), Da = t.object({
  role: t.union([t.string(), t.array(t.string())]).optional().describe("Filter by ARIA role"),
  tag: t.union([t.string(), t.array(t.string())]).optional().describe("Filter by HTML tag"),
  text: t.string().optional().describe("Filter by text content (case-insensitive substring)"),
  name: t.string().optional().describe("Filter by accessible name (case-insensitive substring)"),
  interactiveOnly: t.boolean().optional().describe("Only include interactive elements"),
  href: t.string().optional().describe("Filter by href pattern (case-insensitive substring)"),
  src: t.string().optional().describe("Filter by src pattern (case-insensitive substring)"),
  limit: t.number().positive().optional().describe("Maximum filtered nodes to return")
}).passthrough(), Dt = t.object({
  filter: Da.optional().describe(
    "Semantic filter criteria"
  ),
  max_nodes: t.number().optional().describe("Maximum nodes to collect before filtering")
}).passthrough(), Na = Dt.extend({
  tabId: t.number().describe("Tab ID")
});
t.object({
  path: t.string().describe("File or directory path")
});
t.object({
  from: t.string().describe("Source path"),
  to: t.string().describe("Destination path")
});
t.object({
  path: t.string().describe("File path to write to"),
  data: t.string().describe("Data to write")
});
t.object({
  path: t.string().describe("File path to read from"),
  offset: j().describe("Byte offset to start reading"),
  len: t.number().describe("Number of bytes to read")
});
t.object({
  path: t.string().describe("File path to update"),
  offset: j().describe("Byte offset to start writing"),
  data: t.string().describe("Data to write")
});
t.object({
  path: t.string().describe("File path to hash"),
  algo: t.string().default("sha256").describe("Hash algorithm (e.g. sha256, md5)")
});
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.number(),
  t.record(t.unknown())
]);
const Oa = t.union([
  t.number(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.string(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(
  t.unknown()
);
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.string(),
  t.number(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.array(t.unknown());
t.union([
  t.string(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.union([
  t.string(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.union([
  t.string(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.union([
  t.string(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.record(
  t.unknown()
);
t.union([
  t.string(),
  t.number(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.union([
  t.number(),
  t.record(t.unknown())
]);
t.record(t.unknown());
t.record(t.unknown());
t.record(t.unknown());
const qa = t.object({
  action: t.string().describe("Host action name"),
  params: t.object({}).passthrough().optional().describe("Parameters for the host action")
}).passthrough(), Nt = t.union([
  t.string(),
  t.number(),
  t.boolean(),
  t.null(),
  t.array(t.unknown()),
  t.record(t.unknown())
]), Ma = Nt, _ = t.object({
  ok: t.literal(!0).describe("Whether the action succeeded"),
  action: t.string().describe("Action identifier (e.g. 'page_fill')"),
  refId: P().optional().describe("Element reference ID that was acted upon (e.g. e2)"),
  tag: t.string().optional().describe("HTML tag name of the element"),
  role: t.string().optional().describe("ARIA role of the element"),
  name: t.string().optional().describe("Accessible name of the element"),
  value: t.string().optional().describe("Final value of the element after the action"),
  checked: t.boolean().optional().describe("Checked state after the action"),
  disabled: t.boolean().optional().describe("Whether the element is disabled"),
  readOnly: t.boolean().optional().describe("Whether the element is read-only"),
  text: t.string().optional().describe("Text content of the element"),
  key: t.string().optional().describe("Key that was pressed (for press actions)"),
  direction: t.string().optional().describe("Scroll direction (for scroll actions)"),
  amount: t.number().optional().describe("Scroll amount in pixels (for scroll actions)"),
  fileCount: t.number().optional().describe("Number of files attached (for setFiles actions)"),
  fileNames: t.array(t.string()).optional().describe("Names of attached files (for setFiles actions)"),
  observationId: t.string().optional().describe(
    "Opaque ID of the observation lease authorizing this action (snapshot-scoped)"
  ),
  dispatched: t.literal(!0).optional().describe(
    "True if the action was dispatched to the DOM. Does NOT prove the application accepted it."
  ),
  verification: t.literal("required").optional().describe(
    "Always 'required': a fresh observation is required to verify the effect."
  )
});
t.union([_, t.null()]);
const Re = t.object({
  status: t.number().describe("HTTP response status code"),
  ok: t.boolean().describe("Whether the response status is 2xx"),
  headers: t.record(t.string()).describe("Response headers as key-value pairs"),
  body: t.string().optional().describe("Response body (omitted when bodyEncoding is handle)"),
  bodyEncoding: t.enum(["text", "base64", "handle"]).describe("Encoding of the body field"),
  handle: t.string().optional().describe("Binary handle when bodyEncoding is handle"),
  byteLength: t.number().describe("Length of the body in bytes"),
  contentType: t.string().describe("Response Content-Type header"),
  finalUrl: t.string().describe("Final URL after redirects")
}), Ot = t.object({
  data: t.object({}).passthrough().describe("Structured snapshot data"),
  text: t.string().describe("Plain text representation of the snapshot")
}), Pa = t.object({}), ja = t.object({
  tabId: t.number(),
  url: t.string(),
  title: t.string(),
  contentScript: t.enum(["connected", "missing"]),
  domApis: t.enum(["ok", "blocked"]),
  mutationsReady: t.boolean(),
  hint: t.string().optional(),
  recovery: t.array(t.string()).optional()
}), Ha = Nt, Ua = t.object({
  refId: P().describe("Element reference ID (e.g. e2)"),
  role: t.string().describe("ARIA role of the element"),
  tag: t.string().describe("HTML tag name"),
  name: t.string().optional().describe("Accessible name of the element"),
  text: t.string().optional().describe("Visible text content of the element"),
  value: t.string().optional().describe("Element value"),
  checked: t.boolean().optional().describe("Checked state"),
  disabled: t.boolean().optional().describe("Whether the element is disabled"),
  readOnly: t.boolean().optional().describe("Whether the element is read-only"),
  href: t.string().optional().describe("Absolute URL for link elements"),
  src: t.string().optional().describe("Absolute URL for image elements"),
  alt: t.string().optional().describe("Alternative text for image elements"),
  title: t.string().optional().describe("Title attribute"),
  parentRefId: P().optional().describe("Reference ID of the parent container element"),
  postId: t.string().optional().describe("Stable post identifier from data-post-id attribute"),
  permalink: t.string().optional().describe("Stable permalink URL from anchor element"),
  imageUrls: t.array(t.string()).optional().describe("Image URLs contained within this element")
}), me = t.object({
  text: t.string().describe("Plain text representation of the page"),
  nodes: t.array(Ua).describe("Array of interactive nodes"),
  url: t.string().describe("Current page URL"),
  title: t.string().describe("Current page title"),
  viewport: t.object({
    width: t.number().describe("Viewport width in pixels"),
    height: t.number().describe("Viewport height in pixels")
  }).describe("Viewport dimensions"),
  observationId: t.string().optional().describe(
    "Opaque ID of the observation lease granted by this snapshot. Pass to subsequent actions to prove they act on fresh observations."
  )
}), qt = t.object({
  refId: P().optional(),
  tag: t.string(),
  role: t.string().optional(),
  name: t.string().optional(),
  text: t.string().optional(),
  attributes: t.record(t.string()).optional().describe("All HTML attributes (raw)"),
  hidden: t.boolean().optional(),
  hiddenReason: t.enum([
    "display-none",
    "visibility-hidden",
    "aria-hidden",
    "opacity-zero",
    "hidden-attr",
    "inert"
  ]).optional(),
  value: t.string().optional(),
  checked: t.boolean().optional(),
  disabled: t.boolean().optional(),
  readOnly: t.boolean().optional(),
  href: t.string().optional(),
  src: t.string().optional(),
  alt: t.string().optional(),
  accept: t.string().optional().describe("For input[type=file]: accepted MIME/extensions"),
  filesCount: t.number().optional().describe("For input[type=file]: selected file count"),
  children: t.array(t.lazy(() => qt)).optional().describe("Nested descendants up to `depth`")
}), La = t.object({
  nodes: t.array(qt),
  url: t.string(),
  title: t.string()
}), O = t.object({
  id: t.number().optional().describe("Tab ID"),
  tabId: t.number().optional().describe("Tab ID (added by runner)"),
  index: t.number().optional().describe("Tab index in the window"),
  windowId: t.number().optional().describe("Window ID"),
  url: t.string().optional().describe("Tab URL"),
  title: t.string().optional().describe("Tab title"),
  status: t.string().optional().describe("Tab status (loading or complete)"),
  active: t.boolean().optional().describe("Whether the tab is active"),
  pinned: t.boolean().optional().describe("Whether the tab is pinned"),
  highlighted: t.boolean().optional().describe("Whether the tab is highlighted"),
  incognito: t.boolean().optional().describe("Whether the tab is incognito"),
  favIconUrl: t.string().optional().describe("Favicon URL"),
  audible: t.boolean().optional().describe("Whether the tab is audible"),
  groupId: t.number().optional().describe("Group ID"),
  openerTabId: t.number().optional().describe("Opener tab ID"),
  discarded: t.boolean().optional().describe("Whether the tab is discarded"),
  autoDiscardable: t.boolean().optional().describe("Whether the tab is auto-discardable"),
  width: t.number().optional().describe("Tab width"),
  height: t.number().optional().describe("Tab height"),
  sessionId: t.string().optional().describe("Session ID")
}).passthrough(), ee = t.array(O), le = t.object({
  id: t.number().optional().describe("Window ID"),
  focused: t.boolean().optional().describe("Whether the window is focused"),
  top: t.number().optional().describe("Window top position"),
  left: t.number().optional().describe("Window left position"),
  width: t.number().optional().describe("Window width"),
  height: t.number().optional().describe("Window height"),
  tabs: ee.optional().describe(
    "Array of tabs in the window"
  ),
  incognito: t.boolean().optional().describe("Whether the window is incognito"),
  type: t.string().optional().describe("Window type"),
  state: t.string().optional().describe("Window state"),
  alwaysOnTop: t.boolean().optional().describe("Whether the window is always on top"),
  sessionId: t.string().optional().describe("Session ID")
}).passthrough(), Fa = t.array(le), de = t.object({
  name: t.string().describe("Cookie name"),
  value: t.string().describe("Cookie value"),
  domain: t.string().optional().describe("Cookie domain"),
  hostOnly: t.boolean().optional().describe("Whether the cookie is host-only"),
  path: t.string().optional().describe("Cookie path"),
  secure: t.boolean().optional().describe("Whether the cookie is secure"),
  httpOnly: t.boolean().optional().describe("Whether the cookie is HTTP-only"),
  sameSite: t.string().optional().describe("SameSite policy"),
  session: t.boolean().optional().describe("Whether the cookie is a session cookie"),
  expirationDate: t.number().optional().describe("Expiration date as Unix timestamp"),
  storeId: t.string().optional().describe("Store ID")
}).nullable(), Mt = t.array(
  de.nullable().unwrap()
), Wa = t.object({
  id: t.string().describe("Bookmark ID"),
  parentId: t.string().optional().describe("Parent folder ID"),
  index: t.number().optional().describe("Bookmark index"),
  url: t.string().optional().describe("Bookmark URL"),
  title: t.string().describe("Bookmark title"),
  dateAdded: t.number().optional().describe("Date added"),
  dateGroupModified: t.number().optional().describe("Date group modified"),
  children: t.array(t.object({ id: t.string() }).passthrough()).optional().describe("Child bookmarks")
}).passthrough(), ue = t.array(Wa), Ga = t.object({
  id: t.string().describe("History item ID"),
  url: t.string().optional().describe("URL"),
  title: t.string().optional().describe("Title"),
  lastVisitTime: t.number().optional().describe("Last visit time"),
  visitCount: t.number().optional().describe("Visit count"),
  typedCount: t.number().optional().describe("Typed count")
}).passthrough(), Le = t.array(Ga), Ba = t.object({
  frameId: t.number().describe("Frame ID"),
  result: t.unknown().optional().describe("Script result")
}), $a = t.array(Ba), Pt = t.string(), jt = t.boolean(), Ka = t.union([t.string(), t.number()]), Za = t.boolean(), Ie = t.object({
  id: t.number().optional().describe("Group ID"),
  collapsed: t.boolean().optional().describe("Whether the group is collapsed"),
  color: t.string().optional().describe("Group color"),
  title: t.string().optional().describe("Group title"),
  windowId: t.number().optional().describe("Window ID")
}).passthrough(), Va = t.array(Ie), za = t.object({
  lastModified: t.number().optional().describe("Last modified time"),
  tab: O.optional().describe("Tab info"),
  window: le.optional().describe("Window info")
}).passthrough(), Fe = t.array(za), Qa = t.object({
  deviceName: t.string().optional().describe("Device name"),
  sessions: Fe.optional().describe("Sessions")
}).passthrough(), Xa = t.array(Qa), Ja = t.object({
  id: t.number().optional().describe("Download ID"),
  url: t.string().optional().describe("Download URL"),
  filename: t.string().optional().describe("Filename"),
  startTime: t.string().optional().describe("Start time"),
  endTime: t.string().optional().describe("End time"),
  state: t.string().optional().describe("Download state"),
  danger: t.string().optional().describe("Danger type"),
  paused: t.boolean().optional().describe("Whether the download is paused"),
  error: t.string().optional().describe("Error message"),
  bytesReceived: t.number().optional().describe("Bytes received"),
  totalBytes: t.number().optional().describe("Total bytes"),
  fileSize: t.number().optional().describe("File size"),
  mime: t.string().optional().describe("MIME type"),
  incognito: t.boolean().optional().describe("Whether the download is incognito"),
  referrer: t.string().optional().describe("Referrer URL"),
  byExtensionId: t.string().optional().describe("Extension ID"),
  byExtensionName: t.string().optional().describe("Extension name")
}).passthrough(), Ht = t.array(Ja), Ya = t.number(), eo = t.object({
  archName: t.string().describe("CPU architecture"),
  modelName: t.string().describe("CPU model"),
  numOfProcessors: t.number().describe("Number of processors"),
  features: t.array(t.string()).describe("CPU features")
}), to = t.object({
  capacity: t.number().describe("Total memory capacity"),
  availableCapacity: t.number().describe("Available memory capacity")
}), ro = t.array(
  t.object({
    id: t.string().describe("Storage ID"),
    name: t.string().describe("Storage name"),
    type: t.string().describe("Storage type"),
    capacity: t.number().describe("Storage capacity")
  })
);
function B(e) {
  return document.querySelector(`[data-ref-id='${CSS.escape(e)}']`);
}
function no(e) {
  if (typeof e == "string")
    return P().safeParse(e).success ? e : void 0;
  const r = W(e), n = typeof r.refId == "string" ? r.refId : typeof r.ref_id == "string" ? r.ref_id : void 0;
  if (!(n && !P().safeParse(n).success))
    return n;
}
const ao = {
  message: "Content script error",
  code: "E_CONTENT_SCRIPT",
  category: "resource"
};
function oo(e, r = ao) {
  if (typeof e == "string")
    return {
      message: e || r.message,
      code: r.code,
      ...r.category ? { category: r.category } : {}
    };
  if (typeof e == "object" && e !== null) {
    const n = e, a = typeof n.message == "string" && n.message ? n.message : r.message, o = typeof n.code == "string" && n.code ? n.code : r.code, i = typeof n.category == "string" ? n.category : r.category, s = typeof n.hint == "string" ? n.hint : r.hint, c = Array.isArray(n.recovery) ? n.recovery : r.recovery, l = typeof n.details == "object" && n.details !== null ? n.details : r.details;
    return {
      message: a,
      code: o,
      ...i ? { category: i } : {},
      ...s ? { hint: s } : {},
      ...c != null && c.length ? { recovery: c } : {},
      ...l ? { details: l } : {}
    };
  }
  return { ...r };
}
function Ut(e) {
  return e && typeof e == "object" && e.ok === !1 ? {
    ok: !1,
    error: oo(e.error)
  } : { ok: !0, value: e && typeof e == "object" && "value" in e ? e.value : e };
}
function io(e) {
  return new Promise((r) => setTimeout(r, e));
}
async function Lt(e) {
  var n;
  X();
  const r = window.chrome;
  if (!((n = r == null ? void 0 : r.tabs) != null && n.get)) return null;
  try {
    const a = await r.tabs.get(e), o = a.url ?? "", i = a.title ?? "", s = `tab ${e} "${i}" (${o || "unknown url"})`;
    return !o.startsWith("http:") && !o.startsWith("https:") ? {
      ok: !1,
      error: {
        message: `Cannot use DOM APIs on ${s}. page.* and web.tab.* DOM operations require an http(s) page tab — use tabs.find(t => t.url?.startsWith("http")) instead of tabs[0].`,
        code: "E_PERMISSION",
        category: "permission"
      }
    } : null;
  } catch (a) {
    return we(a);
  }
}
async function We(e, r = 3e3) {
  var c;
  X();
  const n = h.child("runner");
  n.debug("pingTabContentScript_start", { tabId: e, timeout: r });
  const a = window.chrome;
  if (!((c = a == null ? void 0 : a.runtime) != null && c.id))
    return {
      ok: !1,
      error: {
        message: "Not in extension context",
        code: "E_NO_EXTENSION",
        category: "permission"
      }
    };
  const o = Date.now() + r;
  let i = "";
  for (; Date.now() < o; ) {
    X();
    const l = o - Date.now();
    if (l <= 0) break;
    try {
      const u = await Promise.race([
        a.tabs.sendMessage(e, { action: "ping" }),
        new Promise(
          (f, b) => setTimeout(
            () => b(new Error("Timeout waiting for content-script ping")),
            l
          )
        )
      ]), m = Ut(u);
      return m.ok ? (n.debug("pingTabContentScript_success", { tabId: e, result: u }), { ok: !0, value: { ok: !0 } }) : (n.debug("pingTabContentScript_rejected", {
        tabId: e,
        error: m.error
      }), m);
    } catch (u) {
      const m = (u instanceof Error ? u.message : String(u)) || "";
      if (i = m, n.debug("pingTabContentScript_retry", { tabId: e, error: m }), m.includes("Could not establish connection") || m.includes("Receiving end does not exist") || m.includes("message port closed before a response was received")) {
        await io(Math.min(Sr, o - Date.now()));
        continue;
      }
      if (m.includes("Timeout waiting for content-script ping"))
        break;
      return we(u);
    }
  }
  n.debug("pingTabContentScript_error", { tabId: e, error: i });
  let s = "";
  try {
    s = (await a.tabs.get(e)).url ?? "";
  } catch {
  }
  return {
    ok: !1,
    error: fe(e, s)
  };
}
async function Ft(e, r = 3e4, n) {
  var f;
  X();
  const a = h.child("runner"), o = typeof e == "number" ? e : null, i = n == null ? void 0 : n.preNavigationUrl, s = n == null ? void 0 : n.getNavSawLoading;
  a.debug("waitForTabLoad_start", {
    tabId: o,
    timeout: r,
    preNavigationUrl: i,
    runId: n == null ? void 0 : n.runId
  });
  const c = window.chrome;
  if (!((f = c == null ? void 0 : c.runtime) != null && f.id))
    return {
      ok: !1,
      error: {
        message: "Not in extension context",
        code: "E_NO_EXTENSION",
        category: "permission"
      }
    };
  if (o === null)
    return {
      ok: !1,
      error: {
        message: "tab_wait_for_load requires a valid tabId",
        code: "E_MISSING_PARAM"
      }
    };
  const l = (b, v) => {
    if (b.status !== "complete") return !1;
    if (i === void 0) return !0;
    const g = b.url !== i;
    return v || g;
  }, u = (b) => i !== void 0 && typeof b == "string" && b.length > 0 && b !== i, m = (n == null ? void 0 : n.loadGraceMs) ?? 5e3;
  try {
    return await new Promise((b, v) => {
      let g = !1, x = (s == null ? void 0 : s()) ?? !1, N = null;
      const A = () => {
        try {
          c.tabs.onUpdated.removeListener(Ge);
        } catch {
        }
        N && clearTimeout(N);
      }, E = (D) => {
        g || (g = !0, A(), D());
      }, re = () => {
        s != null && s() && (x = !0);
      }, q = (D) => {
        N || g || u(D) && (N = setTimeout(() => {
          a.debug("waitForTabLoad_grace_settle", {
            tabId: o,
            url: D,
            graceMs: m,
            runId: n == null ? void 0 : n.runId
          }), E(b);
        }, m));
      }, G = () => {
        re(), c.tabs.get(o).then((D) => {
          l(D, x) ? E(b) : q(D.url);
        }).catch(() => {
        });
      }, Ge = (D, ne) => {
        D === o && (ne.status === "loading" && (x = !0, a.debug("waitForTabLoad_status", {
          tabId: o,
          status: "loading",
          runId: n == null ? void 0 : n.runId
        })), ne.url && (a.debug("waitForTabLoad_status", {
          tabId: o,
          url: ne.url,
          runId: n == null ? void 0 : n.runId
        }), q(ne.url)), ne.status === "complete" && G());
      };
      c.tabs.onUpdated.addListener(Ge), c.tabs.get(o).then((D) => {
        re(), D.status === "loading" && (x = !0), a.debug("waitForTabLoad_initial_status", {
          tabId: o,
          status: D.status,
          url: D.url,
          runId: n == null ? void 0 : n.runId
        }), l(D, x) ? E(b) : q(D.url);
      }).catch((D) => {
        E(() => v(D));
      }), setTimeout(() => {
        E(() => v(new Error("Timeout waiting for tab load")));
      }, r);
    }), a.debug("waitForTabLoad_loaded", {
      tabId: o,
      status: "complete",
      runId: n == null ? void 0 : n.runId
    }), { ok: !0, value: !0 };
  } catch (b) {
    if (b instanceof Error && b.message === "Timeout waiting for tab load") {
      let v = "";
      try {
        v = (await c.tabs.get(o)).url || "";
      } catch {
      }
      const g = v || i || "unknown url";
      return a.warn("waitForTabLoad_timeout", {
        tabId: o,
        timeout: r,
        url: g,
        runId: n == null ? void 0 : n.runId
      }), {
        ok: !1,
        error: {
          message: `Navigation timeout waiting for tab ${o} (${g}) to load`,
          code: "E_NAVIGATION",
          category: "navigation"
        }
      };
    }
    return we(b);
  }
}
p({
  action: "storage_get",
  namespace: "storage",
  name: "get",
  description: "Get a value from localStorage",
  params: zr,
  returns: t.string().nullable(),
  fields: ["key"],
  aliases: [{ namespace: "web.storage", name: "get", fields: ["key"] }],
  owner: "main-thread",
  handler: async (e, r) => localStorage.getItem(e.key),
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: !0,
      description: "Storage key (literal)"
    }
  ],
  returnDoc: "Stored value or null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: 'storage.get("myKey")'
});
p({
  action: "storage_set",
  namespace: "storage",
  name: "set",
  description: "Set a value in localStorage",
  params: Qr,
  returns: t.null(),
  fields: ["key", "value"],
  aliases: [
    { namespace: "web.storage", name: "set", fields: ["key", "value"] }
  ],
  owner: "main-thread",
  handler: async (e, r) => (localStorage.setItem(e.key, e.value), null),
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: !0,
      description: "Storage key (literal)"
    },
    {
      name: "value",
      type: "string",
      required: !0,
      description: "Value to store (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: 'storage.set("myKey", "myValue")'
});
p({
  action: "storage_delete",
  namespace: "storage",
  name: "delete",
  description: "Delete a key from localStorage",
  params: Xr,
  returns: t.null(),
  fields: ["key"],
  aliases: [{ namespace: "web.storage", name: "delete", fields: ["key"] }],
  owner: "main-thread",
  handler: async (e, r) => (localStorage.removeItem(e.key), null),
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: !0,
      description: "Storage key (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: 'storage.delete("myKey")'
});
p({
  action: "storage_list",
  namespace: "storage",
  name: "list",
  description: "List all localStorage keys",
  params: Jr,
  returns: t.array(t.string()),
  aliases: [{ namespace: "web.storage", name: "list" }],
  owner: "main-thread",
  handler: async (e, r) => {
    const n = [];
    for (let a = 0; a < localStorage.length; a++) {
      const o = localStorage.key(a);
      o && n.push(o);
    }
    return n;
  },
  paramTypes: [],
  returnDoc: "Array of keys",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: "storage.list()"
});
p({
  action: "storage_set_many",
  namespace: "storage",
  name: "set_many",
  description: "Set multiple values in localStorage",
  params: en,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = W(e.items);
    for (const a of Object.keys(n)) {
      const o = n[a];
      localStorage.setItem(
        `__csl__:${a}`,
        o == null ? "null" : String(o)
      );
    }
    return null;
  },
  paramTypes: [
    {
      name: "items",
      type: "{ [key: string]: string }",
      required: !0,
      description: "Record of key-value pairs to set (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: 'storage.set_many({ key1: "val1", key2: "val2" })'
});
p({
  action: "storage_get_many",
  namespace: "storage",
  name: "get_many",
  description: "Get multiple values from localStorage",
  params: rn,
  returns: t.record(t.string().nullable()),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = e.keys, a = W(e.defaults ?? {}), o = {};
    for (const i of n) {
      const s = localStorage.getItem(`__csl__:${String(i)}`);
      o[String(i)] = s !== null ? s : a[String(i)] ?? null;
    }
    return o;
  },
  paramTypes: [
    {
      name: "keys",
      type: "array",
      required: !0,
      description: "Array of keys to retrieve (literal)"
    },
    {
      name: "defaults",
      type: "{ [key: string]: string }",
      required: !1,
      description: "Default values for missing keys (literal)"
    }
  ],
  returnDoc: "Record of values",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: 'storage.get_many(["key1", "key2"])'
});
p({
  action: "storage_get_all",
  namespace: "storage",
  name: "get_all",
  description: "Get all __csl__ values from localStorage",
  params: nn,
  returns: t.record(t.string().nullable()),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = {};
    for (let a = 0; a < localStorage.length; a++) {
      const o = localStorage.key(a);
      if (o != null && o.startsWith("__csl__:")) {
        const i = o.slice(8);
        n[i] = localStorage.getItem(o);
      }
    }
    return n;
  },
  paramTypes: [],
  returnDoc: "Record of values",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: "storage.get_all()"
});
p({
  action: "storage_delete_many",
  namespace: "storage",
  name: "delete_many",
  description: "Delete multiple keys from localStorage",
  params: on,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = e.keys;
    for (const a of n)
      localStorage.removeItem(`__csl__:${String(a)}`);
    return null;
  },
  paramTypes: [
    {
      name: "keys",
      type: "array",
      required: !0,
      description: "Array of keys to delete (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: 'storage.delete_many(["key1", "key2"])'
});
p({
  action: "storage_clear",
  namespace: "storage",
  name: "clear",
  description: "Clear all __csl__ keys from localStorage",
  params: sn,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = [];
    for (let a = 0; a < localStorage.length; a++) {
      const o = localStorage.key(a);
      o != null && o.startsWith("__csl__:") && n.push(o);
    }
    for (const a of n)
      localStorage.removeItem(a);
    return null;
  },
  paramTypes: [],
  returnDoc: "null",
  errorCode: "ESTORAGE",
  errorCategory: "storage",
  example: "storage.clear()"
});
const Wt = t.record(t.unknown());
d(
  "chrome_storage_local_set",
  "chrome",
  "Set extension local storage values",
  ["storage", "local"],
  t.null(),
  "ECHROME",
  "extension",
  [],
  'chrome.storage.local.set({ key: "value" })'
);
d(
  "chrome_storage_local_get",
  "chrome",
  "Get extension local storage values",
  ["storage", "local"],
  Wt,
  "ECHROME",
  "extension",
  [],
  'chrome.storage.local.get("key")'
);
d(
  "chrome_storage_local_remove",
  "chrome",
  "Remove extension local storage values",
  ["storage", "local"],
  t.null(),
  "ECHROME",
  "extension",
  [],
  'chrome.storage.local.remove("key")'
);
d(
  "chrome_storage_local_clear",
  "chrome",
  "Clear all extension local storage",
  ["storage", "local"],
  t.null(),
  "ECHROME",
  "extension",
  [],
  "chrome.storage.local.clear()"
);
d(
  "chrome_storage_sync_set",
  "chrome",
  "Set extension sync storage values",
  ["storage", "sync"],
  t.null(),
  "ECHROME",
  "extension",
  [],
  'chrome.storage.sync.set({ key: "value" })'
);
d(
  "chrome_storage_sync_get",
  "chrome",
  "Get extension sync storage values",
  ["storage", "sync"],
  Wt,
  "ECHROME",
  "extension",
  [],
  'chrome.storage.sync.get("key")'
);
d(
  "chrome_storage_sync_remove",
  "chrome",
  "Remove extension sync storage values",
  ["storage", "sync"],
  t.null(),
  "ECHROME",
  "extension",
  [],
  'chrome.storage.sync.remove("key")'
);
d(
  "chrome_storage_sync_clear",
  "chrome",
  "Clear all extension sync storage",
  ["storage", "sync"],
  t.null(),
  "ECHROME",
  "extension",
  [],
  "chrome.storage.sync.clear()"
);
p({
  action: "clipboard_read",
  namespace: "clipboard",
  name: "read",
  description: "Read text from clipboard",
  params: cn,
  returns: t.string(),
  aliases: [{ namespace: "web.clipboard", name: "read" }],
  owner: "main-thread",
  handler: async (e, r) => navigator.clipboard.readText(),
  paramTypes: [],
  returnDoc: "Clipboard text",
  errorCode: "ECLIPBOARD",
  errorCategory: "permission",
  example: 'clipboard.read({ text: "hello" })'
});
p({
  action: "clipboard_write",
  namespace: "clipboard",
  name: "write",
  description: "Write text to clipboard",
  params: ln,
  returns: t.null(),
  aliases: [{ namespace: "web.clipboard", name: "write", fields: ["text"] }],
  owner: "main-thread",
  handler: async (e, r) => {
    let n = "";
    if (Array.isArray(e)) {
      const a = e[0];
      typeof a == "object" && a !== null ? n = String(a.text ?? a) : n = String(a);
    } else {
      const a = W(e);
      n = a.text || a.value || "";
    }
    return await navigator.clipboard.writeText(n), null;
  },
  paramTypes: [
    {
      name: "text",
      type: "string",
      required: !1,
      description: "Text to write to clipboard (literal)"
    },
    {
      name: "value",
      type: "string",
      required: !1,
      description: "Alternative text value to write (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "ECLIPBOARD",
  errorCategory: "permission",
  example: 'clipboard.write("text")'
});
p({
  action: "fetch",
  namespace: "network",
  name: "fetch",
  description: "Make an HTTP request",
  params: St,
  returns: Re,
  fields: ["url"],
  aliases: [{ namespace: "web", name: "fetch", fields: ["url"] }],
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await Vr(e);
    return S(n);
  },
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: !0,
      description: "URL to fetch (url)"
    },
    {
      name: "method",
      type: "string",
      required: !1,
      description: "HTTP method (GET, POST, etc.) (literal)"
    },
    {
      name: "headers",
      type: "{ [key: string]: string }",
      required: !1,
      description: "Request headers (literal)"
    },
    {
      name: "body",
      type: "string",
      required: !1,
      description: "Request body (literal)"
    },
    {
      name: "timeout",
      type: "number",
      required: !1,
      description: "Timeout in milliseconds (literal)"
    }
  ],
  returnDoc: "DTO with `{ body, headers, ok, status }` — not a native Response object",
  errorCode: "E_UNKNOWN",
  errorCategory: "network",
  example: 'network.fetch("https://example.com")'
});
p({
  action: "sleep",
  namespace: "util",
  name: "sleep",
  description: "Sleep for a duration",
  params: dn,
  returns: t.null(),
  fields: ["duration"],
  aliases: [{ namespace: "web", name: "sleep", fields: ["duration"] }],
  owner: "main-thread",
  handler: async (e, r) => (await new Promise(
    (n) => setTimeout(n, Number(e.duration))
  ), null),
  paramTypes: [
    {
      name: "duration",
      type: "number",
      required: !0,
      description: "Duration to sleep in milliseconds (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: "util.sleep(1000)"
});
p({
  action: "mock_async",
  namespace: "util",
  name: "mock_async",
  description: "Mock async call for testing",
  params: t.union([
    t.string(),
    t.object({ label: t.string().optional() }).passthrough()
  ]),
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => typeof e == "string" ? e : e && typeof e == "object" && "label" in e ? e.label ?? "mock_async" : "mock_async",
  paramTypes: [
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Test label (label)"
    }
  ],
  returnDoc: "Label string",
  errorCode: "E_UNKNOWN",
  example: 'util.mock_async({ tabId: 123, script: "document.title" })'
});
const U = "Returns a Promise; await before reading the result. For a cell's last line, use `page.snapshot()` without a leading await so the cell returns the settled value.", Gt = [
  {
    action: "page_back",
    namespace: "page",
    name: "back",
    description: "Go back in the active tab",
    params: hn,
    returns: _,
    paramTypes: [],
    returnDoc: "Navigation result",
    errorCode: "E_NO_TAB",
    example: "page.back()",
    handlerKey: "back"
  },
  {
    action: "page_click",
    namespace: "page",
    name: "click",
    description: "Click an element in the active tab",
    params: _n,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label to click (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'click', refId? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.click({ refId: "e2" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        U,
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.click"]
    },
    handlerKey: "click"
  },
  {
    action: "page_fill",
    namespace: "page",
    name: "fill",
    description: "Fill an element in the active tab",
    params: kn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "value",
        type: "string",
        required: !1,
        description: "Value to fill (literal)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'fill', refId?, value? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.fill({ refId: "e2", value: "hello" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        U,
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.fill"]
    },
    handlerKey: "fill"
  },
  {
    action: "page_set_files",
    namespace: "page",
    name: "setFiles",
    description: "Attach files to a file input in the active tab",
    params: En,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      },
      {
        name: "files",
        type: "{ name?: string, url?: string, path?: string, handle?: string, mimeType?: string }[]",
        required: !0,
        description: "Each entry uses exactly one of url, path (vfs), or handle (from page.fetch store:true)"
      }
    ],
    returnDoc: "{ ok: true, action: 'setFiles', refId?, fileCount?, fileNames? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.setFiles({ refId: "e3", files: [{ url: "https://example.com/photo.jpg", name: "photo.jpg" }] })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        U,
        "Target must be input[type=file]; prefer url, vfs path, or fetch handle — bytes are not passed through QuickJS",
        "Use page.fetch({ url, store: true }) then setFiles({ files: [{ handle }] }) for downloaded binaries",
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.setFiles", "page.fetch", "fs.writeBase64"]
    },
    handlerKey: "set_files"
  },
  {
    action: "page_type",
    namespace: "page",
    name: "type",
    description: "Type into an element in the active tab",
    params: In,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "text",
        type: "string",
        required: !1,
        description: "Text to type (literal)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'type', refId?, value? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.type({ refId: "e2", text: "hello" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        U,
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.type"]
    },
    handlerKey: "type"
  },
  {
    action: "page_append",
    namespace: "page",
    name: "append",
    description: "Append text to an element in the active tab",
    params: Sn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "text",
        type: "string",
        required: !1,
        description: "Text to append (literal)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'append', refId?, value? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.append({ refId: "e2", text: " world" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"]
    },
    handlerKey: "append"
  },
  {
    action: "page_press",
    namespace: "page",
    name: "press",
    description: "Press a key in the active tab",
    params: vn,
    returns: _,
    fields: ["key"],
    paramTypes: [
      {
        name: "key",
        type: "string",
        required: !0,
        description: "Key to press (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'press', key? }",
    errorCode: "E_NO_TAB",
    example: 'page.press("Enter")',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.press"]
    },
    handlerKey: "press"
  },
  {
    action: "page_select",
    namespace: "page",
    name: "select",
    description: "Select an option in the active tab",
    params: xn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      },
      {
        name: "value",
        type: "string",
        required: !1,
        description: "Option value to select (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'select', refId?, value? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.select({ refId: "e2", value: "option1" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.select"]
    },
    handlerKey: "select"
  },
  {
    action: "page_check",
    namespace: "page",
    name: "check",
    description: "Check/uncheck an element in the active tab",
    params: Cn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      },
      {
        name: "checked",
        type: "boolean",
        required: !1,
        description: "Whether to check or uncheck (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'check', refId?, checked? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.check({ refId: "e2", checked: true })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.check"]
    },
    handlerKey: "check"
  },
  {
    action: "page_hover",
    namespace: "page",
    name: "hover",
    description: "Hover over an element in the active tab",
    params: Tn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'hover', refId? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.hover({ refId: "e2" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.hover"]
    },
    handlerKey: "hover"
  },
  {
    action: "page_unhover",
    namespace: "page",
    name: "unhover",
    description: "Unhover in the active tab",
    params: Rn,
    returns: _,
    paramTypes: [],
    returnDoc: "{ ok: true, action: 'unhover' }",
    errorCode: "E_NO_TAB",
    example: "page.unhover()",
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.unhover"]
    },
    handlerKey: "unhover"
  },
  {
    action: "page_scroll",
    namespace: "page",
    name: "scroll",
    description: "Scroll the active tab",
    params: An,
    returns: _,
    fields: ["direction", "amount"],
    paramTypes: [
      {
        name: "direction",
        type: "string",
        required: !1,
        description: "Scroll direction (up or down) (literal)"
      },
      {
        name: "amount",
        type: "number",
        required: !1,
        description: "Scroll amount in pixels (literal)"
      }
    ],
    returnDoc: "Scroll result",
    errorCode: "E_NO_TAB",
    example: 'page.scroll("down", 500)',
    handlerKey: "scroll"
  },
  {
    action: "page_scroll_to",
    namespace: "page",
    name: "scroll_to",
    description: "Scroll to an element in the active tab",
    params: Dn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID to scroll to (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label to scroll to (label)"
      }
    ],
    returnDoc: "Scroll to result",
    errorCode: "E_MISSING_PARAM",
    example: 'page.scroll_to({ refId: "e2" })',
    handlerKey: "scroll_to"
  },
  {
    action: "page_dblclick",
    namespace: "page",
    name: "dblclick",
    description: "Double-click an element in the active tab",
    params: Nn,
    returns: _,
    paramTypes: [
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'dblclick', refId? }",
    errorCode: "E_MISSING_PARAM",
    example: 'page.dblclick({ refId: "e2" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab is active and the content script is ready before mutating"
      ],
      notes: [
        "Same content-script path as web.tab.*",
        "Always operates on the active tab; use web.tab.* if you need to target a specific tabId"
      ],
      tags: ["mutation", "write"],
      relatedApis: ["web.tab.dblclick"]
    },
    handlerKey: "dblclick"
  },
  {
    action: "tab_click",
    namespace: "web.tab",
    name: "click",
    description: "Click in a tab",
    params: Wn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'click', refId? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.click({ tabId: 123, refId: "e2" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.click"]
    },
    handlerKey: "click"
  },
  {
    action: "tab_fill",
    namespace: "web.tab",
    name: "fill",
    description: "Fill in a tab",
    params: Gn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "value",
        type: "string",
        required: !1,
        description: "Value to fill (literal)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'fill', refId?, value? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.fill({ tabId: 123, refId: "e2", value: "hello" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.fill"]
    },
    handlerKey: "fill"
  },
  {
    action: "tab_set_files",
    namespace: "web.tab",
    name: "setFiles",
    description: "Attach files to a file input in a tab",
    params: Bn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      },
      {
        name: "files",
        type: "{ name?: string, url?: string, path?: string, handle?: string, mimeType?: string }[]",
        required: !0,
        description: "Each entry uses exactly one of url, path (vfs), or handle"
      }
    ],
    returnDoc: "{ ok: true, action: 'setFiles', refId?, fileCount?, fileNames? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.setFiles({ tabId: 123, refId: "e3", files: [{ url: "https://example.com/photo.jpg" }] })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.setFiles"]
    },
    handlerKey: "set_files"
  },
  {
    action: "tab_scroll_to",
    namespace: "web.tab",
    name: "scroll_to",
    description: "Scroll to position in a tab",
    params: $n,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "x",
        type: "number",
        required: !1,
        description: "X coordinate (literal)"
      },
      {
        name: "y",
        type: "number",
        required: !1,
        description: "Y coordinate (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "Scroll to result",
    errorCode: "E_NO_TAB",
    example: 'web.tab.scroll_to({ tabId: 123, refId: "e2" })',
    handlerKey: "scroll_to"
  },
  {
    action: "tab_type",
    namespace: "web.tab",
    name: "type",
    description: "Type in a tab",
    params: Kn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "text",
        type: "string",
        required: !1,
        description: "Text to type (literal)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'type', refId?, value? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.type({ tabId: 123, refId: "e2", text: "hello" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.type"]
    },
    handlerKey: "type"
  },
  {
    action: "tab_press",
    namespace: "web.tab",
    name: "press",
    description: "Press a key in a tab",
    params: Zn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "key",
        type: "string",
        required: !1,
        description: "Key to press (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'press', key? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.press({ tabId: 123, key: "Enter" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.press"]
    },
    handlerKey: "press"
  },
  {
    action: "tab_select",
    namespace: "web.tab",
    name: "select",
    description: "Select an option in a tab",
    params: Vn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      },
      {
        name: "value",
        type: "string",
        required: !1,
        description: "Option value to select (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'select', refId?, value? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.select({ tabId: 123, refId: "e2", value: "option1" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.select"]
    },
    handlerKey: "select"
  },
  {
    action: "tab_check",
    namespace: "web.tab",
    name: "check",
    description: "Check/uncheck in a tab",
    params: zn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      },
      {
        name: "checked",
        type: "boolean",
        required: !1,
        description: "Whether to check or uncheck (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'check', refId?, checked? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.check({ tabId: 123, refId: "e2", checked: true })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.check"]
    },
    handlerKey: "check"
  },
  {
    action: "tab_hover",
    namespace: "web.tab",
    name: "hover",
    description: "Hover in a tab",
    params: Qn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'hover', refId? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.hover({ tabId: 123, refId: "e2" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.hover"]
    },
    handlerKey: "hover"
  },
  {
    action: "tab_unhover",
    namespace: "web.tab",
    name: "unhover",
    description: "Unhover in a tab",
    params: Xn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      }
    ],
    returnDoc: "{ ok: true, action: 'unhover' }",
    errorCode: "E_NO_TAB",
    example: "web.tab.unhover({ tabId: 123 })",
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.unhover"]
    },
    handlerKey: "unhover"
  },
  {
    action: "tab_scroll",
    namespace: "web.tab",
    name: "scroll",
    description: "Scroll in a tab",
    params: Jn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "direction",
        type: "string",
        required: !1,
        description: "Scroll direction (up or down) (literal)"
      },
      {
        name: "amount",
        type: "number",
        required: !1,
        description: "Scroll amount in pixels (literal)"
      }
    ],
    returnDoc: "Scroll result",
    errorCode: "E_NO_TAB",
    example: 'web.tab.scroll({ tabId: 123, direction: "down", amount: 500 })',
    handlerKey: "scroll"
  },
  {
    action: "tab_dblclick",
    namespace: "web.tab",
    name: "dblclick",
    description: "Double-click in a tab",
    params: Yn,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "refId",
        type: "string",
        required: !1,
        description: "Element reference ID (refId)"
      },
      {
        name: "label",
        type: "string",
        required: !1,
        description: "Element label (label)"
      }
    ],
    returnDoc: "{ ok: true, action: 'dblclick', refId? }",
    errorCode: "E_NO_TAB",
    example: 'web.tab.dblclick({ tabId: 123, refId: "e2" })',
    agentMeta: {
      prerequisites: [
        "Ensure the target tab exists and the content script is ready before mutating"
      ],
      notes: ["Explicit tabId required; same handlers as page.*"],
      tags: ["mutation", "write"],
      relatedApis: ["page.dblclick"]
    },
    handlerKey: "dblclick"
  },
  {
    action: "tab_back",
    namespace: "web.tab",
    name: "back",
    description: "Go back in a tab",
    params: ta,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      }
    ],
    returnDoc: "Back result",
    errorCode: "E_NO_TAB",
    example: "web.tab.back({ tabId: 123 })",
    handlerKey: "back"
  },
  {
    action: "page_forward",
    namespace: "page",
    name: "forward",
    description: "Go forward in the active tab",
    params: fn,
    returns: _,
    paramTypes: [],
    returnDoc: "Navigation result",
    errorCode: "E_NO_TAB",
    example: "page.forward()",
    handlerKey: "forward"
  },
  {
    action: "page_snapshot",
    namespace: "page",
    name: "snapshot",
    description: "Capture full DOM snapshot",
    params: Ta,
    returns: t.string(),
    paramTypes: [
      {
        name: "max_nodes",
        type: "number",
        required: !1,
        description: "Maximum nodes to include (literal)"
      },
      {
        name: "options",
        type: "{ max_nodes?: number }",
        required: !1,
        description: "Snapshot options (literal)"
      }
    ],
    returnDoc: "Snapshot text",
    errorCode: "E_SNAPSHOT",
    example: "page.snapshot()",
    agentMeta: {
      notes: [
        U,
        "Content-script path; same refIds as mutations"
      ],
      tags: ["snapshot", "read"],
      relatedApis: ["page.snapshot_data", "web.tab.snapshot"]
    },
    handlerKey: "snapshot_text"
  },
  {
    action: "page_snapshot_text",
    namespace: "page",
    name: "snapshot_text",
    description: "Capture DOM snapshot and return text representation",
    params: Ra,
    returns: t.string(),
    paramTypes: [
      {
        name: "max_nodes",
        type: "number",
        required: !1,
        description: "Maximum nodes to include (literal)"
      }
    ],
    returnDoc: "Snapshot text",
    errorCode: "E_SNAPSHOT",
    example: "page.snapshot_text()",
    handlerKey: "snapshot_text"
  },
  {
    action: "page_snapshot_data",
    namespace: "page",
    name: "snapshot_data",
    description: "Get page snapshot data",
    params: Aa,
    returns: me,
    paramTypes: [
      {
        name: "max_nodes",
        type: "number",
        required: !1,
        description: "Maximum nodes to include (literal)"
      }
    ],
    returnDoc: "{ text, nodes, url, title, viewport }",
    errorCode: "E_SNAPSHOT",
    example: "page.snapshot_data()",
    agentMeta: {
      notes: [
        U,
        "Content-script path; nodes include refId for targeting",
        "After mutations, call snapshot_data() again to verify state"
      ],
      tags: ["snapshot", "read"],
      relatedApis: ["page.click", "web.tab.snapshot_data"]
    },
    handlerKey: "snapshot"
  },
  {
    action: "page_snapshot_query",
    namespace: "page",
    name: "snapshot_query",
    description: "Query page snapshot with semantic filtering by role, tag, text, name, etc.",
    params: Dt,
    returns: me,
    paramTypes: [
      {
        name: "filter",
        type: "{ role?: string | string[], tag?: string | string[], text?: string, name?: string, interactiveOnly?: boolean, href?: string, src?: string, limit?: number }",
        required: !1,
        description: "Semantic filter criteria (literal)"
      },
      {
        name: "max_nodes",
        type: "number",
        required: !1,
        description: "Maximum nodes to collect before filtering (literal)"
      }
    ],
    returnDoc: "{ text, nodes (filtered), url, title, viewport }",
    errorCode: "E_SNAPSHOT",
    example: 'page.snapshot_query({ filter: { role: "button" } })',
    agentMeta: {
      notes: [
        U,
        "Content-script path; filters nodes by role, tag, text, name, interactiveOnly, href, src",
        "More efficient than page.snapshot_data() when only specific elements are needed"
      ],
      tags: ["snapshot", "read"],
      relatedApis: ["page.snapshot_data", "page.find"]
    },
    handlerKey: "snapshot_query"
  },
  {
    action: "page_find",
    namespace: "page",
    name: "find",
    description: "Find elements in the active tab using a CSS selector",
    params: On,
    returns: t.array(
      t.object({
        refId: P(),
        role: t.string(),
        tag: t.string(),
        name: t.string().optional(),
        text: t.string().optional(),
        value: t.string().optional(),
        checked: t.boolean().optional(),
        disabled: t.boolean().optional(),
        readOnly: t.boolean().optional(),
        href: t.string().optional(),
        src: t.string().optional(),
        alt: t.string().optional(),
        title: t.string().optional(),
        parentRefId: P().optional()
      })
    ),
    aliases: [{ namespace: "page", name: "query" }],
    fields: ["selector"],
    paramTypes: [
      {
        name: "selector",
        type: "string",
        required: !0,
        description: "CSS selector to find elements (selector)"
      }
    ],
    returnDoc: "Array of elements with refId, role, name, href/src, alt, and parentRefId",
    errorCode: "E_NO_TAB",
    example: 'page.find("h1")',
    agentMeta: {
      notes: [
        "Assigns data-ref-id on matched elements when missing so results include actionable refIds"
      ],
      tags: ["read"]
    },
    handlerKey: "find"
  },
  {
    action: "page_dom",
    namespace: "page",
    name: "dom",
    description: "Introspect raw DOM subtree by CSS selector — bypasses the curated snapshot's visibility filter. Read-only. Use when page.snapshot/find hide the element you need (e.g. hidden file inputs, shadowed widgets, aria-hidden regions).",
    params: qn,
    returns: La,
    paramTypes: [
      {
        name: "selector",
        type: "string",
        required: !0,
        description: "CSS selector for root element(s)"
      },
      {
        name: "depth",
        type: "number",
        required: !1,
        description: "Descendant levels (default 2, max 10)"
      },
      {
        name: "includeHidden",
        type: "boolean",
        required: !1,
        description: "Include hidden elements (default true)"
      }
    ],
    returnDoc: "{ nodes: [{ refId?, tag, role?, name?, attributes?, hidden?, hiddenReason?, accept?, filesCount?, children? }], url, title }",
    errorCode: "E_NO_TAB",
    example: 'page.dom({ selector: "input[type=file]", depth: 0 })',
    agentMeta: {
      prerequisites: ["Active tab with content script ready"],
      notes: [
        U,
        "Read-only: returns DOM structure, never executes code or mutates the page",
        "Bypasses the snapshot visibility filter — use to find hidden/filtered elements the curated snapshot omits",
        "Assigns refIds to returned elements so subsequent page.setFiles/click/fill can target them",
        "Prefer page.snapshot for normal navigation; use page.dom only when the snapshot is insufficient"
      ],
      tags: ["read"],
      relatedApis: ["page.find", "page.snapshot_data", "page.setFiles"]
    },
    handlerKey: "dom"
  },
  {
    action: "page_wait_for",
    namespace: "page",
    name: "wait_for",
    description: "Wait for a selector in the active tab",
    params: Mn,
    returns: t.boolean(),
    fields: ["selector", "timeout"],
    paramTypes: [
      {
        name: "selector",
        type: "string",
        required: !0,
        description: "CSS selector to wait for (selector)"
      },
      {
        name: "timeout",
        type: "number",
        required: !1,
        description: "Timeout in milliseconds (literal)"
      }
    ],
    returnDoc: "true",
    errorCode: "E_TIMEOUT",
    errorCategory: "timeout",
    example: 'page.wait_for("#submit", 5000)',
    agentMeta: {
      notes: [U],
      tags: ["read"]
    },
    handlerKey: "wait_for"
  },
  {
    action: "page_extract",
    namespace: "page",
    name: "extract",
    description: "Extract data from the active tab",
    params: jn,
    returns: t.object({
      title: t.string().optional(),
      url: t.string().optional(),
      headings: t.array(t.object({ tag: t.string(), text: t.string() })).optional(),
      links: t.array(t.object({ href: t.string().nullable(), text: t.string() })).optional(),
      text: t.string().optional()
    }).passthrough(),
    fields: ["fields"],
    paramTypes: [
      {
        name: "fields",
        type: "array",
        required: !0,
        description: "Array of fields to extract (title, url, headings, links, text)"
      }
    ],
    returnDoc: "Extracted data",
    errorCode: "E_NO_TAB",
    example: 'page.extract(["title", "url"])',
    agentMeta: {
      notes: [U],
      tags: ["read"]
    },
    handlerKey: "extract"
  },
  {
    action: "page_fetch",
    namespace: "page",
    name: "fetch",
    description: "Fetch in the active tab",
    params: St,
    returns: Re,
    fields: ["url", "options"],
    paramTypes: [
      {
        name: "url",
        type: "string",
        required: !1,
        description: "URL to fetch (url)"
      },
      {
        name: "options",
        type: "{ method?: string, headers?: { [key: string]: string }, body?: string }",
        required: !1,
        description: "Fetch options (literal)"
      }
    ],
    returnDoc: "DTO with `{ body, headers, ok, status }`",
    errorCode: "E_NO_TAB",
    example: 'page.fetch({ url: "https://api.example.com/data" })',
    agentMeta: {
      notes: [
        U,
        "Runtime binary globals available: Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, atob, btoa",
        "For binary responses bodyEncoding is 'base64'; use atob() or fs.writeBase64 to handle bytes"
      ],
      tags: ["read"]
    },
    handlerKey: "fetch"
  },
  {
    action: "tab_forward",
    namespace: "web.tab",
    name: "forward",
    description: "Go forward in a tab",
    params: ra,
    returns: _,
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      }
    ],
    returnDoc: "Forward result",
    errorCode: "E_NO_TAB",
    example: "web.tab.forward({ tabId: 123 })",
    handlerKey: "forward"
  },
  {
    action: "tab_snapshot",
    namespace: "web.tab",
    name: "snapshot",
    description: "Get tab snapshot",
    params: oa,
    returns: t.string(),
    fields: ["tabId"],
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "max_nodes",
        type: "number",
        required: !1,
        description: "Maximum nodes to include (literal)"
      }
    ],
    returnDoc: "Snapshot text",
    errorCode: "E_SNAPSHOT",
    example: "web.tab.snapshot({ tabId: 123 })",
    handlerKey: "snapshot_text"
  },
  {
    action: "tab_snapshot_text",
    namespace: "web.tab",
    name: "snapshot_text",
    description: "Get tab snapshot text",
    params: ia,
    returns: t.string(),
    fields: ["tabId"],
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      }
    ],
    returnDoc: "Snapshot text",
    errorCode: "E_SNAPSHOT",
    example: "web.tab.snapshot_text({ tabId: 123 })",
    handlerKey: "snapshot_text"
  },
  {
    action: "tab_snapshot_data",
    namespace: "web.tab",
    name: "snapshot_data",
    description: "Get tab snapshot data",
    params: sa,
    returns: me,
    fields: ["tabId"],
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      }
    ],
    returnDoc: "Snapshot data",
    errorCode: "E_SNAPSHOT",
    example: "web.tab.snapshot_data({ tabId: 123 })",
    handlerKey: "snapshot"
  },
  {
    action: "tab_snapshot_query",
    namespace: "web.tab",
    name: "snapshot_query",
    description: "Query tab snapshot with semantic filtering by role, tag, text, name, etc.",
    params: Na,
    returns: me,
    fields: ["tabId"],
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "filter",
        type: "{ role?: string | string[], tag?: string | string[], text?: string, name?: string, interactiveOnly?: boolean, href?: string, src?: string, limit?: number }",
        required: !1,
        description: "Semantic filter criteria (literal)"
      },
      {
        name: "max_nodes",
        type: "number",
        required: !1,
        description: "Maximum nodes to collect before filtering (literal)"
      }
    ],
    returnDoc: "{ text, nodes (filtered), url, title, viewport }",
    errorCode: "E_SNAPSHOT",
    example: 'web.tab.snapshot_query({ tabId: 123, filter: { role: "button" } })',
    agentMeta: {
      notes: [
        "Explicit tabId required; same handler as page.snapshot_query",
        "Filters nodes by role, tag, text, name, interactiveOnly, href, src"
      ],
      tags: ["snapshot", "read"],
      relatedApis: ["page.snapshot_query"]
    },
    handlerKey: "snapshot_query"
  },
  {
    action: "tab_fetch",
    namespace: "web.tab",
    name: "fetch",
    description: "Fetch in a tab",
    params: aa,
    returns: Re,
    fields: ["tabId", "url", "options"],
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "url",
        type: "string",
        required: !1,
        description: "URL to fetch"
      }
    ],
    returnDoc: "Fetch result DTO",
    errorCode: "E_NO_TAB",
    example: 'web.tab.fetch({ tabId: 123, url: "https://api.example.com/data" })',
    handlerKey: "fetch"
  },
  {
    action: "tab_evaluate",
    namespace: "web.tab",
    name: "evaluate",
    description: "Evaluate script in a tab (content-script context)",
    params: ea,
    returns: Ha,
    fields: ["tabId", "script"],
    paramTypes: [
      {
        name: "tabId",
        type: "number",
        required: !0,
        description: "Tab ID (literal)"
      },
      {
        name: "script",
        type: "string",
        required: !1,
        description: "Script to evaluate (literal)"
      }
    ],
    returnDoc: "Evaluation result",
    errorCode: "E_NO_TAB",
    example: 'web.tab.evaluate({ tabId: 123, script: "document.title" })',
    agentMeta: {
      notes: [
        "Runs in content-script isolated world, not MAIN-world injection",
        "For MAIN-world access use chrome.scripting.executeScript from a cell"
      ],
      tags: ["read"]
    },
    handlerKey: "evaluate"
  }
];
function Bt(e) {
  const { handlerKey: r, ...n } = e;
  rt(n), tr(e.action);
}
const oe = h.child("runner"), so = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "xmlhttprequest",
  "font",
  "media",
  "other"
];
class co {
  constructor(r) {
    M(this, "inFlight", /* @__PURE__ */ new Map());
    M(this, "onBeforeRequest", null);
    M(this, "onCompleted", null);
    M(this, "onErrorOccurred", null);
    this.tabId = r;
  }
  start() {
    var a;
    const r = (a = globalThis.chrome) == null ? void 0 : a.webRequest;
    if (!r) {
      oe.warn("networkTracker_unavailable", { tabId: this.tabId });
      return;
    }
    const n = {
      tabId: this.tabId,
      urls: ["<all_urls>"],
      types: so
    };
    this.onBeforeRequest = (o) => {
      o.tabId === this.tabId && this.inFlight.set(o.requestId, Date.now());
    }, this.onCompleted = (o) => {
      o.tabId === this.tabId && this.inFlight.delete(o.requestId);
    }, this.onErrorOccurred = (o) => {
      o.tabId === this.tabId && this.inFlight.delete(o.requestId);
    }, r.onBeforeRequest.addListener(this.onBeforeRequest, n), r.onCompleted.addListener(this.onCompleted, n), r.onErrorOccurred.addListener(this.onErrorOccurred, n), oe.debug("networkTracker_started", { tabId: this.tabId });
  }
  get pendingCount() {
    return this.inFlight.size;
  }
  async waitForIdle(r, n) {
    const a = Date.now() + r;
    let o = 0;
    for (; Date.now() < a; ) {
      if (this.inFlight.size === 0) {
        if (await new Promise(
          (s) => setTimeout(s, _t)
        ), this.inFlight.size === 0) {
          oe.debug("networkTracker_idle", { tabId: this.tabId, traceId: n });
          return;
        }
        continue;
      }
      const i = Date.now();
      i - o >= 1e3 && (o = i, oe.debug("networkTracker_idle_wait", {
        tabId: this.tabId,
        traceId: n,
        inFlight: this.inFlight.size
      })), await new Promise((s) => setTimeout(s, 50));
    }
    throw new Error(
      `Network idle timeout for tab ${this.tabId} (traceId=${n ?? "?"}, ${this.inFlight.size} requests still in flight)`
    );
  }
  dispose() {
    var n;
    const r = (n = globalThis.chrome) == null ? void 0 : n.webRequest;
    r && (this.onBeforeRequest && r.onBeforeRequest.removeListener(this.onBeforeRequest), this.onCompleted && r.onCompleted.removeListener(this.onCompleted), this.onErrorOccurred && r.onErrorOccurred.removeListener(this.onErrorOccurred), this.onBeforeRequest = null, this.onCompleted = null, this.onErrorOccurred = null, this.inFlight.clear(), oe.debug("networkTracker_disposed", { tabId: this.tabId }));
  }
}
async function te(e) {
  const r = await it();
  return r === null && _r(ar(e)), r;
}
p({
  action: "page_url",
  namespace: "page",
  name: "url",
  description: "Get the URL of the active tab",
  params: mn,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await te("page.url()");
    return S(
      await C("chrome_tabs_get", [n])
    ).url ?? "";
  },
  paramTypes: [],
  returnDoc: "URL string",
  errorCode: "E_NO_TAB",
  example: "page.url()"
});
p({
  action: "page_title",
  namespace: "page",
  name: "title",
  description: "Get the title of the active tab",
  params: pn,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await te("page.title()");
    return S(
      await C("chrome_tabs_get", [n])
    ).title ?? "";
  },
  paramTypes: [],
  returnDoc: "Title string",
  errorCode: "E_NO_TAB",
  example: "page.title()"
});
for (const e of Gt.filter(
  (r) => r.namespace === "page"
))
  Bt(e);
p({
  action: "page_goto",
  namespace: "page",
  name: "goto",
  description: "Navigate the active tab to a URL",
  params: bn,
  returns: O,
  fields: ["url"],
  owner: "main-thread",
  handler: async (e, r) => {
    var v, g, x, N;
    const n = await te("page.goto()"), a = r.runId ?? "?";
    if (h.debug("page_goto_start", {
      traceId: a,
      url: e.url,
      waitUntil: e.waitUntil ?? "load",
      timeoutMs: Number(e.timeout) || 3e4
    }), !e.url.startsWith("http:") && !e.url.startsWith("https:"))
      throw I(
        `Navigation blocked: URL scheme not supported (${e.url})`,
        "E_NAVIGATION",
        "navigation"
      );
    const o = await C("chrome_tabs_get", [n]), i = o.ok && o.value ? o.value.url : void 0;
    if (i && (i.startsWith("chrome-extension://") || i.startsWith("chrome://")))
      throw I(
        `Refusing to navigate the active tab (${i}) — it is a chrome-extension:// or chrome:// page. Use web.tab.list() to find an http(s) tab, then web.tab.activate(tabId) before calling page.goto().`,
        "E_PERMISSION",
        "navigation"
      );
    const s = window.chrome;
    let c = !1;
    const l = (A, E) => {
      A === n && E.status === "loading" && (c = !0);
    }, u = Number(e.timeout) || _e;
    (g = (v = s == null ? void 0 : s.tabs) == null ? void 0 : v.onUpdated) == null || g.addListener(l);
    try {
      const A = await C("chrome_tabs_update", [
        n,
        { url: e.url }
      ]);
      if (!A.ok)
        return S(A);
      const E = await Ft(n, u, {
        preNavigationUrl: i,
        getNavSawLoading: () => c,
        runId: a
      });
      if (!E.ok)
        return S(E);
      h.debug("page_goto_tab_load_complete", { traceId: a });
    } finally {
      (N = (x = s == null ? void 0 : s.tabs) == null ? void 0 : x.onUpdated) == null || N.removeListener(l);
    }
    const m = await C("chrome_tabs_get", [n]);
    if (m.ok && m.value) {
      const A = m.value, E = A.url ?? "";
      if (E && !E.startsWith("http:") && !E.startsWith("https:"))
        throw I(
          `Navigation blocked: cannot script ${E}`,
          "E_NAVIGATION",
          "navigation"
        );
      if (i && A.status === "complete" && E === i && E !== e.url)
        throw I(
          `Navigation did not start for ${e.url}`,
          "E_NAVIGATION",
          "navigation"
        );
    }
    if (e.waitUntil === "networkidle") {
      const A = new co(n);
      try {
        h.debug("page_goto_network_idle_start", { traceId: a }), A.start();
        const E = Math.max(_t * 2, u);
        await A.waitForIdle(E, a);
      } catch (E) {
        throw h.debug("page_goto_network_idle_timeout", {
          traceId: a,
          error: E instanceof Error ? E.message : String(E)
        }), I(
          E instanceof Error ? E.message : String(E),
          "E_NAVIGATION",
          "navigation"
        );
      } finally {
        A.dispose(), h.debug("page_goto_network_idle_done", { traceId: a });
      }
    }
    const f = await We(n, u);
    if (!f.ok)
      return S(f);
    await new Promise(
      (A) => setTimeout(A, vr)
    );
    const b = await C("chrome_tabs_get", [n]);
    return S(b);
  },
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: !0,
      description: "URL to navigate to (url)"
    },
    {
      name: "waitUntil",
      type: '"load" | "networkidle"',
      required: !1,
      description: "When to consider navigation complete. 'load' waits for tab status complete (default). 'networkidle' waits until no in-flight requests for 500ms."
    }
  ],
  returnDoc: "Tab update result",
  errorCode: "E_NAVIGATION",
  errorCategory: "navigation",
  example: 'page.goto("https://example.com", { waitUntil: "networkidle" })'
});
p({
  action: "page_health",
  namespace: "page",
  name: "health",
  description: "Report tab readiness for mutations vs read-only snapshot APIs",
  params: Pa,
  returns: ja,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await te("page.health()"), a = S(
      await C("chrome_tabs_get", [n])
    ), o = a.url ?? "", i = a.title ?? "", s = await Lt(n), c = s && !s.ok ? "blocked" : "ok", u = (await We(n, yt)).ok ? "connected" : "missing", m = c === "ok" && u === "connected", f = {
      tabId: n,
      url: o,
      title: i,
      contentScript: u,
      domApis: c,
      mutationsReady: m
    };
    if (!m)
      if (c === "blocked")
        f.hint = "This tab URL does not support DOM APIs. Only http(s) pages support page.* and web.tab.* DOM operations.", f.recovery = [
          "Navigate to an http(s) URL with await page.goto(url)"
        ];
      else {
        const b = fe(n, o);
        f.hint = b.hint, f.recovery = b.recovery;
      }
    return f;
  },
  paramTypes: [],
  returnDoc: "Tab health: contentScript connection and http(s) domApis readiness",
  errorCode: "E_NO_TAB",
  example: "page.health()"
});
p({
  action: "page_reload",
  namespace: "page",
  name: "reload",
  description: "Reload the active tab",
  params: gn,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await te("page.reload()");
    return S(await C("chrome_tabs_reload", [n]));
  },
  paramTypes: [],
  returnDoc: "null",
  errorCode: "E_NO_TAB",
  example: "page.reload()"
});
p({
  action: "page_wait",
  namespace: "page",
  name: "wait",
  description: "Wait for a duration",
  params: yn,
  returns: t.boolean(),
  fields: ["duration"],
  owner: "main-thread",
  handler: async (e, r) => (await new Promise(
    (n) => setTimeout(n, Number(e.duration))
  ), !0),
  paramTypes: [
    {
      name: "duration",
      type: "number",
      required: !1,
      description: "Duration to wait in milliseconds (literal)"
    }
  ],
  returnDoc: "true",
  errorCode: "E_UNKNOWN",
  example: "page.wait(1000)"
});
p({
  action: "page_close",
  namespace: "page",
  name: "close",
  description: "Close a tab",
  params: Hn,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = typeof e == "number" ? e : Y(e);
    if (n === null)
      throw I("page_close requires a tabId", "E_MISSING_PARAM");
    return S(await C("chrome_tabs_remove", [n]));
  },
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID to close (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_MISSING_PARAM",
  example: "page.close(123)"
});
p({
  action: "page_tabs",
  namespace: "page",
  name: "tabs",
  description: "Query tabs",
  params: Ue,
  returns: ee,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = S(await C("chrome_tabs_query", [e]));
    return (Array.isArray(n) ? n : []).map((a) => ({
      ...a,
      tabId: a == null ? void 0 : a.id
    }));
  },
  paramTypes: [
    {
      name: "params",
      type: "{ active?: boolean, currentWindow?: boolean, url?: string }",
      required: !1,
      description: "Tab query filter (e.g. { active: true, currentWindow: true }) (literal)"
    }
  ],
  returnDoc: "Tab array",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: "page.tabs({ active: true })"
});
p({
  action: "page_switch",
  namespace: "page",
  name: "switch",
  description: "Switch to a tab",
  params: At,
  returns: O,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = typeof e == "number" ? e : Y(e);
    if (n === null)
      throw I("page_switch requires a tabId", "E_MISSING_PARAM");
    return S(
      await C("chrome_tabs_update", [n, { active: !0 }])
    );
  },
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: !0,
      description: "Tab ID to activate (can also be passed as a plain number or as { tabId: number }) (literal)"
    }
  ],
  returnDoc: "Updated tab",
  errorCode: "E_MISSING_PARAM",
  example: "page.switch(123)"
});
p({
  action: "page_new_tab",
  namespace: "page",
  name: "new_tab",
  description: "Open a new tab",
  params: Tt,
  returns: O,
  fields: ["url"],
  owner: "main-thread",
  handler: async (e, r) => S(await C("chrome_tabs_create", [e])),
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "URL to open in new tab (url)"
    },
    {
      name: "active",
      type: "boolean",
      required: !1,
      description: "Whether to focus the new tab (literal)"
    }
  ],
  returnDoc: "Created tab",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: 'page.new_tab("https://example.com")'
});
p({
  action: "page_active_tab",
  namespace: "page",
  name: "active_tab",
  description: "Get the active tab",
  params: Un,
  returns: O,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await te("page.active_tab()"), a = S(
      await C("chrome_tabs_get", [n])
    );
    return { ...a, tabId: typeof a.id == "number" ? a.id : n };
  },
  paramTypes: [],
  returnDoc: "Active tab object with tabId",
  errorCode: "E_NO_TAB",
  example: "page.active_tab()"
});
function $(e) {
  var a, o, i;
  const r = e.toLowerCase().trim();
  if (!r) return null;
  const n = Array.from(document.querySelectorAll(je));
  for (const s of n) {
    const c = s.getAttribute("aria-label");
    if (c && c.toLowerCase().trim() === r) return s;
    const l = s.placeholder;
    if (l && l.toLowerCase().trim() === r)
      return s;
    const u = s.id;
    if (u) {
      const b = document.querySelector(`label[for='${CSS.escape(u)}']`);
      if (b && ((a = b.textContent) == null ? void 0 : a.trim().toLowerCase()) === r)
        return s;
    }
    const m = s.closest("label");
    if (m && ((o = m.textContent) == null ? void 0 : o.trim().toLowerCase()) === r || (((i = s.textContent) == null ? void 0 : i.trim().toLowerCase()) || "") === r) return s;
  }
  return null;
}
function lo(e) {
  var o;
  const r = e.toLowerCase().trim();
  if (!r) return [];
  const n = Array.from(document.querySelectorAll(je)), a = [];
  for (const i of n) {
    const s = i.getAttribute("aria-label"), c = i.placeholder, l = ((o = i.textContent) == null ? void 0 : o.trim()) || "";
    if (![s, c, l].filter(
      Boolean
    ).some((f) => f.toLowerCase().includes(r)))
      continue;
    const m = i.getAttribute("data-ref-id");
    if (m && (a.push({
      refId: m,
      role: J(i),
      name: kt(i) || void 0
    }), a.length >= 5))
      break;
  }
  return a;
}
function uo(e) {
  const r = document.querySelector(
    `[data-ref-id='${CSS.escape(e)}']`
  );
  let n, a;
  r && (n = r.tagName.toLowerCase(), a = J(r));
  const o = Array.from(document.querySelectorAll(je)), i = [];
  for (const s of o) {
    const c = s.getAttribute("data-ref-id");
    if (c) {
      if (n || a) {
        const l = s.tagName.toLowerCase(), u = J(s);
        if (l !== n && u !== a)
          continue;
      }
      if (i.push({
        refId: c,
        role: J(s),
        name: kt(s) || void 0
      }), i.length >= 5) break;
    }
  }
  return i;
}
function K(e, r, n = !1) {
  if (e) {
    const a = n ? uo(e) : [];
    Se(or(e, { candidates: a }));
  }
  if (r) {
    const a = n ? lo(r) : [];
    Se(sr(r, a));
  }
  Se({
    message: "Element not found",
    code: "E_NOT_FOUND",
    category: "resource"
  });
}
const mo = /* @__PURE__ */ new Map([
  [
    "sidepanel_click",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      return !a && n && (a = $(n)), a || K(e, n, !1), a.click(), null;
    }
  ],
  [
    "sidepanel_dblclick",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = new MouseEvent("dblclick", { bubbles: !0 });
      return a.dispatchEvent(o), null;
    }
  ],
  [
    "sidepanel_fill",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = r.value ?? "";
      return "value" in a && (a.value = String(o)), null;
    }
  ],
  [
    "sidepanel_type",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = r.text ?? "";
      if ("value" in a) {
        const i = a;
        i.value = String(o), i.dispatchEvent(new Event("input", { bubbles: !0 }));
      }
      return null;
    }
  ],
  [
    "sidepanel_append",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = r.text ?? "";
      if ("value" in a) {
        const i = a;
        i.value += String(o), i.dispatchEvent(new Event("input", { bubbles: !0 }));
      }
      return null;
    }
  ],
  [
    "sidepanel_press",
    (e, r) => {
      const n = r.key ?? "", a = document.activeElement;
      if (!a) throw I("No active element to press", "ENOTFOUND");
      const o = new KeyboardEvent("keydown", {
        key: String(n),
        bubbles: !0
      });
      a.dispatchEvent(o);
      const i = new KeyboardEvent("keyup", {
        key: String(n),
        bubbles: !0
      });
      return a.dispatchEvent(i), null;
    }
  ],
  [
    "sidepanel_select",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = r.value ?? "";
      if ("value" in a) {
        const i = a;
        i.value = String(o), i.dispatchEvent(new Event("change", { bubbles: !0 }));
      }
      return null;
    }
  ],
  [
    "sidepanel_check",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = typeof r.checked == "boolean" ? r.checked : !0;
      if ("checked" in a) {
        const i = a;
        i.checked = o, i.dispatchEvent(new Event("change", { bubbles: !0 }));
      }
      return null;
    }
  ],
  [
    "sidepanel_hover",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      !a && n && (a = $(n)), a || K(e, n, !1);
      const o = new MouseEvent("mouseenter", { bubbles: !0 });
      return a.dispatchEvent(o), null;
    }
  ],
  [
    "sidepanel_unhover",
    () => {
      const e = document.activeElement;
      if (!e) throw I("No active element to unhover", "ENOTFOUND");
      const r = new MouseEvent("mouseleave", { bubbles: !0 });
      return e.dispatchEvent(r), null;
    }
  ],
  [
    "sidepanel_scroll",
    (e, r) => {
      const n = r.direction ?? "down", a = typeof r.amount == "number" ? r.amount : gt;
      return window.scrollBy({
        top: n === "up" ? -a : a,
        behavior: "smooth"
      }), null;
    }
  ],
  [
    "sidepanel_scroll_to",
    (e, r) => {
      const n = typeof r.label == "string" ? r.label : "";
      let a = e ? B(e) : null;
      return !a && n && (a = $(n)), a || K(e, n, !1), a.scrollIntoView({ behavior: "smooth", block: "center" }), null;
    }
  ]
]);
function H(e, r) {
  const n = h.child("runner"), a = no(r);
  n.debug("dispatchSidepanelEvent_start", { action: e, refId: a });
  const o = W(r), i = mo.get(e);
  if (!i)
    throw n.error("dispatchSidepanelEvent_no_handler", { action: e }), I(`Unknown sidepanel action: ${e}`, "E_UNKNOWN");
  return i(a, o);
}
p({
  action: "sidepanel_click",
  namespace: "sidepanel",
  name: "click",
  description: "Click an element in the sidepanel",
  params: ca,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_click", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.click({ refId: "e2" })'
});
p({
  action: "sidepanel_dblclick",
  namespace: "sidepanel",
  name: "dblclick",
  description: "Double-click an element in the sidepanel",
  params: la,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_dblclick", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.dblclick({ refId: "e2" })'
});
p({
  action: "sidepanel_fill",
  namespace: "sidepanel",
  name: "fill",
  description: "Fill an element in the sidepanel",
  params: da,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_fill", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    },
    {
      name: "value",
      type: "string",
      required: !1,
      description: "Value to fill (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.fill({ refId: "e2" })'
});
p({
  action: "sidepanel_type",
  namespace: "sidepanel",
  name: "type",
  description: "Type into an element in the sidepanel",
  params: ua,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_type", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    },
    {
      name: "text",
      type: "string",
      required: !1,
      description: "Text to type (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.type({ refId: "e2" })'
});
p({
  action: "sidepanel_press",
  namespace: "sidepanel",
  name: "press",
  description: "Press a key in the sidepanel",
  params: ma,
  returns: t.null(),
  fields: ["key"],
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_press", e),
  paramTypes: [
    {
      name: "key",
      type: "string",
      required: !1,
      description: "Key to press (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.press("Enter")'
});
p({
  action: "sidepanel_select",
  namespace: "sidepanel",
  name: "select",
  description: "Select an option in the sidepanel",
  params: pa,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_select", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    },
    {
      name: "value",
      type: "string",
      required: !1,
      description: "Option value to select (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.select({ refId: "e2" })'
});
p({
  action: "sidepanel_check",
  namespace: "sidepanel",
  name: "check",
  description: "Check/uncheck an element in the sidepanel",
  params: ba,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_check", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    },
    {
      name: "checked",
      type: "boolean",
      required: !1,
      description: "Whether to check or uncheck (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.check({ refId: "e2" })'
});
p({
  action: "sidepanel_hover",
  namespace: "sidepanel",
  name: "hover",
  description: "Hover over an element in the sidepanel",
  params: ha,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_hover", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.hover({ refId: "e2" })'
});
p({
  action: "sidepanel_unhover",
  namespace: "sidepanel",
  name: "unhover",
  description: "Unhover in the sidepanel",
  params: fa,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_unhover", e),
  paramTypes: [],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: "sidepanel.unhover()"
});
p({
  action: "sidepanel_scroll",
  namespace: "sidepanel",
  name: "scroll",
  description: "Scroll the sidepanel",
  params: ga,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_scroll", e),
  paramTypes: [
    {
      name: "direction",
      type: "string",
      required: !1,
      description: "Scroll direction (up or down) (literal)"
    },
    {
      name: "amount",
      type: "number",
      required: !1,
      description: "Scroll amount in pixels (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.scroll({ direction: "down", amount: 500 })'
});
p({
  action: "sidepanel_scroll_to",
  namespace: "sidepanel",
  name: "scroll_to",
  description: "Scroll to an element in the sidepanel",
  params: ya,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_scroll_to", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID to scroll to (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label to scroll to (label)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.scroll_to({ refId: "e2" })'
});
p({
  action: "sidepanel_append",
  namespace: "sidepanel",
  name: "append",
  description: "Append text to an element in the sidepanel",
  params: _a,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => H("sidepanel_append", e),
  paramTypes: [
    {
      name: "refId",
      type: "string",
      required: !1,
      description: "Element reference ID (refId)"
    },
    {
      name: "label",
      type: "string",
      required: !1,
      description: "Element label (label)"
    },
    {
      name: "text",
      type: "string",
      required: !1,
      description: "Text to append (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_UNKNOWN",
  example: 'sidepanel.append({ refId: "e2" })'
});
p({
  action: "sidepanel_url",
  namespace: "sidepanel",
  name: "url",
  description: "Get the sidepanel URL",
  params: wa,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => window.location.href,
  paramTypes: [],
  returnDoc: "URL string",
  errorCode: "E_UNKNOWN",
  example: "sidepanel.url()"
});
p({
  action: "sidepanel_title",
  namespace: "sidepanel",
  name: "title",
  description: "Get the sidepanel title",
  params: ka,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => document.title,
  paramTypes: [],
  returnDoc: "Title string",
  errorCode: "E_UNKNOWN",
  example: "sidepanel.title()"
});
p({
  action: "sidepanel_wait",
  namespace: "sidepanel",
  name: "wait",
  description: "Wait in the sidepanel",
  params: Ea,
  returns: t.boolean(),
  fields: ["duration"],
  owner: "main-thread",
  handler: async (e, r) => (await new Promise(
    (n) => setTimeout(n, Number(e.duration))
  ), !0),
  paramTypes: [
    {
      name: "duration",
      type: "number",
      required: !1,
      description: "Duration to wait in milliseconds (literal)"
    }
  ],
  returnDoc: "true",
  errorCode: "E_UNKNOWN",
  example: "sidepanel.wait(1000)"
});
p({
  action: "sidepanel_snapshot",
  namespace: "sidepanel",
  name: "snapshot",
  description: "Capture sidepanel DOM snapshot",
  params: Ia,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await Ee(e);
    if (!n.ok)
      throw I(
        n.error.message,
        n.error.code,
        n.error.category
      );
    if (n.value && typeof n.value == "object")
      return n.value.text;
    throw I("Failed to get sidepanel snapshot", "E_SNAPSHOT");
  },
  paramTypes: [
    {
      name: "interactive_only",
      type: "boolean",
      required: !1,
      description: "Only include interactive elements (literal)"
    },
    {
      name: "max_nodes",
      type: "number",
      required: !1,
      description: "Maximum nodes to include (literal)"
    }
  ],
  returnDoc: "Snapshot text",
  errorCode: "E_SNAPSHOT",
  example: "sidepanel.snapshot()"
});
p({
  action: "sidepanel_snapshot_text",
  namespace: "sidepanel",
  name: "snapshot_text",
  description: "Capture sidepanel DOM snapshot and return text representation",
  params: Sa,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await Ee(e);
    if (!n.ok)
      throw I(
        n.error.message,
        n.error.code,
        n.error.category
      );
    if (n.value && typeof n.value == "object")
      return n.value.text;
    throw I("Failed to get sidepanel snapshot", "E_SNAPSHOT");
  },
  paramTypes: [
    {
      name: "interactive_only",
      type: "boolean",
      required: !1,
      description: "Only include interactive elements (literal)"
    },
    {
      name: "max_nodes",
      type: "number",
      required: !1,
      description: "Maximum nodes to include (literal)"
    }
  ],
  returnDoc: "Snapshot text",
  errorCode: "E_SNAPSHOT",
  example: "sidepanel.snapshot_text()"
});
p({
  action: "sidepanel_snapshot_data",
  namespace: "sidepanel",
  name: "snapshot_data",
  description: "Get sidepanel snapshot data",
  params: va,
  returns: Ot,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await Ee(e);
    if (!n.ok)
      throw I(
        n.error.message,
        n.error.code,
        n.error.category
      );
    return S(n);
  },
  paramTypes: [
    {
      name: "interactive_only",
      type: "boolean",
      required: !1,
      description: "Only include interactive elements (literal)"
    },
    {
      name: "max_nodes",
      type: "number",
      required: !1,
      description: "Maximum nodes to include (literal)"
    }
  ],
  returnDoc: "Snapshot data",
  errorCode: "E_SNAPSHOT",
  example: "sidepanel.snapshot_data()"
});
p({
  action: "dom_snapshot",
  namespace: "dom",
  name: "snapshot",
  description: "Take a DOM snapshot",
  params: xa,
  returns: Ot,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await Ee(e);
    if (!n.ok)
      throw I(
        n.error.message,
        n.error.code,
        n.error.category
      );
    return S(n);
  },
  paramTypes: [
    {
      name: "interactive_only",
      type: "boolean",
      required: !1,
      description: "Only include interactive elements (literal)"
    },
    {
      name: "max_nodes",
      type: "number",
      required: !1,
      description: "Maximum nodes to include (literal)"
    }
  ],
  returnDoc: "Snapshot data",
  errorCode: "E_SNAPSHOT",
  example: 'dom.snapshot({ tabId: 123, script: "document.title" })'
});
p({
  action: "dom_format",
  namespace: "dom",
  name: "format",
  description: "Format a DOM snapshot",
  params: Ca,
  returns: t.string(),
  owner: "main-thread",
  handler: async (e, r) => S(await Wr(e)),
  paramTypes: [
    {
      name: "snapshot",
      type: "DOM snapshot data",
      required: !0,
      description: "DOM snapshot data (literal)"
    },
    {
      name: "format",
      type: "string",
      required: !1,
      description: "Output format (compact-text, json, json-pretty) (literal)"
    }
  ],
  returnDoc: "Formatted snapshot",
  errorCode: "E_FORMAT",
  example: 'dom.format({ text: "hello" })'
});
p({
  action: "tab_query",
  namespace: "web.tab",
  name: "query",
  description: "Query tabs",
  params: Ue,
  returns: ee,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = S(
      await C("chrome_tabs_query", [e])
    );
    if (n == null) return [];
    if (!Array.isArray(n))
      throw I(
        `tab.query returned unexpected type: ${typeof n}`,
        "E_TAB_QUERY",
        "extension"
      );
    return n;
  },
  paramTypes: [
    {
      name: "query",
      type: "{ active?: boolean, currentWindow?: boolean, url?: string }",
      required: !1,
      description: "Tab query object (literal)"
    }
  ],
  returnDoc: "Tab array",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: "web.tab.query({ active: true })"
});
p({
  action: "tab_current",
  namespace: "web.tab",
  name: "current",
  description: "Get the active tab in the current window",
  params: t.object({}),
  returns: O,
  aliases: [{ namespace: "tab", name: "current" }],
  owner: "main-thread",
  handler: async (e, r) => {
    const n = await it();
    if (n === null)
      throw new Error("No active tab available");
    const a = S(
      await C("chrome_tabs_get", [n])
    );
    return { ...a, tabId: typeof a.id == "number" ? a.id : n };
  },
  paramTypes: [],
  returnDoc: "Active tab object",
  errorCode: "E_TAB",
  errorCategory: "extension",
  example: "web.tab.current()"
});
p({
  action: "tab_get",
  namespace: "web.tab",
  name: "get",
  description: "Get a tab by id",
  params: Oa,
  returns: O,
  fields: ["tabId"],
  aliases: [{ namespace: "tab", name: "get", fields: ["tabId"] }],
  owner: "main-thread",
  handler: async (e, r) => {
    const n = Y(W(e));
    return S(await C("chrome_tabs_get", [n]));
  },
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: !0,
      description: "Tab ID to get (literal)"
    }
  ],
  returnDoc: "Tab object",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: "web.tab.get(123)"
});
p({
  action: "tab_find",
  namespace: "web.tab",
  name: "find",
  description: "Find tabs matching a query",
  params: Ue,
  returns: ee,
  aliases: [{ namespace: "tab", name: "find" }],
  owner: "main-thread",
  handler: async (e, r) => S(await C("chrome_tabs_query", [e])),
  paramTypes: [
    {
      name: "query",
      type: "{ active?: boolean, currentWindow?: boolean, url?: string }",
      required: !1,
      description: "Tab query object (literal)"
    }
  ],
  returnDoc: "Matching tabs",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: 'web.tab.find({ url: "*://example.com/*" })'
});
p({
  action: "tab_list",
  namespace: "web.tab",
  name: "list",
  description: "List all tabs",
  params: t.object({}),
  returns: ee,
  aliases: [{ namespace: "tab", name: "list" }],
  owner: "main-thread",
  handler: async (e, r) => S(await C("chrome_tabs_query", [{}])),
  paramTypes: [],
  returnDoc: "All tabs",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: "web.tab.list()"
});
p({
  action: "tab_create",
  namespace: "web.tab",
  name: "create",
  description: "Create a tab",
  params: Tt,
  returns: O,
  fields: ["url"],
  aliases: [{ namespace: "tab", name: "create", fields: ["url"] }],
  owner: "main-thread",
  handler: async (e, r) => S(await C("chrome_tabs_create", [e])),
  paramTypes: [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "URL to open in new tab (url)"
    },
    {
      name: "active",
      type: "boolean",
      required: !1,
      description: "Whether to focus the new tab (literal)"
    }
  ],
  returnDoc: "Created tab",
  errorCode: "ECHROME",
  errorCategory: "extension",
  example: 'web.tab.create("https://example.com")'
});
p({
  action: "tab_activate",
  namespace: "web.tab",
  name: "activate",
  description: "Activate a tab",
  params: At,
  returns: O,
  owner: "main-thread",
  handler: async (e, r) => {
    const n = typeof e == "number" ? e : Y(e);
    if (n === null)
      throw I("tab_activate requires a tabId", "E_MISSING_PARAM");
    return S(
      await C("chrome_tabs_update", [n, { active: !0 }])
    );
  },
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID to activate (literal)"
    }
  ],
  returnDoc: "Updated tab",
  errorCode: "E_MISSING_PARAM",
  example: "web.tab.activate(123)"
});
p({
  action: "tab_close",
  namespace: "web.tab",
  name: "close",
  description: "Close a tab",
  params: Fn,
  returns: t.null(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = typeof e == "number" ? e : Y(e);
    if (n === null)
      throw I("tab_close requires a tabId", "E_MISSING_PARAM");
    return S(await C("chrome_tabs_remove", [n]));
  },
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID to close (literal)"
    }
  ],
  returnDoc: "null",
  errorCode: "E_MISSING_PARAM",
  example: "web.tab.close(123)"
});
for (const e of Gt.filter(
  (r) => r.namespace === "web.tab"
))
  Bt(e);
p({
  action: "tab_wait_for_load",
  namespace: "web.tab",
  name: "wait_for_load",
  description: "Wait for tab to load",
  params: na,
  returns: t.boolean(),
  owner: "main-thread",
  handler: async (e, r) => {
    const n = W(e), a = Y(e), o = typeof n.timeout == "number" ? n.timeout : 3e4;
    return S(await Ft(a, o));
  },
  paramTypes: [
    {
      name: "tabId",
      type: "number",
      required: !0,
      description: "Tab ID (literal)"
    },
    {
      name: "timeout",
      type: "number",
      required: !1,
      description: "Timeout in milliseconds (literal)"
    }
  ],
  returnDoc: "true",
  errorCode: "E_NO_TAB",
  example: "web.tab.wait_for_load({ tabId: 123, timeout: 5000 })"
});
const k = t.unknown(), w = t.union([t.null(), t.undefined(), t.boolean()]), Q = w;
function y(e, r, n, a = k, o, i) {
  d(
    e,
    "chrome",
    n,
    r,
    a,
    "ECHROME",
    "extension",
    [],
    o,
    i
  );
}
d(
  "chrome_action_setBadgeText",
  "chrome",
  "Set badge text",
  ["action"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.action.setBadgeText({ text: "1" })'
);
d(
  "chrome_action_setBadgeBackgroundColor",
  "chrome",
  "Set badge background color",
  ["action"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })'
);
d(
  "chrome_action_setTitle",
  "chrome",
  "Set action title",
  ["action"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.action.setTitle({ title: "My Extension" })'
);
d(
  "chrome_action_setIcon",
  "chrome",
  "Set action icon",
  ["action"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.action.setIcon({ path: "icon.png" })'
);
d(
  "chrome_action_getBadgeText",
  "chrome",
  "Get badge text",
  ["action"],
  t.string(),
  "ECHROME",
  "extension",
  [],
  "chrome.action.getBadgeText({})"
);
d(
  "chrome_action_openPopup",
  "chrome",
  "Open action popup",
  ["action"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.action.openPopup()"
);
d(
  "chrome_action_setPopup",
  "chrome",
  "Set action popup",
  ["action"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.action.setPopup({ popup: "popup.html" })'
);
d(
  "chrome_alarms_create",
  "chrome",
  "Create an alarm",
  ["alarms"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "name",
      type: "string",
      required: !1,
      description: "Alarm name (literal)"
    },
    {
      name: "alarmInfo",
      type: "{ when?: number, delayInMinutes?: number, periodInMinutes?: number }",
      required: !1,
      description: "Alarm info (literal)"
    }
  ],
  'chrome.alarms.create("myAlarm", { delayInMinutes: 5 })'
);
d(
  "chrome_alarms_clear",
  "chrome",
  "Clear an alarm",
  ["alarms"],
  Za,
  "ECHROME",
  "extension",
  [
    {
      name: "name",
      type: "string",
      required: !1,
      description: "Alarm name to clear (literal)"
    }
  ],
  'chrome.alarms.clear("myAlarm")'
);
d(
  "chrome_alarms_clearAll",
  "chrome",
  "Clear all alarms",
  ["alarms"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.alarms.clearAll()"
);
d(
  "chrome_alarms_getAll",
  "chrome",
  "Get all alarms",
  ["alarms"],
  t.array(
    t.object({
      name: t.string().optional(),
      periodInMinutes: t.number().optional(),
      scheduledTime: t.number().optional()
    }).passthrough()
  ),
  "ECHROME",
  "extension",
  [],
  "chrome.alarms.getAll()"
);
d(
  "chrome_bookmarks_search",
  "chrome",
  "Search bookmarks",
  ["bookmarks"],
  ue,
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.search({ query: "example" })'
);
d(
  "chrome_bookmarks_create",
  "chrome",
  "Create a bookmark",
  ["bookmarks"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.create({ title: "Example", url: "https://example.com" })'
);
d(
  "chrome_bookmarks_remove",
  "chrome",
  "Remove a bookmark",
  ["bookmarks"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "id",
      type: "string",
      required: !1,
      description: "Bookmark ID to remove (literal)"
    }
  ],
  'chrome.bookmarks.remove("bookmarkId")'
);
d(
  "chrome_bookmarks_get",
  "chrome",
  "Get bookmarks by ID",
  ["bookmarks"],
  ue,
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.get("bookmarkId")'
);
d(
  "chrome_bookmarks_getChildren",
  "chrome",
  "Get bookmark children",
  ["bookmarks"],
  ue,
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.getChildren("folderId")'
);
d(
  "chrome_bookmarks_getTree",
  "chrome",
  "Get bookmark tree",
  ["bookmarks"],
  ue,
  "ECHROME",
  "extension",
  [],
  "chrome.bookmarks.getTree()"
);
d(
  "chrome_bookmarks_move",
  "chrome",
  "Move a bookmark",
  ["bookmarks"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.move("bookmarkId", { parentId: "newFolderId" })'
);
d(
  "chrome_bookmarks_removeTree",
  "chrome",
  "Remove a bookmark tree",
  ["bookmarks"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.removeTree("folderId")'
);
d(
  "chrome_bookmarks_update",
  "chrome",
  "Update a bookmark",
  ["bookmarks"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  'chrome.bookmarks.update("bookmarkId", { title: "New Title" })'
);
y(
  "chrome_browsingData_remove",
  ["browsingData"],
  "Remove browsing data",
  k,
  "chrome.browsingData.remove({ since: 0 })",
  "null"
);
y(
  "chrome_browsingData_removeCache",
  ["browsingData"],
  "Remove cache",
  k,
  "chrome.browsingData.removeCache({ since: 0 })",
  "null"
);
y(
  "chrome_browsingData_removeCookies",
  ["browsingData"],
  "Remove cookies",
  k,
  "chrome.browsingData.removeCookies({ since: 0 })",
  "null"
);
y(
  "chrome_browsingData_removeDownloads",
  ["browsingData"],
  "Remove downloads",
  k,
  "chrome.browsingData.removeDownloads({ since: 0 })",
  "null"
);
y(
  "chrome_browsingData_removeFormData",
  ["browsingData"],
  "Remove form data",
  k,
  "chrome.browsingData.removeFormData({ since: 0 })",
  "null"
);
y(
  "chrome_browsingData_removeHistory",
  ["browsingData"],
  "Remove history",
  k,
  "chrome.browsingData.removeHistory({ since: 0 })",
  "null"
);
y(
  "chrome_browsingData_removePasswords",
  ["browsingData"],
  "Remove passwords",
  Q,
  "chrome.browsingData.removePasswords({ since: 0 })",
  "null"
);
d(
  "chrome_contextMenus_create",
  "chrome",
  "Create a context menu",
  ["contextMenus"],
  Ka,
  "ECHROME",
  "extension",
  [],
  'chrome.contextMenus.create({ id: "menuItemId", title: "My Menu", contexts: ["page"] })'
);
d(
  "chrome_contextMenus_remove",
  "chrome",
  "Remove a context menu",
  ["contextMenus"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "menuItemId",
      type: "string",
      required: !1,
      description: "Menu item ID to remove (literal)"
    }
  ],
  'chrome.contextMenus.remove("menuItemId")'
);
d(
  "chrome_contextMenus_removeAll",
  "chrome",
  "Remove all context menus",
  ["contextMenus"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.contextMenus.removeAll()"
);
d(
  "chrome_contextMenus_update",
  "chrome",
  "Update a context menu",
  ["contextMenus"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.contextMenus.update("menuItemId", { title: "Updated" })'
);
d(
  "chrome_cookies_get",
  "chrome",
  "Get a cookie",
  ["cookies"],
  de,
  "ECHROME",
  "extension",
  [],
  'chrome.cookies.get({ url: "https://example.com", name: "session" })'
);
d(
  "chrome_cookies_set",
  "chrome",
  "Set a cookie",
  ["cookies"],
  de,
  "ECHROME",
  "extension",
  [],
  'chrome.cookies.set({ url: "https://example.com", name: "session", value: "abc" })'
);
d(
  "chrome_cookies_remove",
  "chrome",
  "Remove a cookie",
  ["cookies"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  'chrome.cookies.remove({ url: "https://example.com", name: "session" })'
);
d(
  "chrome_cookies_getAll",
  "chrome",
  "Get all cookies",
  ["cookies"],
  Mt,
  "ECHROME",
  "extension",
  [],
  'chrome.cookies.getAll({ url: "https://example.com" })'
);
y(
  "chrome_declarativeNetRequest_getDynamicRules",
  ["declarativeNetRequest"],
  "Get dynamic DNR rules",
  k,
  "chrome.declarativeNetRequest.getDynamicRules()",
  "Rule[]"
);
y(
  "chrome_declarativeNetRequest_getEnabledRulesets",
  ["declarativeNetRequest"],
  "Get enabled DNR rulesets",
  k,
  "chrome.declarativeNetRequest.getEnabledRulesets()",
  "RulesetInfo[]"
);
y(
  "chrome_declarativeNetRequest_getSessionRules",
  ["declarativeNetRequest"],
  "Get session DNR rules",
  k,
  "chrome.declarativeNetRequest.getSessionRules()",
  "Rule[]"
);
y(
  "chrome_declarativeNetRequest_updateDynamicRules",
  ["declarativeNetRequest"],
  "Update dynamic DNR rules",
  k,
  "chrome.declarativeNetRequest.updateDynamicRules({ addRules: [] })",
  "null"
);
y(
  "chrome_declarativeNetRequest_updateEnabledRulesets",
  ["declarativeNetRequest"],
  "Update enabled DNR rulesets",
  k,
  "chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [] })",
  "null"
);
y(
  "chrome_declarativeNetRequest_updateSessionRules",
  ["declarativeNetRequest"],
  "Update session DNR rules",
  k,
  "chrome.declarativeNetRequest.updateSessionRules({ addRules: [] })",
  "null"
);
y(
  "chrome_desktopCapture_chooseDesktopMedia",
  ["desktopCapture"],
  "Choose desktop media",
  k,
  'chrome.desktopCapture.chooseDesktopMedia(["screen"], (id) => id)',
  "string"
);
y(
  "chrome_desktopCapture_cancelChooseDesktopMedia",
  ["desktopCapture"],
  "Cancel desktop media picker",
  k,
  "chrome.desktopCapture.cancelChooseDesktopMedia(123)",
  "null"
);
d(
  "chrome_downloads_download",
  "chrome",
  "Download a file",
  ["downloads"],
  Ya,
  "ECHROME",
  "extension",
  [],
  'chrome.downloads.download({ url: "https://example.com/file.zip" })'
);
d(
  "chrome_downloads_search",
  "chrome",
  "Search downloads",
  ["downloads"],
  Ht,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.search({})"
);
d(
  "chrome_downloads_erase",
  "chrome",
  "Erase downloads",
  ["downloads"],
  Ht,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.erase({ ids: [1] })"
);
d(
  "chrome_downloads_pause",
  "chrome",
  "Pause a download",
  ["downloads"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.pause(1)"
);
d(
  "chrome_downloads_resume",
  "chrome",
  "Resume a download",
  ["downloads"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.resume(1)"
);
d(
  "chrome_downloads_cancel",
  "chrome",
  "Cancel a download",
  ["downloads"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.cancel(1)"
);
d(
  "chrome_downloads_open",
  "chrome",
  "Open a downloaded file",
  ["downloads"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.open(1)"
);
d(
  "chrome_downloads_show",
  "chrome",
  "Show a downloaded file",
  ["downloads"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.show(1)"
);
d(
  "chrome_downloads_removeFile",
  "chrome",
  "Remove download file",
  ["downloads"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.downloads.removeFile(1)"
);
d(
  "chrome_history_search",
  "chrome",
  "Search history",
  ["history"],
  Le,
  "ECHROME",
  "extension",
  [],
  'chrome.history.search({ text: "example" })'
);
d(
  "chrome_history_deleteUrl",
  "chrome",
  "Delete a URL from history",
  ["history"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "URL to delete from history (url)"
    }
  ],
  'chrome.history.deleteUrl({ url: "https://example.com" })'
);
d(
  "chrome_history_addUrl",
  "chrome",
  "Add URL to history",
  ["history"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.history.addUrl({ url: "https://example.com" })'
);
d(
  "chrome_history_deleteAll",
  "chrome",
  "Delete all history",
  ["history"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.history.deleteAll()"
);
d(
  "chrome_history_deleteRange",
  "chrome",
  "Delete history in range",
  ["history"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.history.deleteRange({ startTime: 0, endTime: Date.now() })"
);
d(
  "chrome_history_getVisits",
  "chrome",
  "Get visits for URL",
  ["history"],
  Le,
  "ECHROME",
  "extension",
  [],
  'chrome.history.getVisits({ url: "https://example.com" })'
);
y(
  "chrome_identity_getAuthToken",
  ["identity"],
  "Get OAuth auth token",
  k,
  "chrome.identity.getAuthToken({ interactive: true })",
  "{ accessToken: string }"
);
y(
  "chrome_identity_getProfileUserInfo",
  ["identity"],
  "Get profile user info",
  k,
  "chrome.identity.getProfileUserInfo()",
  "{ email: string, id: string }"
);
y(
  "chrome_identity_launchWebAuthFlow",
  ["identity"],
  "Launch web auth flow",
  k,
  'chrome.identity.launchWebAuthFlow({ url: "https://example.com/auth" })',
  "string"
);
y(
  "chrome_idle_queryState",
  ["idle"],
  "Query idle state",
  k,
  "chrome.idle.queryState(60)",
  '"active" | "idle" | "locked"'
);
y(
  "chrome_management_get",
  ["management"],
  "Get extension info",
  k,
  'chrome.management.get("extensionId")',
  "ExtensionInfo"
);
y(
  "chrome_management_getAll",
  ["management"],
  "Get all extensions",
  k,
  "chrome.management.getAll()",
  "ExtensionInfo[]"
);
y(
  "chrome_management_setEnabled",
  ["management"],
  "Enable or disable extension",
  Q,
  'chrome.management.setEnabled("extensionId", true)',
  "null"
);
y(
  "chrome_management_uninstall",
  ["management"],
  "Uninstall extension",
  Q,
  'chrome.management.uninstall("extensionId")',
  "null"
);
d(
  "chrome_notifications_create",
  "chrome",
  "Create a notification",
  ["notifications"],
  Pt,
  "ECHROME",
  "extension",
  [
    {
      name: "id",
      type: "string",
      required: !1,
      description: "Notification ID (literal)"
    },
    {
      name: "options",
      type: "{ type?: string, iconUrl?: string, title?: string, message?: string }",
      required: !1,
      description: "Notification options (literal)"
    }
  ],
  'chrome.notifications.create("notificationId", { type: "basic", title: "Hello", message: "World" })'
);
d(
  "chrome_notifications_clear",
  "chrome",
  "Clear a notification",
  ["notifications"],
  jt,
  "ECHROME",
  "extension",
  [
    {
      name: "id",
      type: "string",
      required: !1,
      description: "Notification ID to clear (literal)"
    }
  ],
  'chrome.notifications.clear("notificationId")'
);
d(
  "chrome_notifications_getAll",
  "chrome",
  "Get all notifications",
  ["notifications"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  "chrome.notifications.getAll()",
  "{ [id: string]: NotificationOptions }"
);
d(
  "chrome_notifications_update",
  "chrome",
  "Update a notification",
  ["notifications"],
  t.boolean(),
  "ECHROME",
  "extension",
  [],
  'chrome.notifications.update("notificationId", { title: "Updated" })'
);
y(
  "chrome_offscreen_closeDocument",
  ["offscreen"],
  "Close offscreen document",
  Q,
  "chrome.offscreen.closeDocument()",
  "null"
);
y(
  "chrome_offscreen_createDocument",
  ["offscreen"],
  "Create offscreen document",
  k,
  'chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["WORKERS"] })',
  "null"
);
y(
  "chrome_pageCapture_saveAsMHTML",
  ["pageCapture"],
  "Save page as MHTML",
  k,
  "chrome.pageCapture.saveAsMHTML({ tabId: 123 })",
  "Blob"
);
async function $t(e, r, n, a) {
  var l;
  const o = window.chrome;
  if (!((l = o == null ? void 0 : o.runtime) != null && l.id))
    throw I(
      `${e} is only available in a browser extension context`,
      "E_NO_EXTENSION",
      "permission"
    );
  const i = Me(
    e,
    Pe(a, e)
  ), s = bt(o, r, n), c = await Promise.resolve(pt(s, i));
  return await ct(), c;
}
y(
  "chrome_permissions_contains",
  ["permissions"],
  "Check permission",
  k,
  'chrome.permissions.contains({ permissions: ["tabs"] })',
  "boolean"
);
y(
  "chrome_permissions_getAll",
  ["permissions"],
  "Get all permissions",
  k,
  "chrome.permissions.getAll()",
  "{ permissions: string[], origins: string[] }"
);
p({
  action: "chrome_permissions_remove",
  namespace: "chrome.permissions",
  name: "remove",
  description: "Remove permissions",
  params: t.unknown(),
  returns: Q,
  owner: "main-thread",
  returnType: "boolean",
  handler: async (e) => $t(
    "chrome_permissions_remove",
    ["permissions"],
    "remove",
    e
  ),
  paramTypes: [],
  returnDoc: "boolean",
  errorCode: "ECHROME",
  example: 'chrome.permissions.remove({ permissions: ["tabs"] })'
});
p({
  action: "chrome_permissions_request",
  namespace: "chrome.permissions",
  name: "request",
  description: "Request permissions",
  params: t.unknown(),
  returns: Q,
  owner: "main-thread",
  returnType: "boolean",
  handler: async (e) => $t(
    "chrome_permissions_request",
    ["permissions"],
    "request",
    e
  ),
  paramTypes: [],
  returnDoc: "boolean",
  errorCode: "ECHROME",
  example: 'chrome.permissions.request({ permissions: ["tabs"] })'
});
d(
  "chrome_runtime_sendMessage",
  "chrome",
  "Send a runtime message",
  ["runtime"],
  t.unknown(),
  "ECHROME",
  "extension",
  [],
  'chrome.runtime.sendMessage({ greeting: "hello" })',
  "message response"
);
d(
  "chrome_runtime_connect",
  "chrome",
  "Connect to extension runtime",
  ["runtime"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  'chrome.runtime.connect({ name: "myPort" })',
  "Port"
);
d(
  "chrome_runtime_getURL",
  "chrome",
  "Get extension resource URL",
  ["runtime"],
  t.string(),
  "ECHROME",
  "extension",
  [],
  'chrome.runtime.getURL("page.html")'
);
d(
  "chrome_runtime_getManifest",
  "chrome",
  "Get extension manifest",
  ["runtime"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  "chrome.runtime.getManifest()",
  "Manifest"
);
d(
  "chrome_scripting_executeScript",
  "chrome",
  "Execute a script",
  ["scripting"],
  $a,
  "ECHROME",
  "extension",
  [],
  "chrome.scripting.executeScript({ target: { tabId: 1 }, func: () => document.title })"
);
d(
  "chrome_scripting_insertCSS",
  "chrome",
  "Insert CSS into a tab",
  ["scripting"],
  k,
  "ECHROME",
  "extension",
  [],
  'chrome.scripting.insertCSS({ target: { tabId: 1 }, css: "body { color: red; }" })',
  "null"
);
d(
  "chrome_scripting_removeCSS",
  "chrome",
  "Remove CSS from a tab",
  ["scripting"],
  k,
  "ECHROME",
  "extension",
  [],
  'chrome.scripting.removeCSS({ target: { tabId: 1 }, css: "body { color: red; }" })',
  "null"
);
d(
  "chrome_sessions_getRecentlyClosed",
  "chrome",
  "Get recently closed sessions",
  ["sessions"],
  Fe,
  "ECHROME",
  "extension",
  [],
  "chrome.sessions.getRecentlyClosed()"
);
d(
  "chrome_sessions_restore",
  "chrome",
  "Restore a session",
  ["sessions"],
  Fe,
  "ECHROME",
  "extension",
  [
    {
      name: "sessionId",
      type: "string",
      required: !1,
      description: "Session ID (literal)"
    }
  ],
  'chrome.sessions.restore("sessionId")'
);
d(
  "chrome_sessions_getDevices",
  "chrome",
  "Get synced devices",
  ["sessions"],
  Xa,
  "ECHROME",
  "extension",
  [],
  "chrome.sessions.getDevices()"
);
d(
  "chrome_sidePanel_setOptions",
  "chrome",
  "Set sidepanel options",
  ["sidePanel"],
  w,
  "ECHROME",
  "extension",
  [],
  'chrome.sidePanel.setOptions({ path: "sidepanel.html" })'
);
d(
  "chrome_sidePanel_setPanelBehavior",
  "chrome",
  "Set sidepanel behavior",
  ["sidePanel"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })"
);
d(
  "chrome_system_cpu_getInfo",
  "chrome",
  "Get CPU info",
  ["system", "cpu"],
  eo,
  "ECHROME",
  "extension",
  [],
  "chrome.system.cpu.getInfo()"
);
d(
  "chrome_system_memory_getInfo",
  "chrome",
  "Get memory info",
  ["system", "memory"],
  to,
  "ECHROME",
  "extension",
  [],
  "chrome.system.memory.getInfo()"
);
d(
  "chrome_system_storage_getInfo",
  "chrome",
  "Get storage info",
  ["system", "storage"],
  ro,
  "ECHROME",
  "extension",
  [],
  "chrome.system.storage.getInfo()"
);
d(
  "chrome_tabGroups_query",
  "chrome",
  "Query tab groups",
  ["tabGroups"],
  Va,
  "ECHROME",
  "extension",
  [],
  "chrome.tabGroups.query({})"
);
d(
  "chrome_tabGroups_get",
  "chrome",
  "Get a tab group",
  ["tabGroups"],
  Ie,
  "ECHROME",
  "extension",
  [],
  "chrome.tabGroups.get(1)"
);
d(
  "chrome_tabGroups_update",
  "chrome",
  "Update a tab group",
  ["tabGroups"],
  Ie,
  "ECHROME",
  "extension",
  [],
  'chrome.tabGroups.update(1, { title: "Work" })'
);
d(
  "chrome_tabGroups_move",
  "chrome",
  "Move a tab group",
  ["tabGroups"],
  Ie,
  "ECHROME",
  "extension",
  [],
  "chrome.tabGroups.move(1, { index: 0 })"
);
d(
  "chrome_tabs_query",
  "chrome",
  "Query tabs",
  ["tabs"],
  ee,
  "ECHROME",
  "extension",
  [],
  "chrome.tabs.query({})"
);
d(
  "chrome_tabs_create",
  "chrome",
  "Create a tab",
  ["tabs"],
  O,
  "ECHROME",
  "extension",
  [],
  'chrome.tabs.create({ url: "https://example.com" })'
);
d(
  "chrome_tabs_update",
  "chrome",
  "Update a tab",
  ["tabs"],
  O,
  "ECHROME",
  "extension",
  [],
  "chrome.tabs.update(1, { active: true })"
);
d(
  "chrome_tabs_remove",
  "chrome",
  "Remove a tab",
  ["tabs"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID to remove (literal)"
    }
  ],
  "chrome.tabs.remove(1)"
);
d(
  "chrome_tabs_get",
  "chrome",
  "Get a tab",
  ["tabs"],
  O,
  "ECHROME",
  "extension",
  [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID to get (literal)"
    }
  ],
  "chrome.tabs.get(1)"
);
d(
  "chrome_tabs_reload",
  "chrome",
  "Reload a tab",
  ["tabs"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID to reload (literal)"
    }
  ],
  "chrome.tabs.reload(1)"
);
d(
  "chrome_tabs_sendMessage",
  "chrome",
  "Send a message to a tab",
  ["tabs"],
  t.unknown(),
  "ECHROME",
  "extension",
  [
    {
      name: "tabId",
      type: "number",
      required: !1,
      description: "Tab ID (literal)"
    },
    {
      name: "message",
      type: "message payload",
      required: !1,
      description: "Message to send (literal)"
    }
  ],
  'chrome.tabs.sendMessage(123, { greeting: "hello" })',
  "message response"
);
d(
  "chrome_tabs_connect",
  "chrome",
  "Connect to a tab",
  ["tabs"],
  t.record(t.unknown()),
  "ECHROME",
  "extension",
  [],
  'chrome.tabs.connect(123, { name: "myPort" })',
  "Port"
);
d(
  "chrome_tabs_group",
  "chrome",
  "Group tabs",
  ["tabs"],
  t.number(),
  "ECHROME",
  "extension",
  [],
  "chrome.tabs.group({ tabIds: [1, 2, 3] })"
);
d(
  "chrome_tabs_ungroup",
  "chrome",
  "Ungroup tabs",
  ["tabs"],
  w,
  "ECHROME",
  "extension",
  [],
  "chrome.tabs.ungroup([1, 2, 3])"
);
y(
  "chrome_topSites_get",
  ["topSites"],
  "Get top sites",
  k,
  "chrome.topSites.get()",
  "MostVisitedURL[]"
);
y(
  "chrome_tts_getVoices",
  ["tts"],
  "Get TTS voices",
  k,
  "chrome.tts.getVoices()",
  "TtsVoice[]"
);
y(
  "chrome_tts_speak",
  ["tts"],
  "Speak text",
  Q,
  'chrome.tts.speak("Hello world")',
  "null"
);
y(
  "chrome_tts_stop",
  ["tts"],
  "Stop TTS",
  Q,
  "chrome.tts.stop()",
  "null"
);
d(
  "chrome_windows_getCurrent",
  "chrome",
  "Get the current window",
  ["windows"],
  le,
  "ECHROME",
  "extension",
  [
    {
      name: "populate",
      type: "boolean",
      required: !1,
      description: "Whether to populate tab info (literal)"
    }
  ],
  "chrome.windows.getCurrent({ populate: true })"
);
d(
  "chrome_windows_getAll",
  "chrome",
  "Get all windows",
  ["windows"],
  Fa,
  "ECHROME",
  "extension",
  [],
  "chrome.windows.getAll({ populate: false })"
);
d(
  "chrome_windows_create",
  "chrome",
  "Create a window",
  ["windows"],
  le,
  "ECHROME",
  "extension",
  [],
  'chrome.windows.create({ url: "https://example.com" })'
);
d(
  "chrome_windows_update",
  "chrome",
  "Update a window",
  ["windows"],
  le,
  "ECHROME",
  "extension",
  [],
  "chrome.windows.update(1, { focused: true })"
);
d(
  "chrome_windows_remove",
  "chrome",
  "Remove a window",
  ["windows"],
  w,
  "ECHROME",
  "extension",
  [
    {
      name: "windowId",
      type: "number",
      required: !1,
      description: "Window ID to remove"
    }
  ],
  "chrome.windows.remove(1)"
);
function po(e, r) {
  if (r.length === 1 && typeof r[0] == "string")
    switch (e) {
      case "history_delete":
        return [{ url: r[0] }];
      case "bookmarks_search":
        return [{ query: r[0] }];
      case "bookmarks_delete":
      case "notifications_clear":
        return [r[0]];
    }
  if (e === "notifications_create" && r.length === 1 && r[0] !== null && typeof r[0] == "object" && !Array.isArray(r[0])) {
    const n = r[0];
    if ("options" in n)
      return [n.id ?? "", n.options];
  }
  return [...r];
}
function L(e, r, n, a, o = [], i) {
  const s = e.split("_"), c = s[s.length - 1], l = s.length > 1 ? s[0] : "", u = l ? `web.${l}` : "web", m = dt(r);
  p({
    action: e,
    namespace: u,
    name: c,
    description: n,
    params: t.unknown(),
    returns: a,
    owner: "main-thread",
    permission: m ?? void 0,
    handler: async (f, b) => {
      const v = h.child("alias");
      qe(e, m);
      const g = po(
        e,
        Pe(f, e)
      );
      return v.debug("alias_dispatch", { action: e, target: r, argCount: g.length }), S(await C(r, g));
    },
    paramTypes: o,
    returnDoc: "Alias result",
    errorCode: "ECHROME",
    errorCategory: "extension",
    example: i
  });
}
L(
  "cookies_get",
  "chrome_cookies_get",
  "Get a cookie",
  de,
  [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "Cookie URL (url)"
    },
    {
      name: "name",
      type: "string",
      required: !1,
      description: "Cookie name (literal)"
    }
  ],
  'web.cookies.get({ url: "https://example.com", name: "session" })'
);
L(
  "cookies_set",
  "chrome_cookies_set",
  "Set a cookie",
  de,
  [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "Cookie URL (url)"
    },
    {
      name: "name",
      type: "string",
      required: !1,
      description: "Cookie name (literal)"
    },
    {
      name: "value",
      type: "string",
      required: !1,
      description: "Cookie value (literal)"
    }
  ],
  'web.cookies.set({ url: "https://example.com", name: "session", value: "abc" })'
);
L(
  "cookies_delete",
  "chrome_cookies_remove",
  "Remove a cookie",
  t.record(t.unknown()),
  [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "Cookie URL (url)"
    },
    {
      name: "name",
      type: "string",
      required: !1,
      description: "Cookie name (literal)"
    }
  ],
  'web.cookies.delete({ url: "https://example.com", name: "session" })'
);
L(
  "cookies_list",
  "chrome_cookies_getAll",
  "Get all cookies",
  Mt,
  [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "Cookie URL (url)"
    }
  ],
  'web.cookies.list({ url: "https://example.com" })'
);
L(
  "history_search",
  "chrome_history_search",
  "Search history",
  Le,
  [
    {
      name: "text",
      type: "string",
      required: !1,
      description: "Search text (literal)"
    },
    {
      name: "maxResults",
      type: "number",
      required: !1,
      description: "Maximum results (literal)"
    }
  ],
  'web.history.search({ text: "example", maxResults: 10 })'
);
L(
  "history_delete",
  "chrome_history_deleteUrl",
  "Delete a URL from history",
  t.null(),
  [
    {
      name: "url",
      type: "string",
      required: !1,
      description: "URL to delete from history (url)"
    }
  ],
  'web.history.delete("https://example.com")'
);
L(
  "bookmarks_search",
  "chrome_bookmarks_search",
  "Search bookmarks",
  ue,
  [
    {
      name: "query",
      type: "string",
      required: !1,
      description: "Search query (literal)"
    }
  ],
  'web.bookmarks.search("example")'
);
L(
  "bookmarks_create",
  "chrome_bookmarks_create",
  "Create a bookmark",
  t.record(t.unknown()),
  [
    {
      name: "parentId",
      type: "string",
      required: !1,
      description: "Parent folder ID (literal)"
    },
    {
      name: "title",
      type: "string",
      required: !1,
      description: "Bookmark title (literal)"
    },
    {
      name: "url",
      type: "string",
      required: !1,
      description: "Bookmark URL (url)"
    }
  ],
  'web.bookmarks.create({ title: "Example", url: "https://example.com" })'
);
L(
  "bookmarks_delete",
  "chrome_bookmarks_remove",
  "Remove a bookmark",
  t.null(),
  [
    {
      name: "id",
      type: "string",
      required: !1,
      description: "Bookmark ID to remove (literal)"
    }
  ],
  'web.bookmarks.delete("bookmarkId")'
);
L(
  "notifications_create",
  "chrome_notifications_create",
  "Create a notification",
  Pt,
  [
    {
      name: "id",
      type: "string",
      required: !1,
      description: "Notification ID (literal)"
    },
    {
      name: "options",
      type: "{ type?: string, iconUrl?: string, title?: string, message?: string }",
      required: !1,
      description: "Notification options (literal)"
    }
  ],
  'web.notifications.create({ id: "test", options: { type: "basic", title: "Hello", message: "World" } })'
);
L(
  "notifications_clear",
  "chrome_notifications_clear",
  "Clear a notification",
  jt,
  [
    {
      name: "id",
      type: "string",
      required: !1,
      description: "Notification ID to clear (literal)"
    }
  ],
  'web.notifications.clear("test")'
);
p({
  action: "host_call",
  namespace: "host",
  name: "call",
  description: "Call a host handler",
  params: qa,
  returns: Ma,
  fields: ["action", "params"],
  owner: "main-thread",
  handler: async (e, r) => {
    const n = W(e), a = n.action, o = n.params;
    return S(await ft(a, o));
  },
  paramTypes: [
    {
      name: "action",
      type: "string",
      required: !0,
      description: "Host action name (literal)"
    },
    {
      name: "params",
      type: "host action parameters",
      required: !1,
      description: "Parameters for the host action (literal)"
    }
  ],
  returnDoc: "Handler result",
  errorCode: "ENOHANDLER",
  errorCategory: "host",
  example: 'host.call(["title", "url"])'
});
class Kt {
  constructor() {
    M(this, "worker", null);
    M(this, "pendingCalls", /* @__PURE__ */ new Map());
    M(this, "inFlightRelays", /* @__PURE__ */ new Map());
    M(this, "disposed", !1);
    M(this, "onCleanupComplete", null);
    M(this, "abortController", null);
    M(this, "runQueue", Promise.resolve());
  }
  /**
   * Initialize the extension-js runtime.
   * Automatically detects extension context, spawns the Worker,
   * starts the main-thread runner loop, and returns [session, runner].
   *
   * The spawned Worker uses `new Worker(..., { type: "module" })`. Your bundler
   * must support emitting module Workers as separate chunks.
   *
   * AbortController is module-global: only one active session per extension
   * page is fully safe. Concurrent sessions race on the same abort signal.
   */
  static async init() {
    var c;
    if (h.trace("init_start"), Te(new AbortController()), typeof chrome < "u" && ((c = chrome.runtime) != null && c.id)) {
      hr(chrome);
      const { initCapabilities: l } = await Promise.resolve().then(() => wr);
      await l();
    }
    const { freezeJsRegistry: r } = await Promise.resolve().then(() => Be);
    r();
    const { getSerializableJsManifest: n } = await Promise.resolve().then(() => Be), a = n(), o = new Kt(), [i, s] = o.startWorker(a);
    return await i, h.trace("init_ready"), [o, s];
  }
  startWorker(r) {
    var u;
    let n, a;
    const o = new Promise((m, f) => {
      n = m, a = f;
    });
    let i = () => {
    };
    const s = new Promise((m) => {
      i = m;
    });
    this.onCleanupComplete = i;
    const c = new Worker(new URL(
      /* @vite-ignore */
      "" + new URL("worker.js", import.meta.url).href,
      import.meta.url
    ), {
      type: "module"
    });
    this.worker = c, c.onerror = (m) => {
      a(new Error(m.message));
    }, c.onmessageerror = (m) => {
      a(new Error(`Worker message deserialization error: ${m.data}`));
    }, c.onmessage = async (m) => {
      var b;
      const f = m.data;
      switch (f.type) {
        case "ready": {
          c.onmessage = this.handleWorkerMessage.bind(this), n();
          break;
        }
        case "error": {
          const v = typeof f.error == "string" ? f.error : ((b = f.error) == null ? void 0 : b.message) || "Worker init error";
          a(new Error(v));
          break;
        }
      }
    };
    const l = typeof chrome < "u" && ((u = chrome.runtime) != null && u.id) ? chrome.runtime.id : void 0;
    return c.postMessage({ type: "init", manifest: r, extensionId: l }), h.trace("startWorker_posted_init", {
      extensionId: l ?? null
    }), [o, s];
  }
  handleWorkerMessage(r) {
    var a, o;
    const n = r.data;
    switch (h.trace("worker_message", {
      type: n.type,
      id: "id" in n ? n.id : void 0
    }), n.type) {
      case "result": {
        const i = n.id;
        if (!i) break;
        const s = this.pendingCalls.get(i);
        s ? (this.pendingCalls.delete(i), h.trace("result", { callId: i, runId: n.runId }), s.resolve(n.data)) : h.trace("result_no_pending", { callId: i, runId: n.runId });
        break;
      }
      case "error": {
        const i = n.id, s = n.error, c = typeof s == "string" ? s : (s == null ? void 0 : s.message) || "Worker error";
        h.trace("error", { callId: i, error: c, runId: n.runId });
        const l = (() => {
          if (typeof s == "object" && s !== null) {
            const u = new Error(s.message || "Worker error");
            return u.name = s.name || "Error", s.stack && (u.stack = s.stack), s.line && (u.line = s.line), u;
          }
          return new Error(c);
        })();
        if (i) {
          const u = this.pendingCalls.get(i);
          if (u) {
            this.pendingCalls.delete(i), u.reject(l);
            break;
          }
        }
        h.error("worker_error", { error: c });
        break;
      }
      case "ready":
        break;
      case "relayCancel": {
        if (!n.id) break;
        h.trace("relayCancel", { id: n.id }), (a = this.inFlightRelays.get(n.id)) == null || a.abort();
        break;
      }
      case "asyncRelay": {
        if (!n.id || !n.command) break;
        const i = n.command;
        if (typeof i != "object" || i === null || !("action" in i)) {
          h.warn("asyncRelay_invalid_command", { id: n.id }), (o = this.worker) == null || o.postMessage({
            type: "asyncRelayResult",
            id: n.id,
            result: {
              ok: !1,
              error: {
                message: "Invalid relay command",
                code: "E_INVALID_COMMAND"
              }
            }
          });
          break;
        }
        const s = String(i.action), c = n.owner ?? "main-thread", l = n.tabPolicy ?? "active", u = n.id, m = new AbortController();
        this.inFlightRelays.set(u, m), h.trace("asyncRelay", {
          action: s,
          owner: c,
          id: u,
          runId: n.runId,
          tabPolicy: l
        });
        const f = i;
        f.runId = n.runId, this.executeContextCommand(
          c,
          f,
          l,
          u,
          m.signal
        ).then((b) => {
          var v;
          if (!(m.signal.aborted && !(typeof b == "object" && b !== null && "ok" in b && b.ok === !0))) {
            h.trace("asyncRelayResult", {
              action: s,
              id: u,
              resultType: typeof b
            });
            try {
              (v = this.worker) == null || v.postMessage({
                type: "asyncRelayResult",
                id: u,
                result: b,
                callId: f.call_id
              });
            } catch (g) {
              const x = g instanceof Error ? g.message : String(g);
              h.error("asyncRelayResult_post_failed", {
                action: s,
                id: u,
                error: x
              });
            }
          }
        }).catch((b) => {
          var g;
          if (m.signal.aborted)
            return;
          const v = b instanceof Error ? b.message : String(b);
          h.error("asyncRelay_error", {
            action: s,
            id: u,
            error: v
          });
          try {
            (g = this.worker) == null || g.postMessage({
              type: "asyncRelayResult",
              id: u,
              result: {
                ok: !1,
                error: { message: v, code: "E_RUNNER" }
              },
              callId: f.call_id
            });
          } catch (x) {
            const N = x instanceof Error ? x.message : String(x);
            h.error("asyncRelayResult_post_failed", {
              action: s,
              id: u,
              error: N
            });
          }
        }).finally(() => {
          this.inFlightRelays.delete(u);
        });
        break;
      }
      default: {
        h.error("unhandled_worker_response", {
          type: n.type
        });
        break;
      }
    }
  }
  executeContextCommand(r, n, a = "active", o, i) {
    return h.trace("executeContextCommand", {
      owner: r,
      action: n.action,
      relayId: o,
      tabPolicy: a,
      callId: n.call_id,
      runId: n.runId
    }), i != null && i.aborted ? Promise.resolve({
      ok: !1,
      error: { message: "Relay aborted", code: "E_ABORT" }
    }) : r === "main-thread" ? ht(n.action) ? this.withMainThreadTimeout(
      Mr(n, i),
      n.action
    ) : Promise.resolve({
      ok: !1,
      error: {
        message: `Unknown action: ${n.action}`,
        code: "E_UNKNOWN"
      }
    }) : r === "content-script" ? this.executeContentScriptCommand(n, a, o, i) : Promise.resolve({
      ok: !1,
      error: {
        message: `Unknown execution context: ${r}`,
        code: "E_UNKNOWN_CONTEXT"
      }
    });
  }
  /**
   * Race a main-thread command against a hard timeout. If the handler hangs
   * (e.g. waitForTabLoad on a page that never reaches `complete`, or a content
   * script that never reconnects), this converts the hang into a structured
   * E_TIMEOUT error that the relay posts back to the worker — instead of
   * leaving the cell's join_all awaiting forever.
   */
  withMainThreadTimeout(r, n, a = 12e4) {
    let o;
    const i = new Promise((s) => {
      o = setTimeout(
        () => s({
          ok: !1,
          error: {
            message: `Main-thread action "${n}" timed out after ${a}ms`,
            code: "E_TIMEOUT"
          }
        }),
        a
      );
    });
    return Promise.race([r, i]).finally(() => {
      o && clearTimeout(o);
    });
  }
  registerWorkerRelayPort(r, n) {
    if (!this.worker || this.disposed)
      throw new Error(
        "ExtensionSession is not initialized or has been stopped"
      );
    this.worker.postMessage({ type: "registerWorkerPort", owner: r }, [n]);
  }
  async executeContentScriptCommand(r, n, a, o) {
    var v;
    if (o != null && o.aborted)
      return {
        ok: !1,
        error: { message: "Relay aborted", code: "E_ABORT" }
      };
    const i = window.chrome;
    if (!((v = i == null ? void 0 : i.runtime) != null && v.id))
      return {
        ok: !1,
        error: {
          message: "Not in extension context",
          code: "E_NO_EXTENSION",
          category: "permission"
        }
      };
    const s = typeof r.params == "object" && r.params !== null ? r.params : {};
    let c;
    try {
      c = yr(n, s);
    } catch (g) {
      return {
        ok: !1,
        error: { message: g instanceof Error ? g.message : String(g), code: "E_NO_TAB", category: "resource" }
      };
    }
    let l = !1;
    const u = () => {
      l = !0, a && i.tabs.sendMessage(c, { type: "registryCallCancel", id: a }).catch(() => {
      });
    };
    o == null || o.addEventListener("abort", u, { once: !0 });
    let m = "";
    try {
      m = (await i.tabs.get(c)).url ?? "";
    } catch {
    }
    const f = await Lt(c);
    if (f && !f.ok)
      return f;
    const b = await We(c, yt);
    if (!b.ok)
      return b;
    try {
      const g = await i.tabs.sendMessage(c, {
        type: "registryCall",
        id: a,
        action: r.action,
        params: r.params,
        callId: r.call_id,
        runId: r.runId
      }), x = Ut(g);
      return l && x.ok ? x : l ? {
        ok: !1,
        error: { message: "Relay aborted", code: "E_ABORT" }
      } : x;
    } catch (g) {
      return l || o != null && o.aborted ? {
        ok: !1,
        error: { message: "Relay aborted", code: "E_ABORT" }
      } : {
        ok: !1,
        error: Ye(g, {
          tabId: c,
          url: m,
          action: r.action
        })
      };
    } finally {
      o == null || o.removeEventListener("abort", u);
    }
  }
  postAndWait(r) {
    h.trace("postAndWait", {
      type: r.type,
      id: r.id,
      runId: "runId" in r ? r.runId : void 0
    });
    const n = this.worker;
    return !n || this.disposed ? Promise.reject(
      new Error("ExtensionSession is not initialized or has been stopped")
    ) : new Promise((a, o) => {
      this.pendingCalls.set(r.id, {
        resolve: a,
        reject: o
      }), n.postMessage(r);
    });
  }
  async runCellAsync(r, n, a) {
    const o = this.generateId(), i = a || this.generateId(), s = this.runQueue.then(async () => {
      h.trace("runCell_start", {
        runId: i,
        callId: o,
        codeLen: r.length
      });
      try {
        const c = await this.postAndWait({
          type: "runCell",
          id: o,
          code: r,
          stdin: n || "",
          runId: i
        });
        return h.trace("runCell_done", {
          runId: i,
          callId: o,
          status: c.status
        }), c;
      } catch (c) {
        const l = c instanceof Error ? c.message : String(c);
        throw h.error("runCell_failed", { runId: i, callId: o, error: l }), c;
      }
    });
    return this.runQueue = s.then(
      () => {
      },
      () => {
      }
    ), s;
  }
  setLogLevel(r) {
    h.trace("setLogLevel", { level: r }), Xt(r), !(!this.worker || this.disposed) && this.worker.postMessage({
      type: "setLogLevel",
      level: Ce[r]
    });
  }
  reset() {
    const r = this.generateId();
    return this.postAndWait({ type: "reset", id: r });
  }
  inspectGlobals() {
    const r = this.generateId();
    return this.postAndWait({ type: "inspectGlobals", id: r });
  }
  apiDocs(r = "json") {
    const n = this.generateId();
    return this.postAndWait({ type: "apiDocs", id: n, format: r }).then(
      (a) => r === "json" ? JSON.parse(a) : a
    );
  }
  setFuelLimit(r) {
    !this.worker || this.disposed || this.worker.postMessage({ type: "setFuelLimit", limit: r });
  }
  loadLibrary(r) {
    const n = this.generateId();
    return this.postAndWait({ type: "loadLibrary", id: n, source: r });
  }
  async safePost(r, n) {
    const a = this.generateId();
    return this.postAndWait({
      type: "fsCall",
      id: a,
      action: r,
      params: n
    });
  }
  get fs() {
    return {
      exists: (r) => this.safePost("exists", r),
      stat: (r) => this.safePost("stat", r),
      read: (r) => this.safePost("read", r),
      readText: (r) => this.safePost("readText", r),
      readBase64: (r) => this.safePost("readBase64", r),
      list: (r) => this.safePost("list", r),
      mkdir: (r) => this.safePost("mkdir", r),
      delete: (r) => this.safePost("delete", r),
      copy: (r) => this.safePost("copy", r),
      move: (r) => this.safePost("move", r),
      write: (r) => this.safePost("write", r),
      writeText: (r) => this.safePost("writeText", r),
      writeBase64: (r) => this.safePost("writeBase64", r),
      append: (r) => this.safePost("append", r),
      appendText: (r) => this.safePost("appendText", r),
      appendBase64: (r) => this.safePost("appendBase64", r),
      readRange: (r) => this.safePost("readRange", r),
      update: (r) => this.safePost("update", r),
      hash: (r) => this.safePost("hash", r)
    };
  }
  get snapshot() {
    return {
      query: async (r, n) => {
        const a = await this.executeContentScriptCommand(
          {
            action: "page_snapshot_query",
            params: { filter: r ?? {}, max_nodes: n == null ? void 0 : n.maxNodes }
          },
          n != null && n.tabId ? "required" : "active"
        );
        if (typeof a == "object" && a !== null && "ok" in a && !a.ok) {
          const o = a.error;
          throw new Error((o == null ? void 0 : o.message) ?? "snapshot_query failed");
        }
        return a;
      }
    };
  }
  /**
   * Clean up the session, terminate the Worker, and release resources.
   * Accepts the runner Promise returned by init() so it can be awaited
   * for graceful shutdown.
   *
   * Sends a reset message to the Worker, then waits only 50 ms before
   * forcefully calling worker.terminate(). If WASM cleanup takes longer,
   * the Worker is killed mid-operation. Pending async calls are rejected
   * with "ExtensionSession stopped".
   */
  async stopWith(r) {
    if (!this.disposed) {
      this.disposed = !0, this.abortController = new AbortController(), Te(this.abortController), this.abortController.abort();
      for (const [, n] of this.inFlightRelays)
        n.abort();
      this.inFlightRelays.clear(), this.worker && this.worker.postMessage({ type: "stop", id: this.generateId() }), fr(), await new Promise((n) => setTimeout(n, 50)), this.worker && (this.worker.terminate(), this.worker = null);
      for (const [, n] of this.pendingCalls)
        n.reject(new Error("ExtensionSession stopped"));
      this.pendingCalls.clear(), this.onCleanupComplete && (this.onCleanupComplete(), this.onCleanupComplete = null);
      try {
        await r;
      } catch (n) {
        h.warn("runner_rejected_during_stop", { error: n });
      }
    }
  }
  generateId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
function _o(e, r, n) {
  e.registerWorkerRelayPort(r, n);
}
export {
  Kt as ExtensionSession,
  Ce as LOG_LEVEL_NUMERIC,
  go as registerHostHandler,
  yo as registerHostHandlers,
  _o as registerWorkerRelayPort,
  Xt as setLogLevel
};
