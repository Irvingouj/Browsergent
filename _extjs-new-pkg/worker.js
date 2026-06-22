import er, { setLogLevel as Ye, ExtensionSession as tr, registerJsCallBatch as rr, takeCachedVfsWriteBase64 as nr, webFsReadBase64 as sr, clearVfsWriteCache as ir } from "./extension_js.js";
const je = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  none: 5
}, ar = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "none"
];
function or(t) {
  const e = Math.max(0, Math.min(5, Math.round(t)));
  return ar[e] ?? "error";
}
let dt = "trace", Ke = null;
function cr(t) {
  dt = t, Ke && Ke(je[t]);
}
function dr(t) {
  Ke = t, t(je[dt]);
}
function lr(t) {
  return je[t] >= je[dt];
}
function Nt(t, e = "info") {
  var r;
  if (t === null) return "null";
  if (t === void 0) return "undefined";
  if (typeof t == "string") return t;
  if (typeof t == "number" || typeof t == "boolean")
    return String(t);
  if (typeof t == "bigint") return `${t}n`;
  if (t instanceof Error) {
    const n = e === "debug" || e === "trace" ? t.stack : (r = t.stack) == null ? void 0 : r.split(`
`)[0];
    return JSON.stringify({ message: t.message, name: t.name, stack: n });
  }
  if (typeof t == "function") return "[Function]";
  if (typeof t == "symbol") return String(t);
  if (typeof t == "object")
    try {
      return JSON.stringify(t);
    } catch (n) {
      return n instanceof TypeError && n.message.includes("circular") ? "[Circular]" : `[Unserializable: ${n instanceof Error ? n.message : String(n)}]`;
    }
  return String(t);
}
function ur(t) {
  return `[extension-js][${t}]`;
}
function fr(t, e) {
  if (!t) return "";
  const r = [];
  try {
    for (const [n, s] of Object.entries(t))
      r.push(`${n}=${Nt(s, e)}`);
  } catch {
    return " metadata=[unreadable]";
  }
  return r.length > 0 ? ` ${r.join(" ")}` : "";
}
function be(t, e) {
  return e.length === 0 ? { event: t } : e.length === 1 && typeof e[0] == "object" && e[0] !== null && !Array.isArray(e[0]) ? { event: t, metadata: e[0] } : {
    event: t,
    metadata: { _args: e.map((r) => Nt(r)).join(" ") }
  };
}
class lt {
  constructor(e = "root") {
    this.namespace = e;
  }
  log(e, r, n) {
    try {
      if (!lr(e)) return;
      const s = ur(this.namespace), i = fr(n, e), c = `${s} ${r}${i}`;
      switch (e) {
        case "trace":
        case "debug":
        case "info":
          console.log(c);
          break;
        case "warn":
          console.warn(c);
          break;
        case "error":
          console.error(c);
          break;
        case "none":
          break;
        default: {
          const a = e;
          break;
        }
      }
    } catch {
    }
  }
  trace(e, ...r) {
    const { event: n, metadata: s } = be(e, r);
    this.log("trace", n, s);
  }
  debug(e, ...r) {
    const { event: n, metadata: s } = be(e, r);
    this.log("debug", n, s);
  }
  info(e, ...r) {
    const { event: n, metadata: s } = be(e, r);
    this.log("info", n, s);
  }
  warn(e, ...r) {
    const { event: n, metadata: s } = be(e, r);
    this.log("warn", n, s);
  }
  error(e, ...r) {
    const { event: n, metadata: s } = be(e, r);
    this.log("error", n, s);
  }
  child(e) {
    return new lt(`${this.namespace}.${e}`);
  }
  timer(e, r, n = "info") {
    const s = typeof performance < "u" && performance.now, i = s ? performance.now() : Date.now();
    return (c) => {
      try {
        const a = s ? performance.now() : Date.now(), h = Math.round(a - i), d = {
          ...r,
          ...c,
          duration_ms: h
        };
        this.log(n, e, d);
      } catch {
      }
    };
  }
}
const C = new lt("root");
function he(t) {
  return t == null ? {} : t instanceof Map ? Object.fromEntries(
    [...t.entries()].map(([e, r]) => [
      e,
      he(r)
    ])
  ) : Array.isArray(t) ? t.map(he) : t;
}
function hr(t) {
  return {
    action: t.action,
    namespace: t.namespace,
    name: t.name,
    publicName: t.publicName,
    description: t.description,
    fields: t.fields,
    aliases: (t.aliases ?? []).map((e) => ({
      namespace: e.namespace,
      name: e.name,
      fields: e.fields
    })),
    paramsDoc: t.paramsDoc.map((e) => ({
      name: e.name,
      type: e.type,
      required: e.required,
      description: e.description
    })),
    returnsDoc: {
      type: t.returnsDoc.type,
      description: t.returnsDoc.description
    },
    errorCode: t.errorCode,
    errorCategory: t.errorCategory ?? null,
    permission: t.permission ?? null,
    example: t.example ?? null,
    prerequisites: t.prerequisites ?? null,
    notes: t.notes ?? null,
    tags: t.tags ?? null,
    relatedApis: t.relatedApis ?? null
  };
}
var I;
(function(t) {
  t.assertEqual = (s) => {
  };
  function e(s) {
  }
  t.assertIs = e;
  function r(s) {
    throw new Error();
  }
  t.assertNever = r, t.arrayToEnum = (s) => {
    const i = {};
    for (const c of s)
      i[c] = c;
    return i;
  }, t.getValidEnumValues = (s) => {
    const i = t.objectKeys(s).filter((a) => typeof s[s[a]] != "number"), c = {};
    for (const a of i)
      c[a] = s[a];
    return t.objectValues(c);
  }, t.objectValues = (s) => t.objectKeys(s).map(function(i) {
    return s[i];
  }), t.objectKeys = typeof Object.keys == "function" ? (s) => Object.keys(s) : (s) => {
    const i = [];
    for (const c in s)
      Object.prototype.hasOwnProperty.call(s, c) && i.push(c);
    return i;
  }, t.find = (s, i) => {
    for (const c of s)
      if (i(c))
        return c;
  }, t.isInteger = typeof Number.isInteger == "function" ? (s) => Number.isInteger(s) : (s) => typeof s == "number" && Number.isFinite(s) && Math.floor(s) === s;
  function n(s, i = " | ") {
    return s.map((c) => typeof c == "string" ? `'${c}'` : c).join(i);
  }
  t.joinValues = n, t.jsonStringifyReplacer = (s, i) => typeof i == "bigint" ? i.toString() : i;
})(I || (I = {}));
var _t;
(function(t) {
  t.mergeShapes = (e, r) => ({
    ...e,
    ...r
    // second overwrites first
  });
})(_t || (_t = {}));
const g = I.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]), ee = (t) => {
  switch (typeof t) {
    case "undefined":
      return g.undefined;
    case "string":
      return g.string;
    case "number":
      return Number.isNaN(t) ? g.nan : g.number;
    case "boolean":
      return g.boolean;
    case "function":
      return g.function;
    case "bigint":
      return g.bigint;
    case "symbol":
      return g.symbol;
    case "object":
      return Array.isArray(t) ? g.array : t === null ? g.null : t.then && typeof t.then == "function" && t.catch && typeof t.catch == "function" ? g.promise : typeof Map < "u" && t instanceof Map ? g.map : typeof Set < "u" && t instanceof Set ? g.set : typeof Date < "u" && t instanceof Date ? g.date : g.object;
    default:
      return g.unknown;
  }
}, u = I.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
class j extends Error {
  get errors() {
    return this.issues;
  }
  constructor(e) {
    super(), this.issues = [], this.addIssue = (n) => {
      this.issues = [...this.issues, n];
    }, this.addIssues = (n = []) => {
      this.issues = [...this.issues, ...n];
    };
    const r = new.target.prototype;
    Object.setPrototypeOf ? Object.setPrototypeOf(this, r) : this.__proto__ = r, this.name = "ZodError", this.issues = e;
  }
  format(e) {
    const r = e || function(i) {
      return i.message;
    }, n = { _errors: [] }, s = (i) => {
      for (const c of i.issues)
        if (c.code === "invalid_union")
          c.unionErrors.map(s);
        else if (c.code === "invalid_return_type")
          s(c.returnTypeError);
        else if (c.code === "invalid_arguments")
          s(c.argumentsError);
        else if (c.path.length === 0)
          n._errors.push(r(c));
        else {
          let a = n, h = 0;
          for (; h < c.path.length; ) {
            const d = c.path[h];
            h === c.path.length - 1 ? (a[d] = a[d] || { _errors: [] }, a[d]._errors.push(r(c))) : a[d] = a[d] || { _errors: [] }, a = a[d], h++;
          }
        }
    };
    return s(this), n;
  }
  static assert(e) {
    if (!(e instanceof j))
      throw new Error(`Not a ZodError: ${e}`);
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, I.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(e = (r) => r.message) {
    const r = {}, n = [];
    for (const s of this.issues)
      if (s.path.length > 0) {
        const i = s.path[0];
        r[i] = r[i] || [], r[i].push(e(s));
      } else
        n.push(e(s));
    return { formErrors: n, fieldErrors: r };
  }
  get formErrors() {
    return this.flatten();
  }
}
j.create = (t) => new j(t);
const Te = (t, e) => {
  let r;
  switch (t.code) {
    case u.invalid_type:
      t.received === g.undefined ? r = "Required" : r = `Expected ${t.expected}, received ${t.received}`;
      break;
    case u.invalid_literal:
      r = `Invalid literal value, expected ${JSON.stringify(t.expected, I.jsonStringifyReplacer)}`;
      break;
    case u.unrecognized_keys:
      r = `Unrecognized key(s) in object: ${I.joinValues(t.keys, ", ")}`;
      break;
    case u.invalid_union:
      r = "Invalid input";
      break;
    case u.invalid_union_discriminator:
      r = `Invalid discriminator value. Expected ${I.joinValues(t.options)}`;
      break;
    case u.invalid_enum_value:
      r = `Invalid enum value. Expected ${I.joinValues(t.options)}, received '${t.received}'`;
      break;
    case u.invalid_arguments:
      r = "Invalid function arguments";
      break;
    case u.invalid_return_type:
      r = "Invalid function return type";
      break;
    case u.invalid_date:
      r = "Invalid date";
      break;
    case u.invalid_string:
      typeof t.validation == "object" ? "includes" in t.validation ? (r = `Invalid input: must include "${t.validation.includes}"`, typeof t.validation.position == "number" && (r = `${r} at one or more positions greater than or equal to ${t.validation.position}`)) : "startsWith" in t.validation ? r = `Invalid input: must start with "${t.validation.startsWith}"` : "endsWith" in t.validation ? r = `Invalid input: must end with "${t.validation.endsWith}"` : I.assertNever(t.validation) : t.validation !== "regex" ? r = `Invalid ${t.validation}` : r = "Invalid";
      break;
    case u.too_small:
      t.type === "array" ? r = `Array must contain ${t.exact ? "exactly" : t.inclusive ? "at least" : "more than"} ${t.minimum} element(s)` : t.type === "string" ? r = `String must contain ${t.exact ? "exactly" : t.inclusive ? "at least" : "over"} ${t.minimum} character(s)` : t.type === "number" ? r = `Number must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${t.minimum}` : t.type === "bigint" ? r = `Number must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${t.minimum}` : t.type === "date" ? r = `Date must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(t.minimum))}` : r = "Invalid input";
      break;
    case u.too_big:
      t.type === "array" ? r = `Array must contain ${t.exact ? "exactly" : t.inclusive ? "at most" : "less than"} ${t.maximum} element(s)` : t.type === "string" ? r = `String must contain ${t.exact ? "exactly" : t.inclusive ? "at most" : "under"} ${t.maximum} character(s)` : t.type === "number" ? r = `Number must be ${t.exact ? "exactly" : t.inclusive ? "less than or equal to" : "less than"} ${t.maximum}` : t.type === "bigint" ? r = `BigInt must be ${t.exact ? "exactly" : t.inclusive ? "less than or equal to" : "less than"} ${t.maximum}` : t.type === "date" ? r = `Date must be ${t.exact ? "exactly" : t.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(t.maximum))}` : r = "Invalid input";
      break;
    case u.custom:
      r = "Invalid input";
      break;
    case u.invalid_intersection_types:
      r = "Intersection results could not be merged";
      break;
    case u.not_multiple_of:
      r = `Number must be a multiple of ${t.multipleOf}`;
      break;
    case u.not_finite:
      r = "Number must be finite";
      break;
    default:
      r = e.defaultError, I.assertNever(t);
  }
  return { message: r };
};
let pr = Te;
function Qe() {
  return pr;
}
const Xe = (t) => {
  const { data: e, path: r, errorMaps: n, issueData: s } = t, i = [...r, ...s.path || []], c = {
    ...s,
    path: i
  };
  if (s.message !== void 0)
    return {
      ...s,
      path: i,
      message: s.message
    };
  let a = "";
  const h = n.filter((d) => !!d).slice().reverse();
  for (const d of h)
    a = d(c, { data: e, defaultError: a }).message;
  return {
    ...s,
    path: i,
    message: a
  };
};
function p(t, e) {
  const r = Qe(), n = Xe({
    issueData: e,
    data: t.data,
    path: t.path,
    errorMaps: [
      t.common.contextualErrorMap,
      // contextual error map is first priority
      t.schemaErrorMap,
      // then schema-bound map if available
      r,
      // then global override map
      r === Te ? void 0 : Te
      // then global default map
    ].filter((s) => !!s)
  });
  t.common.issues.push(n);
}
class $ {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    this.value === "valid" && (this.value = "dirty");
  }
  abort() {
    this.value !== "aborted" && (this.value = "aborted");
  }
  static mergeArray(e, r) {
    const n = [];
    for (const s of r) {
      if (s.status === "aborted")
        return v;
      s.status === "dirty" && e.dirty(), n.push(s.value);
    }
    return { status: e.value, value: n };
  }
  static async mergeObjectAsync(e, r) {
    const n = [];
    for (const s of r) {
      const i = await s.key, c = await s.value;
      n.push({
        key: i,
        value: c
      });
    }
    return $.mergeObjectSync(e, n);
  }
  static mergeObjectSync(e, r) {
    const n = {};
    for (const s of r) {
      const { key: i, value: c } = s;
      if (i.status === "aborted" || c.status === "aborted")
        return v;
      i.status === "dirty" && e.dirty(), c.status === "dirty" && e.dirty(), i.value !== "__proto__" && (typeof c.value < "u" || s.alwaysSet) && (n[i.value] = c.value);
    }
    return { status: e.value, value: n };
  }
}
const v = Object.freeze({
  status: "aborted"
}), _e = (t) => ({ status: "dirty", value: t }), L = (t) => ({ status: "valid", value: t }), vt = (t) => t.status === "aborted", kt = (t) => t.status === "dirty", pe = (t) => t.status === "valid", De = (t) => typeof Promise < "u" && t instanceof Promise;
var y;
(function(t) {
  t.errToObj = (e) => typeof e == "string" ? { message: e } : e || {}, t.toString = (e) => typeof e == "string" ? e : e == null ? void 0 : e.message;
})(y || (y = {}));
class B {
  constructor(e, r, n, s) {
    this._cachedPath = [], this.parent = e, this.data = r, this._path = n, this._key = s;
  }
  get path() {
    return this._cachedPath.length || (Array.isArray(this._key) ? this._cachedPath.push(...this._path, ...this._key) : this._cachedPath.push(...this._path, this._key)), this._cachedPath;
  }
}
const wt = (t, e) => {
  if (pe(e))
    return { success: !0, data: e.value };
  if (!t.common.issues.length)
    throw new Error("Validation failed but no issues detected.");
  return {
    success: !1,
    get error() {
      if (this._error)
        return this._error;
      const r = new j(t.common.issues);
      return this._error = r, this._error;
    }
  };
};
function T(t) {
  if (!t)
    return {};
  const { errorMap: e, invalid_type_error: r, required_error: n, description: s } = t;
  if (e && (r || n))
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  return e ? { errorMap: e, description: s } : { errorMap: (c, a) => {
    const { message: h } = t;
    return c.code === "invalid_enum_value" ? { message: h ?? a.defaultError } : typeof a.data > "u" ? { message: h ?? n ?? a.defaultError } : c.code !== "invalid_type" ? { message: a.defaultError } : { message: h ?? r ?? a.defaultError };
  }, description: s };
}
class S {
  get description() {
    return this._def.description;
  }
  _getType(e) {
    return ee(e.data);
  }
  _getOrReturnCtx(e, r) {
    return r || {
      common: e.parent.common,
      data: e.data,
      parsedType: ee(e.data),
      schemaErrorMap: this._def.errorMap,
      path: e.path,
      parent: e.parent
    };
  }
  _processInputParams(e) {
    return {
      status: new $(),
      ctx: {
        common: e.parent.common,
        data: e.data,
        parsedType: ee(e.data),
        schemaErrorMap: this._def.errorMap,
        path: e.path,
        parent: e.parent
      }
    };
  }
  _parseSync(e) {
    const r = this._parse(e);
    if (De(r))
      throw new Error("Synchronous parse encountered promise.");
    return r;
  }
  _parseAsync(e) {
    const r = this._parse(e);
    return Promise.resolve(r);
  }
  parse(e, r) {
    const n = this.safeParse(e, r);
    if (n.success)
      return n.data;
    throw n.error;
  }
  safeParse(e, r) {
    const n = {
      common: {
        issues: [],
        async: (r == null ? void 0 : r.async) ?? !1,
        contextualErrorMap: r == null ? void 0 : r.errorMap
      },
      path: (r == null ? void 0 : r.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: e,
      parsedType: ee(e)
    }, s = this._parseSync({ data: e, path: n.path, parent: n });
    return wt(n, s);
  }
  "~validate"(e) {
    var n, s;
    const r = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: e,
      parsedType: ee(e)
    };
    if (!this["~standard"].async)
      try {
        const i = this._parseSync({ data: e, path: [], parent: r });
        return pe(i) ? {
          value: i.value
        } : {
          issues: r.common.issues
        };
      } catch (i) {
        (s = (n = i == null ? void 0 : i.message) == null ? void 0 : n.toLowerCase()) != null && s.includes("encountered") && (this["~standard"].async = !0), r.common = {
          issues: [],
          async: !0
        };
      }
    return this._parseAsync({ data: e, path: [], parent: r }).then((i) => pe(i) ? {
      value: i.value
    } : {
      issues: r.common.issues
    });
  }
  async parseAsync(e, r) {
    const n = await this.safeParseAsync(e, r);
    if (n.success)
      return n.data;
    throw n.error;
  }
  async safeParseAsync(e, r) {
    const n = {
      common: {
        issues: [],
        contextualErrorMap: r == null ? void 0 : r.errorMap,
        async: !0
      },
      path: (r == null ? void 0 : r.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: e,
      parsedType: ee(e)
    }, s = this._parse({ data: e, path: n.path, parent: n }), i = await (De(s) ? s : Promise.resolve(s));
    return wt(n, i);
  }
  refine(e, r) {
    const n = (s) => typeof r == "string" || typeof r > "u" ? { message: r } : typeof r == "function" ? r(s) : r;
    return this._refinement((s, i) => {
      const c = e(s), a = () => i.addIssue({
        code: u.custom,
        ...n(s)
      });
      return typeof Promise < "u" && c instanceof Promise ? c.then((h) => h ? !0 : (a(), !1)) : c ? !0 : (a(), !1);
    });
  }
  refinement(e, r) {
    return this._refinement((n, s) => e(n) ? !0 : (s.addIssue(typeof r == "function" ? r(n, s) : r), !1));
  }
  _refinement(e) {
    return new Y({
      schema: this,
      typeName: k.ZodEffects,
      effect: { type: "refinement", refinement: e }
    });
  }
  superRefine(e) {
    return this._refinement(e);
  }
  constructor(e) {
    this.spa = this.safeParseAsync, this._def = e, this.parse = this.parse.bind(this), this.safeParse = this.safeParse.bind(this), this.parseAsync = this.parseAsync.bind(this), this.safeParseAsync = this.safeParseAsync.bind(this), this.spa = this.spa.bind(this), this.refine = this.refine.bind(this), this.refinement = this.refinement.bind(this), this.superRefine = this.superRefine.bind(this), this.optional = this.optional.bind(this), this.nullable = this.nullable.bind(this), this.nullish = this.nullish.bind(this), this.array = this.array.bind(this), this.promise = this.promise.bind(this), this.or = this.or.bind(this), this.and = this.and.bind(this), this.transform = this.transform.bind(this), this.brand = this.brand.bind(this), this.default = this.default.bind(this), this.catch = this.catch.bind(this), this.describe = this.describe.bind(this), this.pipe = this.pipe.bind(this), this.readonly = this.readonly.bind(this), this.isNullable = this.isNullable.bind(this), this.isOptional = this.isOptional.bind(this), this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (r) => this["~validate"](r)
    };
  }
  optional() {
    return V.create(this, this._def);
  }
  nullable() {
    return ne.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return W.create(this);
  }
  promise() {
    return ge.create(this, this._def);
  }
  or(e) {
    return Ie.create([this, e], this._def);
  }
  and(e) {
    return Ee.create(this, e, this._def);
  }
  transform(e) {
    return new Y({
      ...T(this._def),
      schema: this,
      typeName: k.ZodEffects,
      effect: { type: "transform", transform: e }
    });
  }
  default(e) {
    const r = typeof e == "function" ? e : () => e;
    return new Oe({
      ...T(this._def),
      innerType: this,
      defaultValue: r,
      typeName: k.ZodDefault
    });
  }
  brand() {
    return new ut({
      typeName: k.ZodBranded,
      type: this,
      ...T(this._def)
    });
  }
  catch(e) {
    const r = typeof e == "function" ? e : () => e;
    return new Ne({
      ...T(this._def),
      innerType: this,
      catchValue: r,
      typeName: k.ZodCatch
    });
  }
  describe(e) {
    const r = this.constructor;
    return new r({
      ...this._def,
      description: e
    });
  }
  pipe(e) {
    return qe.create(this, e);
  }
  readonly() {
    return Me.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
const mr = /^c[^\s-]{8,}$/i, gr = /^[0-9a-z]+$/, yr = /^[0-9A-HJKMNP-TV-Z]{26}$/i, br = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i, _r = /^[a-z0-9_-]{21}$/i, vr = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/, kr = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/, wr = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i, Tr = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
let Ge;
const xr = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, Sr = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/, Ir = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/, Er = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, Rr = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/, Ar = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/, Mt = "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))", Cr = new RegExp(`^${Mt}$`);
function Pt(t) {
  let e = "[0-5]\\d";
  t.precision ? e = `${e}\\.\\d{${t.precision}}` : t.precision == null && (e = `${e}(\\.\\d+)?`);
  const r = t.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${e})${r}`;
}
function Or(t) {
  return new RegExp(`^${Pt(t)}$`);
}
function Nr(t) {
  let e = `${Mt}T${Pt(t)}`;
  const r = [];
  return r.push(t.local ? "Z?" : "Z"), t.offset && r.push("([+-]\\d{2}:?\\d{2})"), e = `${e}(${r.join("|")})`, new RegExp(`^${e}$`);
}
function Mr(t, e) {
  return !!((e === "v4" || !e) && xr.test(t) || (e === "v6" || !e) && Ir.test(t));
}
function Pr(t, e) {
  if (!vr.test(t))
    return !1;
  try {
    const [r] = t.split(".");
    if (!r)
      return !1;
    const n = r.replace(/-/g, "+").replace(/_/g, "/").padEnd(r.length + (4 - r.length % 4) % 4, "="), s = JSON.parse(atob(n));
    return !(typeof s != "object" || s === null || "typ" in s && (s == null ? void 0 : s.typ) !== "JWT" || !s.alg || e && s.alg !== e);
  } catch {
    return !1;
  }
}
function $r(t, e) {
  return !!((e === "v4" || !e) && Sr.test(t) || (e === "v6" || !e) && Er.test(t));
}
class U extends S {
  _parse(e) {
    if (this._def.coerce && (e.data = String(e.data)), this._getType(e) !== g.string) {
      const i = this._getOrReturnCtx(e);
      return p(i, {
        code: u.invalid_type,
        expected: g.string,
        received: i.parsedType
      }), v;
    }
    const n = new $();
    let s;
    for (const i of this._def.checks)
      if (i.kind === "min")
        e.data.length < i.value && (s = this._getOrReturnCtx(e, s), p(s, {
          code: u.too_small,
          minimum: i.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: i.message
        }), n.dirty());
      else if (i.kind === "max")
        e.data.length > i.value && (s = this._getOrReturnCtx(e, s), p(s, {
          code: u.too_big,
          maximum: i.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: i.message
        }), n.dirty());
      else if (i.kind === "length") {
        const c = e.data.length > i.value, a = e.data.length < i.value;
        (c || a) && (s = this._getOrReturnCtx(e, s), c ? p(s, {
          code: u.too_big,
          maximum: i.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: i.message
        }) : a && p(s, {
          code: u.too_small,
          minimum: i.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: i.message
        }), n.dirty());
      } else if (i.kind === "email")
        wr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "email",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "emoji")
        Ge || (Ge = new RegExp(Tr, "u")), Ge.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "emoji",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "uuid")
        br.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "uuid",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "nanoid")
        _r.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "nanoid",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "cuid")
        mr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "cuid",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "cuid2")
        gr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "cuid2",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "ulid")
        yr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
          validation: "ulid",
          code: u.invalid_string,
          message: i.message
        }), n.dirty());
      else if (i.kind === "url")
        try {
          new URL(e.data);
        } catch {
          s = this._getOrReturnCtx(e, s), p(s, {
            validation: "url",
            code: u.invalid_string,
            message: i.message
          }), n.dirty();
        }
      else i.kind === "regex" ? (i.regex.lastIndex = 0, i.regex.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "regex",
        code: u.invalid_string,
        message: i.message
      }), n.dirty())) : i.kind === "trim" ? e.data = e.data.trim() : i.kind === "includes" ? e.data.includes(i.value, i.position) || (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.invalid_string,
        validation: { includes: i.value, position: i.position },
        message: i.message
      }), n.dirty()) : i.kind === "toLowerCase" ? e.data = e.data.toLowerCase() : i.kind === "toUpperCase" ? e.data = e.data.toUpperCase() : i.kind === "startsWith" ? e.data.startsWith(i.value) || (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.invalid_string,
        validation: { startsWith: i.value },
        message: i.message
      }), n.dirty()) : i.kind === "endsWith" ? e.data.endsWith(i.value) || (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.invalid_string,
        validation: { endsWith: i.value },
        message: i.message
      }), n.dirty()) : i.kind === "datetime" ? Nr(i).test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.invalid_string,
        validation: "datetime",
        message: i.message
      }), n.dirty()) : i.kind === "date" ? Cr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.invalid_string,
        validation: "date",
        message: i.message
      }), n.dirty()) : i.kind === "time" ? Or(i).test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.invalid_string,
        validation: "time",
        message: i.message
      }), n.dirty()) : i.kind === "duration" ? kr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "duration",
        code: u.invalid_string,
        message: i.message
      }), n.dirty()) : i.kind === "ip" ? Mr(e.data, i.version) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "ip",
        code: u.invalid_string,
        message: i.message
      }), n.dirty()) : i.kind === "jwt" ? Pr(e.data, i.alg) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "jwt",
        code: u.invalid_string,
        message: i.message
      }), n.dirty()) : i.kind === "cidr" ? $r(e.data, i.version) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "cidr",
        code: u.invalid_string,
        message: i.message
      }), n.dirty()) : i.kind === "base64" ? Rr.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "base64",
        code: u.invalid_string,
        message: i.message
      }), n.dirty()) : i.kind === "base64url" ? Ar.test(e.data) || (s = this._getOrReturnCtx(e, s), p(s, {
        validation: "base64url",
        code: u.invalid_string,
        message: i.message
      }), n.dirty()) : I.assertNever(i);
    return { status: n.value, value: e.data };
  }
  _regex(e, r, n) {
    return this.refinement((s) => e.test(s), {
      validation: r,
      code: u.invalid_string,
      ...y.errToObj(n)
    });
  }
  _addCheck(e) {
    return new U({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  email(e) {
    return this._addCheck({ kind: "email", ...y.errToObj(e) });
  }
  url(e) {
    return this._addCheck({ kind: "url", ...y.errToObj(e) });
  }
  emoji(e) {
    return this._addCheck({ kind: "emoji", ...y.errToObj(e) });
  }
  uuid(e) {
    return this._addCheck({ kind: "uuid", ...y.errToObj(e) });
  }
  nanoid(e) {
    return this._addCheck({ kind: "nanoid", ...y.errToObj(e) });
  }
  cuid(e) {
    return this._addCheck({ kind: "cuid", ...y.errToObj(e) });
  }
  cuid2(e) {
    return this._addCheck({ kind: "cuid2", ...y.errToObj(e) });
  }
  ulid(e) {
    return this._addCheck({ kind: "ulid", ...y.errToObj(e) });
  }
  base64(e) {
    return this._addCheck({ kind: "base64", ...y.errToObj(e) });
  }
  base64url(e) {
    return this._addCheck({
      kind: "base64url",
      ...y.errToObj(e)
    });
  }
  jwt(e) {
    return this._addCheck({ kind: "jwt", ...y.errToObj(e) });
  }
  ip(e) {
    return this._addCheck({ kind: "ip", ...y.errToObj(e) });
  }
  cidr(e) {
    return this._addCheck({ kind: "cidr", ...y.errToObj(e) });
  }
  datetime(e) {
    return typeof e == "string" ? this._addCheck({
      kind: "datetime",
      precision: null,
      offset: !1,
      local: !1,
      message: e
    }) : this._addCheck({
      kind: "datetime",
      precision: typeof (e == null ? void 0 : e.precision) > "u" ? null : e == null ? void 0 : e.precision,
      offset: (e == null ? void 0 : e.offset) ?? !1,
      local: (e == null ? void 0 : e.local) ?? !1,
      ...y.errToObj(e == null ? void 0 : e.message)
    });
  }
  date(e) {
    return this._addCheck({ kind: "date", message: e });
  }
  time(e) {
    return typeof e == "string" ? this._addCheck({
      kind: "time",
      precision: null,
      message: e
    }) : this._addCheck({
      kind: "time",
      precision: typeof (e == null ? void 0 : e.precision) > "u" ? null : e == null ? void 0 : e.precision,
      ...y.errToObj(e == null ? void 0 : e.message)
    });
  }
  duration(e) {
    return this._addCheck({ kind: "duration", ...y.errToObj(e) });
  }
  regex(e, r) {
    return this._addCheck({
      kind: "regex",
      regex: e,
      ...y.errToObj(r)
    });
  }
  includes(e, r) {
    return this._addCheck({
      kind: "includes",
      value: e,
      position: r == null ? void 0 : r.position,
      ...y.errToObj(r == null ? void 0 : r.message)
    });
  }
  startsWith(e, r) {
    return this._addCheck({
      kind: "startsWith",
      value: e,
      ...y.errToObj(r)
    });
  }
  endsWith(e, r) {
    return this._addCheck({
      kind: "endsWith",
      value: e,
      ...y.errToObj(r)
    });
  }
  min(e, r) {
    return this._addCheck({
      kind: "min",
      value: e,
      ...y.errToObj(r)
    });
  }
  max(e, r) {
    return this._addCheck({
      kind: "max",
      value: e,
      ...y.errToObj(r)
    });
  }
  length(e, r) {
    return this._addCheck({
      kind: "length",
      value: e,
      ...y.errToObj(r)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(e) {
    return this.min(1, y.errToObj(e));
  }
  trim() {
    return new U({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new U({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new U({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((e) => e.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((e) => e.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((e) => e.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((e) => e.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((e) => e.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((e) => e.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((e) => e.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((e) => e.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((e) => e.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((e) => e.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((e) => e.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((e) => e.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((e) => e.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((e) => e.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((e) => e.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((e) => e.kind === "base64url");
  }
  get minLength() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "min" && (e === null || r.value > e) && (e = r.value);
    return e;
  }
  get maxLength() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "max" && (e === null || r.value < e) && (e = r.value);
    return e;
  }
}
U.create = (t) => new U({
  checks: [],
  typeName: k.ZodString,
  coerce: (t == null ? void 0 : t.coerce) ?? !1,
  ...T(t)
});
function Lr(t, e) {
  const r = (t.toString().split(".")[1] || "").length, n = (e.toString().split(".")[1] || "").length, s = r > n ? r : n, i = Number.parseInt(t.toFixed(s).replace(".", "")), c = Number.parseInt(e.toFixed(s).replace(".", ""));
  return i % c / 10 ** s;
}
class oe extends S {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte, this.step = this.multipleOf;
  }
  _parse(e) {
    if (this._def.coerce && (e.data = Number(e.data)), this._getType(e) !== g.number) {
      const i = this._getOrReturnCtx(e);
      return p(i, {
        code: u.invalid_type,
        expected: g.number,
        received: i.parsedType
      }), v;
    }
    let n;
    const s = new $();
    for (const i of this._def.checks)
      i.kind === "int" ? I.isInteger(e.data) || (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.invalid_type,
        expected: "integer",
        received: "float",
        message: i.message
      }), s.dirty()) : i.kind === "min" ? (i.inclusive ? e.data < i.value : e.data <= i.value) && (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.too_small,
        minimum: i.value,
        type: "number",
        inclusive: i.inclusive,
        exact: !1,
        message: i.message
      }), s.dirty()) : i.kind === "max" ? (i.inclusive ? e.data > i.value : e.data >= i.value) && (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.too_big,
        maximum: i.value,
        type: "number",
        inclusive: i.inclusive,
        exact: !1,
        message: i.message
      }), s.dirty()) : i.kind === "multipleOf" ? Lr(e.data, i.value) !== 0 && (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.not_multiple_of,
        multipleOf: i.value,
        message: i.message
      }), s.dirty()) : i.kind === "finite" ? Number.isFinite(e.data) || (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.not_finite,
        message: i.message
      }), s.dirty()) : I.assertNever(i);
    return { status: s.value, value: e.data };
  }
  gte(e, r) {
    return this.setLimit("min", e, !0, y.toString(r));
  }
  gt(e, r) {
    return this.setLimit("min", e, !1, y.toString(r));
  }
  lte(e, r) {
    return this.setLimit("max", e, !0, y.toString(r));
  }
  lt(e, r) {
    return this.setLimit("max", e, !1, y.toString(r));
  }
  setLimit(e, r, n, s) {
    return new oe({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind: e,
          value: r,
          inclusive: n,
          message: y.toString(s)
        }
      ]
    });
  }
  _addCheck(e) {
    return new oe({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  int(e) {
    return this._addCheck({
      kind: "int",
      message: y.toString(e)
    });
  }
  positive(e) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !1,
      message: y.toString(e)
    });
  }
  negative(e) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !1,
      message: y.toString(e)
    });
  }
  nonpositive(e) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !0,
      message: y.toString(e)
    });
  }
  nonnegative(e) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !0,
      message: y.toString(e)
    });
  }
  multipleOf(e, r) {
    return this._addCheck({
      kind: "multipleOf",
      value: e,
      message: y.toString(r)
    });
  }
  finite(e) {
    return this._addCheck({
      kind: "finite",
      message: y.toString(e)
    });
  }
  safe(e) {
    return this._addCheck({
      kind: "min",
      inclusive: !0,
      value: Number.MIN_SAFE_INTEGER,
      message: y.toString(e)
    })._addCheck({
      kind: "max",
      inclusive: !0,
      value: Number.MAX_SAFE_INTEGER,
      message: y.toString(e)
    });
  }
  get minValue() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "min" && (e === null || r.value > e) && (e = r.value);
    return e;
  }
  get maxValue() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "max" && (e === null || r.value < e) && (e = r.value);
    return e;
  }
  get isInt() {
    return !!this._def.checks.find((e) => e.kind === "int" || e.kind === "multipleOf" && I.isInteger(e.value));
  }
  get isFinite() {
    let e = null, r = null;
    for (const n of this._def.checks) {
      if (n.kind === "finite" || n.kind === "int" || n.kind === "multipleOf")
        return !0;
      n.kind === "min" ? (r === null || n.value > r) && (r = n.value) : n.kind === "max" && (e === null || n.value < e) && (e = n.value);
    }
    return Number.isFinite(r) && Number.isFinite(e);
  }
}
oe.create = (t) => new oe({
  checks: [],
  typeName: k.ZodNumber,
  coerce: (t == null ? void 0 : t.coerce) || !1,
  ...T(t)
});
class ce extends S {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte;
  }
  _parse(e) {
    if (this._def.coerce)
      try {
        e.data = BigInt(e.data);
      } catch {
        return this._getInvalidInput(e);
      }
    if (this._getType(e) !== g.bigint)
      return this._getInvalidInput(e);
    let n;
    const s = new $();
    for (const i of this._def.checks)
      i.kind === "min" ? (i.inclusive ? e.data < i.value : e.data <= i.value) && (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.too_small,
        type: "bigint",
        minimum: i.value,
        inclusive: i.inclusive,
        message: i.message
      }), s.dirty()) : i.kind === "max" ? (i.inclusive ? e.data > i.value : e.data >= i.value) && (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.too_big,
        type: "bigint",
        maximum: i.value,
        inclusive: i.inclusive,
        message: i.message
      }), s.dirty()) : i.kind === "multipleOf" ? e.data % i.value !== BigInt(0) && (n = this._getOrReturnCtx(e, n), p(n, {
        code: u.not_multiple_of,
        multipleOf: i.value,
        message: i.message
      }), s.dirty()) : I.assertNever(i);
    return { status: s.value, value: e.data };
  }
  _getInvalidInput(e) {
    const r = this._getOrReturnCtx(e);
    return p(r, {
      code: u.invalid_type,
      expected: g.bigint,
      received: r.parsedType
    }), v;
  }
  gte(e, r) {
    return this.setLimit("min", e, !0, y.toString(r));
  }
  gt(e, r) {
    return this.setLimit("min", e, !1, y.toString(r));
  }
  lte(e, r) {
    return this.setLimit("max", e, !0, y.toString(r));
  }
  lt(e, r) {
    return this.setLimit("max", e, !1, y.toString(r));
  }
  setLimit(e, r, n, s) {
    return new ce({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind: e,
          value: r,
          inclusive: n,
          message: y.toString(s)
        }
      ]
    });
  }
  _addCheck(e) {
    return new ce({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  positive(e) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !1,
      message: y.toString(e)
    });
  }
  negative(e) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !1,
      message: y.toString(e)
    });
  }
  nonpositive(e) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !0,
      message: y.toString(e)
    });
  }
  nonnegative(e) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !0,
      message: y.toString(e)
    });
  }
  multipleOf(e, r) {
    return this._addCheck({
      kind: "multipleOf",
      value: e,
      message: y.toString(r)
    });
  }
  get minValue() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "min" && (e === null || r.value > e) && (e = r.value);
    return e;
  }
  get maxValue() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "max" && (e === null || r.value < e) && (e = r.value);
    return e;
  }
}
ce.create = (t) => new ce({
  checks: [],
  typeName: k.ZodBigInt,
  coerce: (t == null ? void 0 : t.coerce) ?? !1,
  ...T(t)
});
class Ze extends S {
  _parse(e) {
    if (this._def.coerce && (e.data = !!e.data), this._getType(e) !== g.boolean) {
      const n = this._getOrReturnCtx(e);
      return p(n, {
        code: u.invalid_type,
        expected: g.boolean,
        received: n.parsedType
      }), v;
    }
    return L(e.data);
  }
}
Ze.create = (t) => new Ze({
  typeName: k.ZodBoolean,
  coerce: (t == null ? void 0 : t.coerce) || !1,
  ...T(t)
});
class xe extends S {
  _parse(e) {
    if (this._def.coerce && (e.data = new Date(e.data)), this._getType(e) !== g.date) {
      const i = this._getOrReturnCtx(e);
      return p(i, {
        code: u.invalid_type,
        expected: g.date,
        received: i.parsedType
      }), v;
    }
    if (Number.isNaN(e.data.getTime())) {
      const i = this._getOrReturnCtx(e);
      return p(i, {
        code: u.invalid_date
      }), v;
    }
    const n = new $();
    let s;
    for (const i of this._def.checks)
      i.kind === "min" ? e.data.getTime() < i.value && (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.too_small,
        message: i.message,
        inclusive: !0,
        exact: !1,
        minimum: i.value,
        type: "date"
      }), n.dirty()) : i.kind === "max" ? e.data.getTime() > i.value && (s = this._getOrReturnCtx(e, s), p(s, {
        code: u.too_big,
        message: i.message,
        inclusive: !0,
        exact: !1,
        maximum: i.value,
        type: "date"
      }), n.dirty()) : I.assertNever(i);
    return {
      status: n.value,
      value: new Date(e.data.getTime())
    };
  }
  _addCheck(e) {
    return new xe({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  min(e, r) {
    return this._addCheck({
      kind: "min",
      value: e.getTime(),
      message: y.toString(r)
    });
  }
  max(e, r) {
    return this._addCheck({
      kind: "max",
      value: e.getTime(),
      message: y.toString(r)
    });
  }
  get minDate() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "min" && (e === null || r.value > e) && (e = r.value);
    return e != null ? new Date(e) : null;
  }
  get maxDate() {
    let e = null;
    for (const r of this._def.checks)
      r.kind === "max" && (e === null || r.value < e) && (e = r.value);
    return e != null ? new Date(e) : null;
  }
}
xe.create = (t) => new xe({
  checks: [],
  coerce: (t == null ? void 0 : t.coerce) || !1,
  typeName: k.ZodDate,
  ...T(t)
});
class Tt extends S {
  _parse(e) {
    if (this._getType(e) !== g.symbol) {
      const n = this._getOrReturnCtx(e);
      return p(n, {
        code: u.invalid_type,
        expected: g.symbol,
        received: n.parsedType
      }), v;
    }
    return L(e.data);
  }
}
Tt.create = (t) => new Tt({
  typeName: k.ZodSymbol,
  ...T(t)
});
class We extends S {
  _parse(e) {
    if (this._getType(e) !== g.undefined) {
      const n = this._getOrReturnCtx(e);
      return p(n, {
        code: u.invalid_type,
        expected: g.undefined,
        received: n.parsedType
      }), v;
    }
    return L(e.data);
  }
}
We.create = (t) => new We({
  typeName: k.ZodUndefined,
  ...T(t)
});
class Se extends S {
  _parse(e) {
    if (this._getType(e) !== g.null) {
      const n = this._getOrReturnCtx(e);
      return p(n, {
        code: u.invalid_type,
        expected: g.null,
        received: n.parsedType
      }), v;
    }
    return L(e.data);
  }
}
Se.create = (t) => new Se({
  typeName: k.ZodNull,
  ...T(t)
});
class et extends S {
  constructor() {
    super(...arguments), this._any = !0;
  }
  _parse(e) {
    return L(e.data);
  }
}
et.create = (t) => new et({
  typeName: k.ZodAny,
  ...T(t)
});
class ae extends S {
  constructor() {
    super(...arguments), this._unknown = !0;
  }
  _parse(e) {
    return L(e.data);
  }
}
ae.create = (t) => new ae({
  typeName: k.ZodUnknown,
  ...T(t)
});
class te extends S {
  _parse(e) {
    const r = this._getOrReturnCtx(e);
    return p(r, {
      code: u.invalid_type,
      expected: g.never,
      received: r.parsedType
    }), v;
  }
}
te.create = (t) => new te({
  typeName: k.ZodNever,
  ...T(t)
});
class tt extends S {
  _parse(e) {
    if (this._getType(e) !== g.undefined) {
      const n = this._getOrReturnCtx(e);
      return p(n, {
        code: u.invalid_type,
        expected: g.void,
        received: n.parsedType
      }), v;
    }
    return L(e.data);
  }
}
tt.create = (t) => new tt({
  typeName: k.ZodVoid,
  ...T(t)
});
class W extends S {
  _parse(e) {
    const { ctx: r, status: n } = this._processInputParams(e), s = this._def;
    if (r.parsedType !== g.array)
      return p(r, {
        code: u.invalid_type,
        expected: g.array,
        received: r.parsedType
      }), v;
    if (s.exactLength !== null) {
      const c = r.data.length > s.exactLength.value, a = r.data.length < s.exactLength.value;
      (c || a) && (p(r, {
        code: c ? u.too_big : u.too_small,
        minimum: a ? s.exactLength.value : void 0,
        maximum: c ? s.exactLength.value : void 0,
        type: "array",
        inclusive: !0,
        exact: !0,
        message: s.exactLength.message
      }), n.dirty());
    }
    if (s.minLength !== null && r.data.length < s.minLength.value && (p(r, {
      code: u.too_small,
      minimum: s.minLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: s.minLength.message
    }), n.dirty()), s.maxLength !== null && r.data.length > s.maxLength.value && (p(r, {
      code: u.too_big,
      maximum: s.maxLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: s.maxLength.message
    }), n.dirty()), r.common.async)
      return Promise.all([...r.data].map((c, a) => s.type._parseAsync(new B(r, c, r.path, a)))).then((c) => $.mergeArray(n, c));
    const i = [...r.data].map((c, a) => s.type._parseSync(new B(r, c, r.path, a)));
    return $.mergeArray(n, i);
  }
  get element() {
    return this._def.type;
  }
  min(e, r) {
    return new W({
      ...this._def,
      minLength: { value: e, message: y.toString(r) }
    });
  }
  max(e, r) {
    return new W({
      ...this._def,
      maxLength: { value: e, message: y.toString(r) }
    });
  }
  length(e, r) {
    return new W({
      ...this._def,
      exactLength: { value: e, message: y.toString(r) }
    });
  }
  nonempty(e) {
    return this.min(1, e);
  }
}
W.create = (t, e) => new W({
  type: t,
  minLength: null,
  maxLength: null,
  exactLength: null,
  typeName: k.ZodArray,
  ...T(e)
});
function ue(t) {
  if (t instanceof A) {
    const e = {};
    for (const r in t.shape) {
      const n = t.shape[r];
      e[r] = V.create(ue(n));
    }
    return new A({
      ...t._def,
      shape: () => e
    });
  } else return t instanceof W ? new W({
    ...t._def,
    type: ue(t.element)
  }) : t instanceof V ? V.create(ue(t.unwrap())) : t instanceof ne ? ne.create(ue(t.unwrap())) : t instanceof z ? z.create(t.items.map((e) => ue(e))) : t;
}
class A extends S {
  constructor() {
    super(...arguments), this._cached = null, this.nonstrict = this.passthrough, this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const e = this._def.shape(), r = I.objectKeys(e);
    return this._cached = { shape: e, keys: r }, this._cached;
  }
  _parse(e) {
    if (this._getType(e) !== g.object) {
      const d = this._getOrReturnCtx(e);
      return p(d, {
        code: u.invalid_type,
        expected: g.object,
        received: d.parsedType
      }), v;
    }
    const { status: n, ctx: s } = this._processInputParams(e), { shape: i, keys: c } = this._getCached(), a = [];
    if (!(this._def.catchall instanceof te && this._def.unknownKeys === "strip"))
      for (const d in s.data)
        c.includes(d) || a.push(d);
    const h = [];
    for (const d of c) {
      const m = i[d], R = s.data[d];
      h.push({
        key: { status: "valid", value: d },
        value: m._parse(new B(s, R, s.path, d)),
        alwaysSet: d in s.data
      });
    }
    if (this._def.catchall instanceof te) {
      const d = this._def.unknownKeys;
      if (d === "passthrough")
        for (const m of a)
          h.push({
            key: { status: "valid", value: m },
            value: { status: "valid", value: s.data[m] }
          });
      else if (d === "strict")
        a.length > 0 && (p(s, {
          code: u.unrecognized_keys,
          keys: a
        }), n.dirty());
      else if (d !== "strip") throw new Error("Internal ZodObject error: invalid unknownKeys value.");
    } else {
      const d = this._def.catchall;
      for (const m of a) {
        const R = s.data[m];
        h.push({
          key: { status: "valid", value: m },
          value: d._parse(
            new B(s, R, s.path, m)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: m in s.data
        });
      }
    }
    return s.common.async ? Promise.resolve().then(async () => {
      const d = [];
      for (const m of h) {
        const R = await m.key, P = await m.value;
        d.push({
          key: R,
          value: P,
          alwaysSet: m.alwaysSet
        });
      }
      return d;
    }).then((d) => $.mergeObjectSync(n, d)) : $.mergeObjectSync(n, h);
  }
  get shape() {
    return this._def.shape();
  }
  strict(e) {
    return y.errToObj, new A({
      ...this._def,
      unknownKeys: "strict",
      ...e !== void 0 ? {
        errorMap: (r, n) => {
          var i, c;
          const s = ((c = (i = this._def).errorMap) == null ? void 0 : c.call(i, r, n).message) ?? n.defaultError;
          return r.code === "unrecognized_keys" ? {
            message: y.errToObj(e).message ?? s
          } : {
            message: s
          };
        }
      } : {}
    });
  }
  strip() {
    return new A({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new A({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(e) {
    return new A({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...e
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(e) {
    return new A({
      unknownKeys: e._def.unknownKeys,
      catchall: e._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...e._def.shape()
      }),
      typeName: k.ZodObject
    });
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(e, r) {
    return this.augment({ [e]: r });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(e) {
    return new A({
      ...this._def,
      catchall: e
    });
  }
  pick(e) {
    const r = {};
    for (const n of I.objectKeys(e))
      e[n] && this.shape[n] && (r[n] = this.shape[n]);
    return new A({
      ...this._def,
      shape: () => r
    });
  }
  omit(e) {
    const r = {};
    for (const n of I.objectKeys(this.shape))
      e[n] || (r[n] = this.shape[n]);
    return new A({
      ...this._def,
      shape: () => r
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return ue(this);
  }
  partial(e) {
    const r = {};
    for (const n of I.objectKeys(this.shape)) {
      const s = this.shape[n];
      e && !e[n] ? r[n] = s : r[n] = s.optional();
    }
    return new A({
      ...this._def,
      shape: () => r
    });
  }
  required(e) {
    const r = {};
    for (const n of I.objectKeys(this.shape))
      if (e && !e[n])
        r[n] = this.shape[n];
      else {
        let i = this.shape[n];
        for (; i instanceof V; )
          i = i._def.innerType;
        r[n] = i;
      }
    return new A({
      ...this._def,
      shape: () => r
    });
  }
  keyof() {
    return $t(I.objectKeys(this.shape));
  }
}
A.create = (t, e) => new A({
  shape: () => t,
  unknownKeys: "strip",
  catchall: te.create(),
  typeName: k.ZodObject,
  ...T(e)
});
A.strictCreate = (t, e) => new A({
  shape: () => t,
  unknownKeys: "strict",
  catchall: te.create(),
  typeName: k.ZodObject,
  ...T(e)
});
A.lazycreate = (t, e) => new A({
  shape: t,
  unknownKeys: "strip",
  catchall: te.create(),
  typeName: k.ZodObject,
  ...T(e)
});
class Ie extends S {
  _parse(e) {
    const { ctx: r } = this._processInputParams(e), n = this._def.options;
    function s(i) {
      for (const a of i)
        if (a.result.status === "valid")
          return a.result;
      for (const a of i)
        if (a.result.status === "dirty")
          return r.common.issues.push(...a.ctx.common.issues), a.result;
      const c = i.map((a) => new j(a.ctx.common.issues));
      return p(r, {
        code: u.invalid_union,
        unionErrors: c
      }), v;
    }
    if (r.common.async)
      return Promise.all(n.map(async (i) => {
        const c = {
          ...r,
          common: {
            ...r.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await i._parseAsync({
            data: r.data,
            path: r.path,
            parent: c
          }),
          ctx: c
        };
      })).then(s);
    {
      let i;
      const c = [];
      for (const h of n) {
        const d = {
          ...r,
          common: {
            ...r.common,
            issues: []
          },
          parent: null
        }, m = h._parseSync({
          data: r.data,
          path: r.path,
          parent: d
        });
        if (m.status === "valid")
          return m;
        m.status === "dirty" && !i && (i = { result: m, ctx: d }), d.common.issues.length && c.push(d.common.issues);
      }
      if (i)
        return r.common.issues.push(...i.ctx.common.issues), i.result;
      const a = c.map((h) => new j(h));
      return p(r, {
        code: u.invalid_union,
        unionErrors: a
      }), v;
    }
  }
  get options() {
    return this._def.options;
  }
}
Ie.create = (t, e) => new Ie({
  options: t,
  typeName: k.ZodUnion,
  ...T(e)
});
const J = (t) => t instanceof Ae ? J(t.schema) : t instanceof Y ? J(t.innerType()) : t instanceof Ce ? [t.value] : t instanceof re ? t.options : t instanceof st ? I.objectValues(t.enum) : t instanceof Oe ? J(t._def.innerType) : t instanceof We ? [void 0] : t instanceof Se ? [null] : t instanceof V ? [void 0, ...J(t.unwrap())] : t instanceof ne ? [null, ...J(t.unwrap())] : t instanceof ut || t instanceof Me ? J(t.unwrap()) : t instanceof Ne ? J(t._def.innerType) : [];
class ze extends S {
  _parse(e) {
    const { ctx: r } = this._processInputParams(e);
    if (r.parsedType !== g.object)
      return p(r, {
        code: u.invalid_type,
        expected: g.object,
        received: r.parsedType
      }), v;
    const n = this.discriminator, s = r.data[n], i = this.optionsMap.get(s);
    return i ? r.common.async ? i._parseAsync({
      data: r.data,
      path: r.path,
      parent: r
    }) : i._parseSync({
      data: r.data,
      path: r.path,
      parent: r
    }) : (p(r, {
      code: u.invalid_union_discriminator,
      options: Array.from(this.optionsMap.keys()),
      path: [n]
    }), v);
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(e, r, n) {
    const s = /* @__PURE__ */ new Map();
    for (const i of r) {
      const c = J(i.shape[e]);
      if (!c.length)
        throw new Error(`A discriminator value for key \`${e}\` could not be extracted from all schema options`);
      for (const a of c) {
        if (s.has(a))
          throw new Error(`Discriminator property ${String(e)} has duplicate value ${String(a)}`);
        s.set(a, i);
      }
    }
    return new ze({
      typeName: k.ZodDiscriminatedUnion,
      discriminator: e,
      options: r,
      optionsMap: s,
      ...T(n)
    });
  }
}
function rt(t, e) {
  const r = ee(t), n = ee(e);
  if (t === e)
    return { valid: !0, data: t };
  if (r === g.object && n === g.object) {
    const s = I.objectKeys(e), i = I.objectKeys(t).filter((a) => s.indexOf(a) !== -1), c = { ...t, ...e };
    for (const a of i) {
      const h = rt(t[a], e[a]);
      if (!h.valid)
        return { valid: !1 };
      c[a] = h.data;
    }
    return { valid: !0, data: c };
  } else if (r === g.array && n === g.array) {
    if (t.length !== e.length)
      return { valid: !1 };
    const s = [];
    for (let i = 0; i < t.length; i++) {
      const c = t[i], a = e[i], h = rt(c, a);
      if (!h.valid)
        return { valid: !1 };
      s.push(h.data);
    }
    return { valid: !0, data: s };
  } else return r === g.date && n === g.date && +t == +e ? { valid: !0, data: t } : { valid: !1 };
}
class Ee extends S {
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e), s = (i, c) => {
      if (vt(i) || vt(c))
        return v;
      const a = rt(i.value, c.value);
      return a.valid ? ((kt(i) || kt(c)) && r.dirty(), { status: r.value, value: a.data }) : (p(n, {
        code: u.invalid_intersection_types
      }), v);
    };
    return n.common.async ? Promise.all([
      this._def.left._parseAsync({
        data: n.data,
        path: n.path,
        parent: n
      }),
      this._def.right._parseAsync({
        data: n.data,
        path: n.path,
        parent: n
      })
    ]).then(([i, c]) => s(i, c)) : s(this._def.left._parseSync({
      data: n.data,
      path: n.path,
      parent: n
    }), this._def.right._parseSync({
      data: n.data,
      path: n.path,
      parent: n
    }));
  }
}
Ee.create = (t, e, r) => new Ee({
  left: t,
  right: e,
  typeName: k.ZodIntersection,
  ...T(r)
});
class z extends S {
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e);
    if (n.parsedType !== g.array)
      return p(n, {
        code: u.invalid_type,
        expected: g.array,
        received: n.parsedType
      }), v;
    if (n.data.length < this._def.items.length)
      return p(n, {
        code: u.too_small,
        minimum: this._def.items.length,
        inclusive: !0,
        exact: !1,
        type: "array"
      }), v;
    !this._def.rest && n.data.length > this._def.items.length && (p(n, {
      code: u.too_big,
      maximum: this._def.items.length,
      inclusive: !0,
      exact: !1,
      type: "array"
    }), r.dirty());
    const i = [...n.data].map((c, a) => {
      const h = this._def.items[a] || this._def.rest;
      return h ? h._parse(new B(n, c, n.path, a)) : null;
    }).filter((c) => !!c);
    return n.common.async ? Promise.all(i).then((c) => $.mergeArray(r, c)) : $.mergeArray(r, i);
  }
  get items() {
    return this._def.items;
  }
  rest(e) {
    return new z({
      ...this._def,
      rest: e
    });
  }
}
z.create = (t, e) => {
  if (!Array.isArray(t))
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  return new z({
    items: t,
    typeName: k.ZodTuple,
    rest: null,
    ...T(e)
  });
};
class Re extends S {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e);
    if (n.parsedType !== g.object)
      return p(n, {
        code: u.invalid_type,
        expected: g.object,
        received: n.parsedType
      }), v;
    const s = [], i = this._def.keyType, c = this._def.valueType;
    for (const a in n.data)
      s.push({
        key: i._parse(new B(n, a, n.path, a)),
        value: c._parse(new B(n, n.data[a], n.path, a)),
        alwaysSet: a in n.data
      });
    return n.common.async ? $.mergeObjectAsync(r, s) : $.mergeObjectSync(r, s);
  }
  get element() {
    return this._def.valueType;
  }
  static create(e, r, n) {
    return r instanceof S ? new Re({
      keyType: e,
      valueType: r,
      typeName: k.ZodRecord,
      ...T(n)
    }) : new Re({
      keyType: U.create(),
      valueType: e,
      typeName: k.ZodRecord,
      ...T(r)
    });
  }
}
class nt extends S {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e);
    if (n.parsedType !== g.map)
      return p(n, {
        code: u.invalid_type,
        expected: g.map,
        received: n.parsedType
      }), v;
    const s = this._def.keyType, i = this._def.valueType, c = [...n.data.entries()].map(([a, h], d) => ({
      key: s._parse(new B(n, a, n.path, [d, "key"])),
      value: i._parse(new B(n, h, n.path, [d, "value"]))
    }));
    if (n.common.async) {
      const a = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const h of c) {
          const d = await h.key, m = await h.value;
          if (d.status === "aborted" || m.status === "aborted")
            return v;
          (d.status === "dirty" || m.status === "dirty") && r.dirty(), a.set(d.value, m.value);
        }
        return { status: r.value, value: a };
      });
    } else {
      const a = /* @__PURE__ */ new Map();
      for (const h of c) {
        const d = h.key, m = h.value;
        if (d.status === "aborted" || m.status === "aborted")
          return v;
        (d.status === "dirty" || m.status === "dirty") && r.dirty(), a.set(d.value, m.value);
      }
      return { status: r.value, value: a };
    }
  }
}
nt.create = (t, e, r) => new nt({
  valueType: e,
  keyType: t,
  typeName: k.ZodMap,
  ...T(r)
});
class me extends S {
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e);
    if (n.parsedType !== g.set)
      return p(n, {
        code: u.invalid_type,
        expected: g.set,
        received: n.parsedType
      }), v;
    const s = this._def;
    s.minSize !== null && n.data.size < s.minSize.value && (p(n, {
      code: u.too_small,
      minimum: s.minSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: s.minSize.message
    }), r.dirty()), s.maxSize !== null && n.data.size > s.maxSize.value && (p(n, {
      code: u.too_big,
      maximum: s.maxSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: s.maxSize.message
    }), r.dirty());
    const i = this._def.valueType;
    function c(h) {
      const d = /* @__PURE__ */ new Set();
      for (const m of h) {
        if (m.status === "aborted")
          return v;
        m.status === "dirty" && r.dirty(), d.add(m.value);
      }
      return { status: r.value, value: d };
    }
    const a = [...n.data.values()].map((h, d) => i._parse(new B(n, h, n.path, d)));
    return n.common.async ? Promise.all(a).then((h) => c(h)) : c(a);
  }
  min(e, r) {
    return new me({
      ...this._def,
      minSize: { value: e, message: y.toString(r) }
    });
  }
  max(e, r) {
    return new me({
      ...this._def,
      maxSize: { value: e, message: y.toString(r) }
    });
  }
  size(e, r) {
    return this.min(e, r).max(e, r);
  }
  nonempty(e) {
    return this.min(1, e);
  }
}
me.create = (t, e) => new me({
  valueType: t,
  minSize: null,
  maxSize: null,
  typeName: k.ZodSet,
  ...T(e)
});
class ke extends S {
  constructor() {
    super(...arguments), this.validate = this.implement;
  }
  _parse(e) {
    const { ctx: r } = this._processInputParams(e);
    if (r.parsedType !== g.function)
      return p(r, {
        code: u.invalid_type,
        expected: g.function,
        received: r.parsedType
      }), v;
    function n(a, h) {
      return Xe({
        data: a,
        path: r.path,
        errorMaps: [r.common.contextualErrorMap, r.schemaErrorMap, Qe(), Te].filter((d) => !!d),
        issueData: {
          code: u.invalid_arguments,
          argumentsError: h
        }
      });
    }
    function s(a, h) {
      return Xe({
        data: a,
        path: r.path,
        errorMaps: [r.common.contextualErrorMap, r.schemaErrorMap, Qe(), Te].filter((d) => !!d),
        issueData: {
          code: u.invalid_return_type,
          returnTypeError: h
        }
      });
    }
    const i = { errorMap: r.common.contextualErrorMap }, c = r.data;
    if (this._def.returns instanceof ge) {
      const a = this;
      return L(async function(...h) {
        const d = new j([]), m = await a._def.args.parseAsync(h, i).catch((Q) => {
          throw d.addIssue(n(h, Q)), d;
        }), R = await Reflect.apply(c, this, m);
        return await a._def.returns._def.type.parseAsync(R, i).catch((Q) => {
          throw d.addIssue(s(R, Q)), d;
        });
      });
    } else {
      const a = this;
      return L(function(...h) {
        const d = a._def.args.safeParse(h, i);
        if (!d.success)
          throw new j([n(h, d.error)]);
        const m = Reflect.apply(c, this, d.data), R = a._def.returns.safeParse(m, i);
        if (!R.success)
          throw new j([s(m, R.error)]);
        return R.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...e) {
    return new ke({
      ...this._def,
      args: z.create(e).rest(ae.create())
    });
  }
  returns(e) {
    return new ke({
      ...this._def,
      returns: e
    });
  }
  implement(e) {
    return this.parse(e);
  }
  strictImplement(e) {
    return this.parse(e);
  }
  static create(e, r, n) {
    return new ke({
      args: e || z.create([]).rest(ae.create()),
      returns: r || ae.create(),
      typeName: k.ZodFunction,
      ...T(n)
    });
  }
}
class Ae extends S {
  get schema() {
    return this._def.getter();
  }
  _parse(e) {
    const { ctx: r } = this._processInputParams(e);
    return this._def.getter()._parse({ data: r.data, path: r.path, parent: r });
  }
}
Ae.create = (t, e) => new Ae({
  getter: t,
  typeName: k.ZodLazy,
  ...T(e)
});
class Ce extends S {
  _parse(e) {
    if (e.data !== this._def.value) {
      const r = this._getOrReturnCtx(e);
      return p(r, {
        received: r.data,
        code: u.invalid_literal,
        expected: this._def.value
      }), v;
    }
    return { status: "valid", value: e.data };
  }
  get value() {
    return this._def.value;
  }
}
Ce.create = (t, e) => new Ce({
  value: t,
  typeName: k.ZodLiteral,
  ...T(e)
});
function $t(t, e) {
  return new re({
    values: t,
    typeName: k.ZodEnum,
    ...T(e)
  });
}
class re extends S {
  _parse(e) {
    if (typeof e.data != "string") {
      const r = this._getOrReturnCtx(e), n = this._def.values;
      return p(r, {
        expected: I.joinValues(n),
        received: r.parsedType,
        code: u.invalid_type
      }), v;
    }
    if (this._cache || (this._cache = new Set(this._def.values)), !this._cache.has(e.data)) {
      const r = this._getOrReturnCtx(e), n = this._def.values;
      return p(r, {
        received: r.data,
        code: u.invalid_enum_value,
        options: n
      }), v;
    }
    return L(e.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const e = {};
    for (const r of this._def.values)
      e[r] = r;
    return e;
  }
  get Values() {
    const e = {};
    for (const r of this._def.values)
      e[r] = r;
    return e;
  }
  get Enum() {
    const e = {};
    for (const r of this._def.values)
      e[r] = r;
    return e;
  }
  extract(e, r = this._def) {
    return re.create(e, {
      ...this._def,
      ...r
    });
  }
  exclude(e, r = this._def) {
    return re.create(this.options.filter((n) => !e.includes(n)), {
      ...this._def,
      ...r
    });
  }
}
re.create = $t;
class st extends S {
  _parse(e) {
    const r = I.getValidEnumValues(this._def.values), n = this._getOrReturnCtx(e);
    if (n.parsedType !== g.string && n.parsedType !== g.number) {
      const s = I.objectValues(r);
      return p(n, {
        expected: I.joinValues(s),
        received: n.parsedType,
        code: u.invalid_type
      }), v;
    }
    if (this._cache || (this._cache = new Set(I.getValidEnumValues(this._def.values))), !this._cache.has(e.data)) {
      const s = I.objectValues(r);
      return p(n, {
        received: n.data,
        code: u.invalid_enum_value,
        options: s
      }), v;
    }
    return L(e.data);
  }
  get enum() {
    return this._def.values;
  }
}
st.create = (t, e) => new st({
  values: t,
  typeName: k.ZodNativeEnum,
  ...T(e)
});
class ge extends S {
  unwrap() {
    return this._def.type;
  }
  _parse(e) {
    const { ctx: r } = this._processInputParams(e);
    if (r.parsedType !== g.promise && r.common.async === !1)
      return p(r, {
        code: u.invalid_type,
        expected: g.promise,
        received: r.parsedType
      }), v;
    const n = r.parsedType === g.promise ? r.data : Promise.resolve(r.data);
    return L(n.then((s) => this._def.type.parseAsync(s, {
      path: r.path,
      errorMap: r.common.contextualErrorMap
    })));
  }
}
ge.create = (t, e) => new ge({
  type: t,
  typeName: k.ZodPromise,
  ...T(e)
});
class Y extends S {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === k.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e), s = this._def.effect || null, i = {
      addIssue: (c) => {
        p(n, c), c.fatal ? r.abort() : r.dirty();
      },
      get path() {
        return n.path;
      }
    };
    if (i.addIssue = i.addIssue.bind(i), s.type === "preprocess") {
      const c = s.transform(n.data, i);
      if (n.common.async)
        return Promise.resolve(c).then(async (a) => {
          if (r.value === "aborted")
            return v;
          const h = await this._def.schema._parseAsync({
            data: a,
            path: n.path,
            parent: n
          });
          return h.status === "aborted" ? v : h.status === "dirty" || r.value === "dirty" ? _e(h.value) : h;
        });
      {
        if (r.value === "aborted")
          return v;
        const a = this._def.schema._parseSync({
          data: c,
          path: n.path,
          parent: n
        });
        return a.status === "aborted" ? v : a.status === "dirty" || r.value === "dirty" ? _e(a.value) : a;
      }
    }
    if (s.type === "refinement") {
      const c = (a) => {
        const h = s.refinement(a, i);
        if (n.common.async)
          return Promise.resolve(h);
        if (h instanceof Promise)
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        return a;
      };
      if (n.common.async === !1) {
        const a = this._def.schema._parseSync({
          data: n.data,
          path: n.path,
          parent: n
        });
        return a.status === "aborted" ? v : (a.status === "dirty" && r.dirty(), c(a.value), { status: r.value, value: a.value });
      } else
        return this._def.schema._parseAsync({ data: n.data, path: n.path, parent: n }).then((a) => a.status === "aborted" ? v : (a.status === "dirty" && r.dirty(), c(a.value).then(() => ({ status: r.value, value: a.value }))));
    }
    if (s.type === "transform")
      if (n.common.async === !1) {
        const c = this._def.schema._parseSync({
          data: n.data,
          path: n.path,
          parent: n
        });
        if (!pe(c))
          return v;
        const a = s.transform(c.value, i);
        if (a instanceof Promise)
          throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");
        return { status: r.value, value: a };
      } else
        return this._def.schema._parseAsync({ data: n.data, path: n.path, parent: n }).then((c) => pe(c) ? Promise.resolve(s.transform(c.value, i)).then((a) => ({
          status: r.value,
          value: a
        })) : v);
    I.assertNever(s);
  }
}
Y.create = (t, e, r) => new Y({
  schema: t,
  typeName: k.ZodEffects,
  effect: e,
  ...T(r)
});
Y.createWithPreprocess = (t, e, r) => new Y({
  schema: e,
  effect: { type: "preprocess", transform: t },
  typeName: k.ZodEffects,
  ...T(r)
});
class V extends S {
  _parse(e) {
    return this._getType(e) === g.undefined ? L(void 0) : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
}
V.create = (t, e) => new V({
  innerType: t,
  typeName: k.ZodOptional,
  ...T(e)
});
class ne extends S {
  _parse(e) {
    return this._getType(e) === g.null ? L(null) : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ne.create = (t, e) => new ne({
  innerType: t,
  typeName: k.ZodNullable,
  ...T(e)
});
class Oe extends S {
  _parse(e) {
    const { ctx: r } = this._processInputParams(e);
    let n = r.data;
    return r.parsedType === g.undefined && (n = this._def.defaultValue()), this._def.innerType._parse({
      data: n,
      path: r.path,
      parent: r
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
Oe.create = (t, e) => new Oe({
  innerType: t,
  typeName: k.ZodDefault,
  defaultValue: typeof e.default == "function" ? e.default : () => e.default,
  ...T(e)
});
class Ne extends S {
  _parse(e) {
    const { ctx: r } = this._processInputParams(e), n = {
      ...r,
      common: {
        ...r.common,
        issues: []
      }
    }, s = this._def.innerType._parse({
      data: n.data,
      path: n.path,
      parent: {
        ...n
      }
    });
    return De(s) ? s.then((i) => ({
      status: "valid",
      value: i.status === "valid" ? i.value : this._def.catchValue({
        get error() {
          return new j(n.common.issues);
        },
        input: n.data
      })
    })) : {
      status: "valid",
      value: s.status === "valid" ? s.value : this._def.catchValue({
        get error() {
          return new j(n.common.issues);
        },
        input: n.data
      })
    };
  }
  removeCatch() {
    return this._def.innerType;
  }
}
Ne.create = (t, e) => new Ne({
  innerType: t,
  typeName: k.ZodCatch,
  catchValue: typeof e.catch == "function" ? e.catch : () => e.catch,
  ...T(e)
});
class it extends S {
  _parse(e) {
    if (this._getType(e) !== g.nan) {
      const n = this._getOrReturnCtx(e);
      return p(n, {
        code: u.invalid_type,
        expected: g.nan,
        received: n.parsedType
      }), v;
    }
    return { status: "valid", value: e.data };
  }
}
it.create = (t) => new it({
  typeName: k.ZodNaN,
  ...T(t)
});
class ut extends S {
  _parse(e) {
    const { ctx: r } = this._processInputParams(e), n = r.data;
    return this._def.type._parse({
      data: n,
      path: r.path,
      parent: r
    });
  }
  unwrap() {
    return this._def.type;
  }
}
class qe extends S {
  _parse(e) {
    const { status: r, ctx: n } = this._processInputParams(e);
    if (n.common.async)
      return (async () => {
        const i = await this._def.in._parseAsync({
          data: n.data,
          path: n.path,
          parent: n
        });
        return i.status === "aborted" ? v : i.status === "dirty" ? (r.dirty(), _e(i.value)) : this._def.out._parseAsync({
          data: i.value,
          path: n.path,
          parent: n
        });
      })();
    {
      const s = this._def.in._parseSync({
        data: n.data,
        path: n.path,
        parent: n
      });
      return s.status === "aborted" ? v : s.status === "dirty" ? (r.dirty(), {
        status: "dirty",
        value: s.value
      }) : this._def.out._parseSync({
        data: s.value,
        path: n.path,
        parent: n
      });
    }
  }
  static create(e, r) {
    return new qe({
      in: e,
      out: r,
      typeName: k.ZodPipeline
    });
  }
}
class Me extends S {
  _parse(e) {
    const r = this._def.innerType._parse(e), n = (s) => (pe(s) && (s.value = Object.freeze(s.value)), s);
    return De(r) ? r.then((s) => n(s)) : n(r);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Me.create = (t, e) => new Me({
  innerType: t,
  typeName: k.ZodReadonly,
  ...T(e)
});
var k;
(function(t) {
  t.ZodString = "ZodString", t.ZodNumber = "ZodNumber", t.ZodNaN = "ZodNaN", t.ZodBigInt = "ZodBigInt", t.ZodBoolean = "ZodBoolean", t.ZodDate = "ZodDate", t.ZodSymbol = "ZodSymbol", t.ZodUndefined = "ZodUndefined", t.ZodNull = "ZodNull", t.ZodAny = "ZodAny", t.ZodUnknown = "ZodUnknown", t.ZodNever = "ZodNever", t.ZodVoid = "ZodVoid", t.ZodArray = "ZodArray", t.ZodObject = "ZodObject", t.ZodUnion = "ZodUnion", t.ZodDiscriminatedUnion = "ZodDiscriminatedUnion", t.ZodIntersection = "ZodIntersection", t.ZodTuple = "ZodTuple", t.ZodRecord = "ZodRecord", t.ZodMap = "ZodMap", t.ZodSet = "ZodSet", t.ZodFunction = "ZodFunction", t.ZodLazy = "ZodLazy", t.ZodLiteral = "ZodLiteral", t.ZodEnum = "ZodEnum", t.ZodEffects = "ZodEffects", t.ZodNativeEnum = "ZodNativeEnum", t.ZodOptional = "ZodOptional", t.ZodNullable = "ZodNullable", t.ZodDefault = "ZodDefault", t.ZodCatch = "ZodCatch", t.ZodPromise = "ZodPromise", t.ZodBranded = "ZodBranded", t.ZodPipeline = "ZodPipeline", t.ZodReadonly = "ZodReadonly";
})(k || (k = {}));
const o = U.create, f = oe.create, q = ce.create, w = Ze.create, Lt = Se.create, _ = ae.create;
te.create;
const E = W.create, l = A.create, x = Ie.create, jr = ze.create;
Ee.create;
const Dr = z.create, b = Re.create, Zr = Ae.create, we = Ce.create, Pe = re.create;
ge.create;
V.create;
ne.create;
const K = Y.createWithPreprocess;
function M(t, e = 0, r = 2) {
  if (e > r) return "...";
  if (t instanceof A) {
    const n = t.shape, s = Object.keys(n).filter((c) => !c.startsWith("__"));
    return s.length === 0 ? "{ }" : e >= r - 1 ? "{ ... }" : `{ ${s.map((c) => {
      const a = n[c], h = a instanceof V, d = M(h ? a.unwrap() : a, e + 1, r);
      return `${c}${h ? "?" : ""}: ${d}`;
    }).join(", ")} }`;
  }
  if (t instanceof Ie)
    return t.options.map((n) => M(n, e, r)).join(" or ");
  if (t instanceof U) return "string";
  if (t instanceof oe) return "number";
  if (t instanceof Ze) return "boolean";
  if (t instanceof ce) return "bigint";
  if (t instanceof Se) return "null";
  if (t instanceof W) {
    const n = M(t.element, e + 1, r);
    return n === "unknown" || n === "any" ? "array" : `${n}[]`;
  }
  if (t instanceof z)
    return `[${t.items.map((n) => M(n, e + 1, r)).join(", ")}]`;
  if (t instanceof Re) {
    const n = M(
      t._def.valueType,
      e + 1,
      r
    );
    return n === "unknown" || n === "any" ? "{ [key: string]: unknown }" : `{ [key: string]: ${n} }`;
  }
  return t instanceof V ? `${M(t.unwrap(), e, r)}?` : t instanceof Ce ? JSON.stringify(t.value) : t instanceof re ? t.options.map((n) => `"${n}"`).join(" | ") : t instanceof et ? "any" : t instanceof ae ? "unknown" : t instanceof tt ? "void" : t instanceof We ? "undefined" : t instanceof Y ? M(t.innerType(), e, r) : t instanceof Oe ? M(t.removeDefault(), e, r) : t instanceof ne ? `${M(t.unwrap(), e, r)} | null` : t instanceof Ae ? "lazy" : t instanceof ge ? `Promise<${M(t.unwrap(), e + 1, r)}>` : t instanceof ke ? "function" : t instanceof xe ? "Date" : t instanceof nt ? "Map" : t instanceof me ? "Set" : t instanceof Ee ? `${M(t._def.left, e, r)} & ${M(t._def.right, e, r)}` : t instanceof ze ? t.options.map((n) => M(n, e, r)).join(" or ") : t instanceof ut ? M(t.unwrap(), e, r) : t instanceof it ? "NaN" : t instanceof Ne ? M(t.removeCatch(), e, r) : t instanceof qe ? M(t._def.in, e, r) : t instanceof Me ? `readonly ${M(t.unwrap(), e, r)}` : "unknown";
}
function Wr(t) {
  return t === null ? "null" : t === void 0 ? "undefined" : Array.isArray(t) ? "array" : typeof t;
}
function Vr(t, e, r, n) {
  const s = r.filter((a) => a.path.length === 0), i = r.filter((a) => a.path.length > 0);
  if (s.length > 0 && i.length === 0) {
    const a = s.some((d) => d.code === "custom"), h = s.some(
      (d) => d.code !== "invalid_type" && d.code !== "invalid_literal" && d.code !== "invalid_union"
    );
    if (!a && !h) {
      const d = M(e), m = Wr(n);
      return `Invalid parameters for ${t}: expected ${d}${d === "{ }" ? " or no args" : ""}, received ${m}`;
    }
  }
  const c = r.map((a) => `at '${a.path.length > 0 ? a.path.join(".") : "root"}': ${a.message}`);
  return `Invalid parameters for ${t}: ${c.join("; ")}`;
}
const Fr = /* @__PURE__ */ new Set();
function Ur(t) {
  return Fr.has(t);
}
const jt = /* @__PURE__ */ new Map();
function Br(t, e) {
  jt.set(t, e);
}
function zr(t) {
  return jt.get(t);
}
function qr(t) {
  return t.startsWith("tab_") ? "required" : "active";
}
function Hr(t) {
  return t === "content-script" ? "content-script" : t === "main-thread" ? "main-thread" : t === "worker" ? "worker:default" : t.startsWith("worker:") ? t : "main-thread";
}
function Gr(t, e) {
  return e !== "main-thread" ? e : Ur(t) ? "content-script" : e;
}
function Jr(t, e) {
  return {
    endpoint: Hr(Gr(t, e)),
    tabPolicy: qr(t)
  };
}
function Yr(t) {
  for (const e of t)
    Br(e.action, Jr(e.action, e.owner));
}
const D = () => x([q(), f().finite()]).transform((t) => BigInt(t));
l({
  key: o().describe("Storage key to retrieve")
});
l({
  key: o().describe("Storage key to set"),
  value: o().describe("Value to store")
});
l({
  key: o().describe("Storage key to delete")
});
l({});
const Kr = l({
  items: b(o()).describe("Record of key-value string pairs to store")
});
K((t) => t !== null && typeof t == "object" && !Array.isArray(t) && !("items" in t) ? { items: t } : t, Kr);
const Qr = l({
  keys: E(o()).describe("Array of storage keys to retrieve"),
  defaults: b(o()).optional().describe("Default string values for missing keys")
});
K(
  (t) => Array.isArray(t) ? { keys: t } : t,
  Qr
);
l({});
const Xr = l({
  keys: E(o()).describe("Array of storage keys to delete")
});
K(
  (t) => Array.isArray(t) ? { keys: t } : t,
  Xr
);
l({});
l({});
x([
  Dr([x([l({ text: o() }), o()])]),
  l({ text: o().optional(), value: o().optional() })
]);
l({
  url: o().describe("URL to fetch"),
  method: o().default("GET").describe("HTTP method (GET, POST, PUT, DELETE, etc.)"),
  headers: b(o()).default({}).describe("Request headers as key-value pairs"),
  body: o().nullable().default(null).describe("Request body string"),
  timeout: D().default(30000n).describe("Timeout in milliseconds"),
  store: w().optional().describe(
    "When true, store binary responses as a handle instead of returning body bytes"
  ),
  options: l({}).passthrough().optional().describe("Fetch options")
}).passthrough();
l({
  duration: D().describe("Duration to sleep in milliseconds")
});
const se = () => o().regex(/^e\d+$/), en = 'use { refId: "e2" } or { label: "..." } object form, not positional arguments', ft = (t, e) => {
  if (t.__invalidPositional !== void 0) {
    e.addIssue({
      code: u.custom,
      message: en
    });
    return;
  }
  !t.refId && !t.label && e.addIssue({
    code: u.custom,
    message: "Either refId or label is required"
  });
}, Dt = (t, e) => {
  t.x !== void 0 || t.y !== void 0 || ft(t, e);
}, O = (t) => K(
  (e) => typeof e == "string" || typeof e == "number" ? { __invalidPositional: e } : e,
  l({
    __invalidPositional: x([o(), f()]).optional().describe("Internal flag for positional argument rejection"),
    refId: se().optional().describe("Element reference ID (e.g. e2)"),
    label: o().optional().describe("Human-readable element label"),
    ...t
  }).superRefine(ft)
), $e = {
  tabId: x([f(), q()]).optional().describe("Target tab ID")
}, H = (t) => K(
  (e) => typeof e == "string" || typeof e == "number" ? { __invalidPositional: e } : e,
  l({
    __invalidPositional: x([o(), f()]).optional().describe("Internal flag for positional argument rejection"),
    ...$e,
    refId: se().optional().describe("Element reference ID (e.g. e2)"),
    label: o().optional().describe("Human-readable element label"),
    ...t
  }).superRefine(ft)
);
l({});
l({});
l({
  url: o().describe("URL to navigate to"),
  timeout: D().optional().describe("Navigation timeout in milliseconds"),
  waitUntil: Pe(["load", "networkidle"]).optional().describe(
    "When to consider navigation complete: 'load' (tab status complete) or 'networkidle' (no in-flight requests for 500ms)"
  )
});
l({});
l({});
l({});
l({
  duration: D().default(1000n).describe("Duration to wait in milliseconds")
});
O();
const tn = (t, e) => {
  [t.url, t.path, t.handle].filter(
    (n) => typeof n == "string" && n.length > 0
  ).length !== 1 && e.addIssue({
    code: u.custom,
    message: "Each file entry requires exactly one of url, path, or handle"
  });
}, Zt = l({
  name: o().optional().describe("File name including extension"),
  mimeType: o().optional().describe("MIME type (defaults to application/octet-stream)"),
  url: o().url().optional().describe("HTTP(S) URL to fetch in the target tab"),
  path: o().min(1).optional().describe("Virtual filesystem path (resolved in worker)"),
  handle: o().min(1).optional().describe("Binary handle from page.fetch({ store: true })")
}).superRefine(tn), Wt = jr("kind", [
  l({
    kind: we("bytes"),
    name: o().min(1),
    data: o().min(1),
    mimeType: o().optional()
  }),
  l({
    kind: we("url"),
    url: o().url(),
    name: o().min(1),
    mimeType: o().optional()
  })
]);
O({
  value: o().describe("Value to fill into the element")
});
const rn = O({
  files: E(Zt).min(1).describe("Files to attach to the input")
});
O({
  files: E(Wt).min(1).describe("Resolved files for content-script application")
});
O({
  text: o().describe("Text to type into the element")
});
O({
  text: o().describe("Text to append into the element")
});
l({
  key: o().describe("Key to press (e.g. Enter, Escape, ArrowDown)")
});
O({
  value: o().describe("Value to select in the dropdown")
});
O({
  value: o().describe("Visible text of the option to select (matched case-insensitively)")
});
O({
  checked: w().optional().describe("Desired checked state (true to check, false to uncheck)")
});
O();
l({});
l({
  direction: o().default("down").describe("Scroll direction: up, down, left, or right"),
  amount: f().default(300).describe("Pixels to scroll")
});
K(
  (t) => typeof t == "string" || typeof t == "number" ? { __invalidPositional: t } : t,
  l({
    __invalidPositional: x([o(), f()]).optional().describe("Internal flag for positional argument rejection"),
    refId: se().optional().describe("Element reference ID (e.g. e2)"),
    label: o().optional().describe("Human-readable element label"),
    x: f().optional().describe("X coordinate to scroll to"),
    y: f().optional().describe("Y coordinate to scroll to")
  }).superRefine(Dt)
);
O();
l({
  selector: o().describe("CSS selector to find elements")
});
l({
  selector: o().describe("CSS selector for the root element(s) to introspect"),
  depth: f().int().min(0).max(10).default(2).describe("How many descendant levels to include (0 = root only)"),
  includeHidden: w().default(!0).describe(
    "Include elements hidden by CSS/aria (default true — this tool's purpose is to see what the curated snapshot filters out)"
  )
});
l({
  selector: o().describe("CSS selector to wait for"),
  timeout: D().default(30000n).describe("Timeout in milliseconds")
});
const nn = l({
  fields: E(o()).describe("Array of field names to extract")
});
K(
  (t) => Array.isArray(t) ? { fields: t } : t,
  nn
);
x([
  f(),
  E(l({}).passthrough()),
  l({}).passthrough()
]);
l({});
l({
  active: w().optional().describe("Whether the tabs are active"),
  currentWindow: w().optional().describe("Whether the tabs are in the current window"),
  url: o().optional().describe("URL pattern to match tabs against")
}).passthrough();
K(
  (t) => typeof t == "string" ? { url: t } : t,
  l({
    url: o().optional().describe("URL to open in the new tab"),
    active: w().optional().describe("Whether to focus the new tab")
  })
);
x([
  f(),
  E(
    l({
      id: f().optional(),
      tabId: f().optional(),
      tab_id: f().optional()
    }).passthrough()
  ),
  l({
    id: f().optional(),
    tabId: f().optional(),
    tab_id: f().optional()
  }).passthrough()
]);
H();
H({
  value: o().describe("Value to fill into the element")
});
const sn = H({
  files: E(Zt).min(1).describe("Files to attach to the input")
});
H({
  files: E(Wt).min(1).describe("Resolved files for content-script application")
});
K(
  (t) => typeof t == "string" || typeof t == "number" ? { __invalidPositional: t } : t,
  l({
    __invalidPositional: x([o(), f()]).optional().describe("Internal flag for positional argument rejection"),
    ...$e,
    refId: se().optional().describe("Element reference ID (e.g. e2)"),
    label: o().optional().describe("Human-readable element label"),
    x: f().optional().describe("X coordinate to scroll to"),
    y: f().optional().describe("Y coordinate to scroll to")
  }).superRefine(Dt)
);
H({
  text: o().describe("Text to type into the element")
});
l({
  ...$e,
  key: o().describe("Key to press (e.g. Enter, Escape, ArrowDown)")
});
H({
  value: o().describe("Value to select in the dropdown")
});
H({
  value: o().describe("Visible text of the option to select (matched case-insensitively)")
});
H({
  checked: w().optional().describe("Desired checked state (true to check, false to uncheck)")
});
H();
l({
  ...$e
});
l({
  ...$e,
  direction: o().default("down").describe("Scroll direction: up, down, left, or right"),
  amount: f().default(300).describe("Pixels to scroll")
});
H();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID"),
  script: o().optional().describe("Script to evaluate"),
  code: o().optional().describe("Alternative script code"),
  js: o().optional().describe("Alternative JS code")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID"),
  timeout: f().optional().describe("Timeout in milliseconds")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID"),
  url: o().optional().describe("URL to fetch"),
  options: l({}).passthrough().optional().describe("Fetch options")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID"),
  max_nodes: f().optional().describe("Maximum nodes to include"),
  options: l({}).passthrough().optional().describe("Snapshot options")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID"),
  max_nodes: f().optional().describe("Maximum nodes to include"),
  options: l({}).passthrough().optional().describe("Snapshot options")
}).passthrough();
l({
  tabId: x([f(), q()]).optional().describe("Target tab ID"),
  max_nodes: f().optional().describe("Maximum nodes to include"),
  options: l({}).passthrough().optional().describe("Snapshot options")
}).passthrough();
O();
O();
O({
  value: o().optional().describe("Value to fill into the element")
});
O({
  text: o().optional().describe("Text to type into the element")
});
l({
  key: o().optional().describe("Key to press (e.g. Enter, Escape, ArrowDown)")
});
O({
  value: o().optional().describe("Value to select in the dropdown")
});
O({
  checked: w().optional().describe("Desired checked state (true to check, false to uncheck)")
});
O();
l({});
l({
  direction: o().optional().describe("Scroll direction: up, down, left, or right"),
  amount: f().optional().describe("Pixels to scroll")
});
O();
O({
  text: o().optional().describe("Text to append into the element")
});
l({});
l({});
l({
  duration: D().default(1000n).describe("Duration to wait in milliseconds")
});
l({
  interactive_only: w().default(!1).describe("Only include interactive elements"),
  max_nodes: D().default(500n).describe("Maximum number of nodes to include in snapshot")
});
l({
  interactive_only: w().default(!1).describe("Only include interactive elements"),
  max_nodes: D().default(500n).describe("Maximum number of nodes to include in snapshot")
});
l({
  interactive_only: w().default(!1).describe("Only include interactive elements"),
  max_nodes: D().default(500n).describe("Maximum number of nodes to include in snapshot")
});
l({
  interactive_only: w().default(!1).describe("Only include interactive elements"),
  max_nodes: D().default(500n).describe("Maximum number of nodes to include in snapshot")
});
l({
  snapshot: l({}).passthrough().describe("Raw DOM snapshot data to format"),
  format: o().optional().describe("Output format (e.g. markdown, html)")
});
l({
  max_nodes: f().optional().describe("Maximum nodes to include"),
  options: l({}).passthrough().optional().describe("Snapshot options")
}).passthrough();
l({
  max_nodes: f().optional().describe("Maximum nodes to include"),
  options: l({}).passthrough().optional().describe("Snapshot options")
}).passthrough();
l({
  max_nodes: f().optional().describe("Maximum nodes to include"),
  options: l({}).passthrough().optional().describe("Snapshot options")
}).passthrough();
const an = l({
  role: x([o(), E(o())]).optional().describe("Filter by ARIA role"),
  tag: x([o(), E(o())]).optional().describe("Filter by HTML tag"),
  text: o().optional().describe("Filter by text content (case-insensitive substring)"),
  name: o().optional().describe("Filter by accessible name (case-insensitive substring)"),
  interactiveOnly: w().optional().describe("Only include interactive elements"),
  href: o().optional().describe("Filter by href pattern (case-insensitive substring)"),
  src: o().optional().describe("Filter by src pattern (case-insensitive substring)"),
  limit: f().positive().optional().describe("Maximum filtered nodes to return")
}).passthrough(), on = l({
  filter: an.optional().describe(
    "Semantic filter criteria"
  ),
  max_nodes: f().optional().describe("Maximum nodes to collect before filtering")
}).passthrough();
on.extend({
  tabId: f().describe("Tab ID")
});
const X = l({
  path: o().describe("File or directory path")
}), xt = l({
  from: o().describe("Source path"),
  to: o().describe("Destination path")
}), le = l({
  path: o().describe("File path to write to"),
  data: o().describe("Data to write")
}), cn = l({
  path: o().describe("File path to read from"),
  offset: D().describe("Byte offset to start reading"),
  len: f().describe("Number of bytes to read")
}), dn = l({
  path: o().describe("File path to update"),
  offset: D().describe("Byte offset to start writing"),
  data: o().describe("Data to write")
}), ln = l({
  path: o().describe("File path to hash"),
  algo: o().default("sha256").describe("Hash algorithm (e.g. sha256, md5)")
});
b(_());
b(_());
b(_());
b(_());
x([
  f(),
  b(_())
]);
x([
  f(),
  b(_())
]);
b(_());
b(_());
b(_());
x([
  o(),
  b(_())
]);
b(_());
b(
  _()
);
b(_());
b(_());
b(_());
x([
  o(),
  f(),
  b(_())
]);
b(_());
b(_());
b(_());
x([
  f(),
  b(_())
]);
b(_());
b(_());
b(_());
b(_());
b(_());
E(_());
x([
  o(),
  b(_())
]);
b(_());
x([
  o(),
  b(_())
]);
b(_());
x([
  o(),
  b(_())
]);
b(_());
x([
  o(),
  b(_())
]);
b(_());
b(_());
x([
  f(),
  b(_())
]);
b(_());
b(_());
x([
  f(),
  b(_())
]);
b(
  _()
);
x([
  o(),
  f(),
  b(_())
]);
b(_());
b(_());
b(_());
b(_());
x([
  f(),
  b(_())
]);
x([
  f(),
  b(_())
]);
x([
  f(),
  b(_())
]);
x([
  f(),
  b(_())
]);
x([
  f(),
  b(_())
]);
b(_());
b(_());
b(_());
l({
  action: o().describe("Host action name"),
  params: l({}).passthrough().optional().describe("Parameters for the host action")
}).passthrough();
x([
  o(),
  f(),
  w(),
  Lt(),
  E(_()),
  b(_())
]);
const un = l({
  ok: we(!0).describe("Whether the action succeeded"),
  action: o().describe("Action identifier (e.g. 'page_fill')"),
  refId: se().optional().describe("Element reference ID that was acted upon (e.g. e2)"),
  tag: o().optional().describe("HTML tag name of the element"),
  role: o().optional().describe("ARIA role of the element"),
  name: o().optional().describe("Accessible name of the element"),
  value: o().optional().describe("Final value of the element after the action"),
  checked: w().optional().describe("Checked state after the action"),
  disabled: w().optional().describe("Whether the element is disabled"),
  readOnly: w().optional().describe("Whether the element is read-only"),
  text: o().optional().describe("Text content of the element"),
  key: o().optional().describe("Key that was pressed (for press actions)"),
  direction: o().optional().describe("Scroll direction (for scroll actions)"),
  amount: f().optional().describe("Scroll amount in pixels (for scroll actions)"),
  fileCount: f().optional().describe("Number of files attached (for setFiles actions)"),
  fileNames: E(o()).optional().describe("Names of attached files (for setFiles actions)"),
  observationId: o().optional().describe(
    "Opaque ID of the observation lease authorizing this action (snapshot-scoped)"
  ),
  dispatched: we(!0).optional().describe(
    "True if the action was dispatched to the DOM. Does NOT prove the application accepted it."
  ),
  verification: we("required").optional().describe(
    "Always 'required': a fresh observation is required to verify the effect."
  )
});
x([un, Lt()]);
l({
  status: f().describe("HTTP response status code"),
  ok: w().describe("Whether the response status is 2xx"),
  headers: b(o()).describe("Response headers as key-value pairs"),
  body: o().optional().describe("Response body (omitted when bodyEncoding is handle)"),
  bodyEncoding: Pe(["text", "base64", "handle"]).describe("Encoding of the body field"),
  handle: o().optional().describe("Binary handle when bodyEncoding is handle"),
  byteLength: f().describe("Length of the body in bytes"),
  contentType: o().describe("Response Content-Type header"),
  finalUrl: o().describe("Final URL after redirects")
});
l({
  data: l({}).passthrough().describe("Structured snapshot data"),
  text: o().describe("Plain text representation of the snapshot")
});
l({});
l({
  tabId: f(),
  url: o(),
  title: o(),
  contentScript: Pe(["connected", "missing"]),
  domApis: Pe(["ok", "blocked"]),
  mutationsReady: w(),
  hint: o().optional(),
  recovery: E(o()).optional()
});
const fn = l({
  refId: se().describe("Element reference ID (e.g. e2)"),
  role: o().describe("ARIA role of the element"),
  tag: o().describe("HTML tag name"),
  name: o().optional().describe("Accessible name of the element"),
  text: o().optional().describe("Visible text content of the element"),
  value: o().optional().describe("Element value"),
  checked: w().optional().describe("Checked state"),
  disabled: w().optional().describe("Whether the element is disabled"),
  readOnly: w().optional().describe("Whether the element is read-only"),
  href: o().optional().describe("Absolute URL for link elements"),
  src: o().optional().describe("Absolute URL for image elements"),
  alt: o().optional().describe("Alternative text for image elements"),
  title: o().optional().describe("Title attribute"),
  parentRefId: se().optional().describe("Reference ID of the parent container element"),
  postId: o().optional().describe("Stable post identifier from data-post-id attribute"),
  permalink: o().optional().describe("Stable permalink URL from anchor element"),
  imageUrls: E(o()).optional().describe("Image URLs contained within this element")
});
l({
  text: o().describe("Plain text representation of the page"),
  nodes: E(fn).describe("Array of interactive nodes"),
  url: o().describe("Current page URL"),
  title: o().describe("Current page title"),
  viewport: l({
    width: f().describe("Viewport width in pixels"),
    height: f().describe("Viewport height in pixels")
  }).describe("Viewport dimensions"),
  observationId: o().optional().describe(
    "Opaque ID of the observation lease granted by this snapshot. Pass to subsequent actions to prove they act on fresh observations."
  )
});
const Vt = l({
  refId: se().optional(),
  tag: o(),
  role: o().optional(),
  name: o().optional(),
  text: o().optional(),
  attributes: b(o()).optional().describe("All HTML attributes (raw)"),
  hidden: w().optional(),
  hiddenReason: Pe([
    "display-none",
    "visibility-hidden",
    "aria-hidden",
    "opacity-zero",
    "hidden-attr",
    "inert"
  ]).optional(),
  value: o().optional(),
  checked: w().optional(),
  disabled: w().optional(),
  readOnly: w().optional(),
  href: o().optional(),
  src: o().optional(),
  alt: o().optional(),
  accept: o().optional().describe("For input[type=file]: accepted MIME/extensions"),
  filesCount: f().optional().describe("For input[type=file]: selected file count"),
  children: E(Zr(() => Vt)).optional().describe("Nested descendants up to `depth`")
});
l({
  nodes: E(Vt),
  url: o(),
  title: o()
});
const Ft = l({
  id: f().optional().describe("Tab ID"),
  tabId: f().optional().describe("Tab ID (added by runner)"),
  index: f().optional().describe("Tab index in the window"),
  windowId: f().optional().describe("Window ID"),
  url: o().optional().describe("Tab URL"),
  title: o().optional().describe("Tab title"),
  status: o().optional().describe("Tab status (loading or complete)"),
  active: w().optional().describe("Whether the tab is active"),
  pinned: w().optional().describe("Whether the tab is pinned"),
  highlighted: w().optional().describe("Whether the tab is highlighted"),
  incognito: w().optional().describe("Whether the tab is incognito"),
  favIconUrl: o().optional().describe("Favicon URL"),
  audible: w().optional().describe("Whether the tab is audible"),
  groupId: f().optional().describe("Group ID"),
  openerTabId: f().optional().describe("Opener tab ID"),
  discarded: w().optional().describe("Whether the tab is discarded"),
  autoDiscardable: w().optional().describe("Whether the tab is auto-discardable"),
  width: f().optional().describe("Tab width"),
  height: f().optional().describe("Tab height"),
  sessionId: o().optional().describe("Session ID")
}).passthrough(), hn = E(Ft), Ut = l({
  id: f().optional().describe("Window ID"),
  focused: w().optional().describe("Whether the window is focused"),
  top: f().optional().describe("Window top position"),
  left: f().optional().describe("Window left position"),
  width: f().optional().describe("Window width"),
  height: f().optional().describe("Window height"),
  tabs: hn.optional().describe(
    "Array of tabs in the window"
  ),
  incognito: w().optional().describe("Whether the window is incognito"),
  type: o().optional().describe("Window type"),
  state: o().optional().describe("Window state"),
  alwaysOnTop: w().optional().describe("Whether the window is always on top"),
  sessionId: o().optional().describe("Session ID")
}).passthrough();
E(Ut);
const pn = l({
  name: o().describe("Cookie name"),
  value: o().describe("Cookie value"),
  domain: o().optional().describe("Cookie domain"),
  hostOnly: w().optional().describe("Whether the cookie is host-only"),
  path: o().optional().describe("Cookie path"),
  secure: w().optional().describe("Whether the cookie is secure"),
  httpOnly: w().optional().describe("Whether the cookie is HTTP-only"),
  sameSite: o().optional().describe("SameSite policy"),
  session: w().optional().describe("Whether the cookie is a session cookie"),
  expirationDate: f().optional().describe("Expiration date as Unix timestamp"),
  storeId: o().optional().describe("Store ID")
}).nullable();
E(
  pn.nullable().unwrap()
);
const mn = l({
  id: o().describe("Bookmark ID"),
  parentId: o().optional().describe("Parent folder ID"),
  index: f().optional().describe("Bookmark index"),
  url: o().optional().describe("Bookmark URL"),
  title: o().describe("Bookmark title"),
  dateAdded: f().optional().describe("Date added"),
  dateGroupModified: f().optional().describe("Date group modified"),
  children: E(l({ id: o() }).passthrough()).optional().describe("Child bookmarks")
}).passthrough();
E(mn);
const gn = l({
  id: o().describe("History item ID"),
  url: o().optional().describe("URL"),
  title: o().optional().describe("Title"),
  lastVisitTime: f().optional().describe("Last visit time"),
  visitCount: f().optional().describe("Visit count"),
  typedCount: f().optional().describe("Typed count")
}).passthrough();
E(gn);
const yn = l({
  frameId: f().describe("Frame ID"),
  result: _().optional().describe("Script result")
});
E(yn);
o();
w();
x([o(), f()]);
w();
const bn = l({
  id: f().optional().describe("Group ID"),
  collapsed: w().optional().describe("Whether the group is collapsed"),
  color: o().optional().describe("Group color"),
  title: o().optional().describe("Group title"),
  windowId: f().optional().describe("Window ID")
}).passthrough();
E(bn);
const _n = l({
  lastModified: f().optional().describe("Last modified time"),
  tab: Ft.optional().describe("Tab info"),
  window: Ut.optional().describe("Window info")
}).passthrough(), vn = E(_n), kn = l({
  deviceName: o().optional().describe("Device name"),
  sessions: vn.optional().describe("Sessions")
}).passthrough();
E(kn);
const wn = l({
  id: f().optional().describe("Download ID"),
  url: o().optional().describe("Download URL"),
  filename: o().optional().describe("Filename"),
  startTime: o().optional().describe("Start time"),
  endTime: o().optional().describe("End time"),
  state: o().optional().describe("Download state"),
  danger: o().optional().describe("Danger type"),
  paused: w().optional().describe("Whether the download is paused"),
  error: o().optional().describe("Error message"),
  bytesReceived: f().optional().describe("Bytes received"),
  totalBytes: f().optional().describe("Total bytes"),
  fileSize: f().optional().describe("File size"),
  mime: o().optional().describe("MIME type"),
  incognito: w().optional().describe("Whether the download is incognito"),
  referrer: o().optional().describe("Referrer URL"),
  byExtensionId: o().optional().describe("Extension ID"),
  byExtensionName: o().optional().describe("Extension name")
}).passthrough();
E(wn);
f();
l({
  archName: o().describe("CPU architecture"),
  modelName: o().describe("CPU model"),
  numOfProcessors: f().describe("Number of processors"),
  features: E(o()).describe("CPU features")
});
l({
  capacity: f().describe("Total memory capacity"),
  availableCapacity: f().describe("Available memory capacity")
});
E(
  l({
    id: o().describe("Storage ID"),
    name: o().describe("Storage name"),
    type: o().describe("Storage type"),
    capacity: f().describe("Storage capacity")
  })
);
C.child("tool-registry");
const Ve = /* @__PURE__ */ new Map(), Fe = /* @__PURE__ */ new Map();
function ht(t) {
  return t && t.length > 0 ? t : "__default__";
}
function Bt(t) {
  const e = ht(t);
  let r = Ve.get(e);
  return r || (r = /* @__PURE__ */ new Map(), Ve.set(e, r)), r;
}
function Tn(t, e, r) {
  const n = ht(t), s = (Fe.get(n) ?? 0) + 1;
  Fe.set(n, s);
  const i = `blob_${s}`;
  return Bt(t).set(i, {
    bytes: e,
    mimeType: r == null ? void 0 : r.mimeType,
    contentType: r == null ? void 0 : r.contentType
  }), i;
}
function xn(t, e) {
  const r = Bt(t), n = r.get(e) ?? null;
  return n && r.delete(e), n;
}
function Sn(t) {
  const e = ht(t);
  Ve.delete(e), Fe.delete(e);
}
function St() {
  Ve.clear(), Fe.clear();
}
const It = 8 * 1024;
function In(t) {
  const e = atob(t), r = new Uint8Array(e.length);
  for (let n = 0; n < e.length; n++)
    r[n] = e.charCodeAt(n);
  return r;
}
function En(t) {
  let e = "";
  for (let r = 0; r < t.length; r += It) {
    const n = t.subarray(r, r + It);
    for (let s = 0; s < n.length; s++)
      e += String.fromCharCode(n[s]);
  }
  return btoa(e);
}
function Rn(t) {
  if (typeof t != "object" || t === null) return !1;
  const e = t;
  if (e.store === !0) return !0;
  const r = e.options;
  return typeof r == "object" && r !== null ? r.store === !0 : !1;
}
function zt(t, e, r) {
  if (!Rn(t) || typeof e != "object" || e === null || !("bodyEncoding" in e))
    return e;
  const n = e;
  if (n.bodyEncoding !== "base64" || !n.body)
    return e;
  const s = In(n.body), i = Tn(r, s, {
    contentType: n.contentType,
    mimeType: n.contentType
  }), { body: c, ...a } = n;
  return {
    ...a,
    bodyEncoding: "handle",
    handle: i
  };
}
function Et(t, e) {
  const n = (t.split(/[?#]/)[0] ?? t).split("/").filter(Boolean).pop();
  return n && n.length > 0 ? n : e;
}
function Je(t) {
  return {
    ok: !1,
    error: {
      message: t,
      code: "E_INVALID_PARAMS",
      category: "validation"
    }
  };
}
async function An(t, e, r, n) {
  var h;
  const i = (t === "tab_set_files" ? sn : rn).safeParse(e);
  if (!i.success)
    return Je(
      ((h = i.error.issues[0]) == null ? void 0 : h.message) ?? "Invalid setFiles params"
    );
  const c = i.data, a = [];
  for (const d of c.files) {
    if (d.url) {
      a.push({
        kind: "url",
        url: d.url,
        name: d.name ?? Et(d.url, "upload.bin"),
        mimeType: d.mimeType
      });
      continue;
    }
    if (d.path) {
      try {
        const m = await n(d.path);
        a.push({
          kind: "bytes",
          name: d.name ?? Et(d.path, "upload.bin"),
          data: m,
          mimeType: d.mimeType
        });
      } catch (m) {
        const R = m instanceof Error ? m.message : String(m);
        return Je(`Failed to read path ${d.path}: ${R}`);
      }
      continue;
    }
    if (d.handle) {
      const m = xn(r, d.handle);
      if (!m)
        return Je(`Unknown or expired handle: ${d.handle}`);
      a.push({
        kind: "bytes",
        name: d.name ?? d.handle,
        data: En(m.bytes),
        mimeType: d.mimeType ?? m.mimeType ?? m.contentType
      });
    }
  }
  return {
    ok: !0,
    value: {
      ...c,
      files: a
    }
  };
}
const Ue = /* @__PURE__ */ new Map();
function Cn(t, e) {
  Ue.set(t, e);
}
function On(t) {
  const e = Ue.get(t);
  return e !== void 0 && Ue.delete(t), e;
}
function Nn() {
  Ue.clear();
}
const qt = /* @__PURE__ */ new Set(["page_set_files", "tab_set_files"]), Ht = /* @__PURE__ */ new Set(["page_fetch", "tab_fetch"]);
let ie = null, at = !1;
const fe = /* @__PURE__ */ new Map();
function Be(t, e) {
  try {
    return t.postMessage(e), !0;
  } catch (r) {
    const n = r instanceof Error ? r.message : String(r);
    return C.error("port_post_failed", { error: n }), !1;
  }
}
const Rt = 1e3;
function Gt(t, e, r) {
  e === "main-thread" || e === "content-script" ? Be(r, { type: "relayCancel", id: t, owner: e }) : Be(r, { type: "registryCallCancel", id: t });
}
function At(t, e) {
  for (const [r, n] of fe)
    clearTimeout(n.timeoutId), Gt(r, n.owner, n.port), n.settle({
      ok: !1,
      error: { message: e, code: t }
    }), fe.delete(r);
}
const ye = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Map();
let Ct = Promise.resolve(), Z = null;
function Mn(t) {
  C.trace("sessionQueue_enqueue");
  const e = Ct.then(t);
  return Ct = e.then(
    () => {
    },
    () => {
    }
  ), e;
}
function Jt(t) {
  Z && (C.error("runCell_worker_failure", {
    runId: Z.runId,
    callId: Z.id,
    error: t
  }), self.postMessage({
    type: "error",
    id: Z.id,
    error: t,
    runId: Z.runId
  }), Z = null);
}
self.addEventListener("error", (t) => {
  const e = t.message || (t.error instanceof Error ? t.error.message : "Worker uncaught error");
  C.error("worker_uncaught_error", { error: e }), Jt(e);
});
self.addEventListener("unhandledrejection", (t) => {
  const e = t.reason, r = e instanceof Error ? e.message : String(e ?? "Unhandled rejection");
  C.error("worker_unhandled_rejection", { error: r }), Jt(r);
});
function Pn(t, e) {
  ye.set(t, e);
}
function N(t, e, r) {
  Pn(t, async (n, s) => {
    const i = e.safeParse(he(n));
    if (!i.success) {
      const c = Vr(
        t,
        e,
        i.error.issues,
        n
      ), a = new Error(c);
      throw a.code = "E_INVALID_PARAMS", a;
    }
    return await r(i.data, s);
  });
}
function $n() {
  const t = new Uint8Array(16);
  return crypto.getRandomValues(t), Array.from(t, (e) => e.toString(16).padStart(2, "0")).join("");
}
function Ln(t) {
  return or(t);
}
const ot = /* @__PURE__ */ new Map(), Le = /* @__PURE__ */ new Map();
function jn(t, e) {
  var r;
  if (ot.has(t))
    throw new Error(`Worker port already registered for owner: ${t}`);
  if (typeof e.addEventListener != "function")
    throw new Error(
      `Worker port for owner "${t}" cannot receive responses`
    );
  ot.set(t, e), e.addEventListener("message", async (n) => {
    var i;
    const s = n.data;
    if (s !== null && (s.type === "asyncRelayResult" || s.type === "registryCallResult") && typeof s.id == "string") {
      ct(s.id, s.result);
      return;
    }
    if (s !== null && s.type === "registryCallCancel" && typeof s.id == "string") {
      (i = Le.get(s.id)) == null || i.abort(), Le.delete(s.id);
      return;
    }
    if (s !== null && s.type === "registryCall" && typeof s.id == "string" && typeof s.action == "string") {
      const c = s.id, a = new AbortController();
      Le.set(c, a);
      const h = ye.get(s.action);
      let d;
      if (!h)
        d = {
          ok: !1,
          error: {
            message: `Unknown worker action: ${s.action}`,
            code: "E_UNKNOWN"
          }
        };
      else
        try {
          const m = await h(s.params, {
            action: s.action,
            callId: s.callId,
            runId: s.runId,
            signal: a.signal
          });
          d = a.signal.aborted ? {
            ok: !1,
            error: { message: "Relay aborted", code: "E_ABORT" }
          } : { ok: !0, value: m };
        } catch (m) {
          d = {
            ok: !1,
            error: {
              message: m instanceof Error ? m.message : String(m),
              code: a.signal.aborted ? "E_ABORT" : "E_WORKER_HANDLER"
            }
          };
        }
      Le.delete(c), Be(e, { type: "registryCallResult", id: c, result: d }) || ct(c, {
        ok: !1,
        error: {
          message: "Failed to deliver worker handler response",
          code: "E_PORT"
        }
      });
    }
  }), (r = e.start) == null || r.call(e);
}
function ct(t, e) {
  C.trace("resolveAsyncRelayResult", { id: t });
  const r = fe.get(t);
  return r ? (r.settle(e), !0) : (C.warn("asyncRelayResult_no_pending_relay", { id: t }), !1);
}
function Dn(t) {
  if (t === "main-thread" || t === "content-script")
    return self;
  const e = ot.get(t);
  return e || null;
}
function Yt(t) {
  const { owner: e, action: r, tabPolicy: n, resolveTimeoutMs: s } = t, i = t.timeoutMs ?? ve;
  return (c, a) => {
    C.trace("safePostAsCall_invoke", {
      owner: e,
      action: r,
      callId: a == null ? void 0 : a.callId,
      runId: a == null ? void 0 : a.runId
    });
    const h = (s == null ? void 0 : s(c)) ?? i;
    return new Promise((d, m) => {
      var bt;
      if ((bt = a == null ? void 0 : a.signal) != null && bt.aborted) {
        const G = new Error(`Relay aborted for action: ${r}`);
        G.code = "E_ABORT", m(G);
        return;
      }
      const R = Dn(e);
      if (!R) {
        m(new Error(`No port available for action: ${r}`));
        return;
      }
      if (fe.size >= Rt) {
        m(
          new Error(
            `Too many pending calls (${Rt} limit exceeded). Action: ${r}`
          )
        );
        return;
      }
      const P = $n();
      let Q = !1;
      const de = (G) => {
        Q || (Q = !0, clearTimeout(mt), a != null && a.signal && a.signal.removeEventListener("abort", He), fe.delete(P), G());
      }, pt = () => {
        Gt(P, e, R);
      }, He = () => {
        pt();
        const G = new Error(`Relay aborted for action: ${r}`);
        G.code = "E_ABORT", de(() => m(G));
      };
      a != null && a.signal && a.signal.addEventListener("abort", He);
      const mt = setTimeout(() => {
        pt(), de(() => m(new Error(`Relay timeout for action: ${r}`)));
      }, h);
      fe.set(P, {
        settle: (G) => de(() => d(G)),
        timeoutId: mt,
        abort: He,
        owner: e,
        port: R
      });
      const gt = a == null ? void 0 : a.runId, yt = a == null ? void 0 : a.callId;
      Be(R, {
        type: e === "main-thread" || e === "content-script" ? "asyncRelay" : "registryCall",
        id: P,
        owner: e,
        action: r,
        params: c,
        callId: yt,
        tabPolicy: n,
        command: { action: r, params: c, runId: gt, callId: yt },
        runId: gt
      }) || de(
        () => m(new Error(`Failed to post relay for action: ${r}`))
      );
    });
  };
}
const Zn = "worker", ve = 3e4, Ot = 5e3, Wn = 500, Vn = {
  page_goto: "timeout",
  page_wait_for: "timeout",
  tab_wait_for_load: "timeout",
  fetch: "timeout",
  sleep: "duration",
  page_wait: "duration",
  sidepanel_wait: "duration"
}, Kt = /* @__PURE__ */ new Set(["page_goto"]);
function Fn(t, e) {
  if (t === null || typeof t != "object" || Array.isArray(t))
    return null;
  const r = t[e];
  return typeof r == "bigint" ? Number(r) : typeof r == "number" && Number.isFinite(r) ? r : null;
}
function Un(t, e) {
  return Kt.has(t) ? e * 3 + Wn + Ot : e + Ot;
}
const Bn = 6e4;
function Qt(t, e) {
  if (qt.has(t))
    return Bn;
  const r = Vn[t];
  if (!r) return ve;
  let n = Fn(e, r);
  return n === null && Kt.has(t) && (n = ve), n === null ? ve : Math.max(
    ve,
    Un(t, n)
  );
}
async function Xt(t, e, r) {
  if (!qt.has(t))
    return { ok: !0, params: e };
  if (!ie)
    return {
      ok: !1,
      error: { message: "Session not initialized", code: "E_INTERNAL" }
    };
  const n = await An(
    t,
    e,
    r,
    async (s) => {
      const i = nr(s);
      if (i !== void 0)
        return i;
      const c = On(s);
      return c !== void 0 ? c : await sr(s);
    }
  );
  return n.ok ? { ok: !0, params: n.value } : n;
}
function Jn(t, e) {
  t = he(t);
  const r = e == null ? void 0 : e.action;
  if (C.trace("extensionDispatch", {
    action: r,
    callId: e == null ? void 0 : e.callId,
    runId: e == null ? void 0 : e.runId
  }), !r)
    return Promise.resolve({
      ok: !1,
      error: {
        message: "Missing action in dispatch context",
        code: "E_MISSING_ACTION"
      }
    });
  const n = t;
  return (async () => {
    var h, d;
    const s = await Xt(
      r,
      t,
      e == null ? void 0 : e.runId
    );
    if (!s.ok)
      return s;
    if (t = s.params, ye.has(r)) {
      const m = ye.get(r), R = (e == null ? void 0 : e.signal) ?? (e != null && e.runId ? (h = F.get(e.runId)) == null ? void 0 : h.signal : void 0);
      return (async () => {
        try {
          return { ok: !0, value: await m(t, { ...e, signal: R }) };
        } catch (P) {
          const Q = P instanceof Error ? P.message : String(P), de = typeof P == "object" && P !== null && "code" in P && typeof P.code == "string" ? P.code : "E_WORKER_HANDLER";
          return { ok: !1, error: { message: Q, code: de } };
        }
      })();
    }
    const i = zr(r);
    if (!i)
      return Promise.resolve({
        ok: !1,
        error: {
          message: `No route registered for action: ${r}`,
          code: "E_NO_ROUTE"
        }
      });
    const a = await Yt({
      owner: i.endpoint,
      action: r,
      resolveTimeoutMs: (m) => Qt(r, m),
      tabPolicy: i.tabPolicy
    })(t, {
      ...e,
      signal: (e == null ? void 0 : e.signal) ?? (e != null && e.runId ? (d = F.get(e.runId)) == null ? void 0 : d.signal : void 0)
    });
    return Ht.has(r) && typeof a == "object" && a !== null && "ok" in a && a.ok ? {
      ok: !0,
      value: zt(
        n,
        a.value,
        e == null ? void 0 : e.runId
      )
    } : a;
  })();
}
function zn(t) {
  if (t.owner === Zn) {
    const e = ye.get(t.action);
    if (!e)
      throw new Error(
        `No worker-local handler registered for action: ${t.action}`
      );
    return async (r, n) => {
      var i;
      r = he(r);
      const s = (n == null ? void 0 : n.signal) ?? (n != null && n.runId ? (i = F.get(n.runId)) == null ? void 0 : i.signal : void 0);
      try {
        return { ok: !0, value: await e(r, {
          ...n,
          action: t.action,
          signal: s
        }) };
      } catch (c) {
        const a = c instanceof Error ? c.message : String(c), h = typeof c == "object" && c !== null && "code" in c && typeof c.code == "string" ? c.code : t.errorCode;
        return { ok: !1, error: { message: a, code: h } };
      }
    };
  } else {
    const e = Yt({
      owner: t.owner,
      action: t.action,
      resolveTimeoutMs: (r) => Qt(t.action, r)
    });
    return async (r, n) => {
      var c;
      const s = he(r), i = await Xt(
        t.action,
        s,
        n == null ? void 0 : n.runId
      );
      if (!i.ok)
        return i;
      try {
        const a = await e(i.params, {
          ...n,
          signal: (n == null ? void 0 : n.signal) ?? (n != null && n.runId ? (c = F.get(n.runId)) == null ? void 0 : c.signal : void 0)
        });
        return typeof a == "object" && a !== null && "ok" in a && a.ok && Ht.has(t.action) ? {
          ok: !0,
          value: zt(
            s,
            a.value,
            n == null ? void 0 : n.runId
          )
        } : a;
      } catch (a) {
        const h = a instanceof Error ? a.message : String(a), d = typeof a == "object" && a !== null && "code" in a && typeof a.code == "string" ? a.code : t.errorCode || "E_RELAY";
        return { ok: !1, error: { message: h, code: d } };
      }
    };
  }
}
function qn(t) {
  N(
    "exists",
    X,
    (e) => t.fsExists(e)
  ), N(
    "stat",
    X,
    (e) => t.fsStat(e)
  ), N(
    "read",
    X,
    (e) => t.fsRead(e)
  ), N(
    "readText",
    X,
    (e) => t.fsReadText(e)
  ), N(
    "readBase64",
    X,
    (e) => t.fsReadBase64(e)
  ), N(
    "list",
    X,
    (e) => t.fsList(e)
  ), N(
    "mkdir",
    X,
    (e) => t.fsMkdir(e)
  ), N(
    "delete",
    X,
    (e) => t.fsDelete(e)
  ), N(
    "copy",
    xt,
    (e) => t.fsCopy(e)
  ), N(
    "move",
    xt,
    (e) => t.fsMove(e)
  ), N(
    "write",
    le,
    (e) => t.fsWrite(e)
  ), N(
    "writeText",
    le,
    (e) => t.fsWriteText(e)
  ), N(
    "writeBase64",
    le,
    async (e) => {
      const r = e;
      return Cn(r.path, r.data), t.fsWriteBase64(r);
    }
  ), N(
    "append",
    le,
    (e) => t.fsAppend(e)
  ), N(
    "appendText",
    le,
    (e) => t.fsAppendText(e)
  ), N(
    "appendBase64",
    le,
    (e) => t.fsAppendBase64(e)
  ), N(
    "readRange",
    cn,
    (e) => t.fsReadRange(e)
  ), N(
    "update",
    dn,
    (e) => t.fsUpdate(e)
  ), N(
    "hash",
    ln,
    (e) => t.fsHash(e)
  );
}
async function Hn(t, e) {
  if (at) return;
  await er(), ie = new tr(), Ye(0), dr(Ye), C.trace("initWasm_start"), qn(ie), Yr(t);
  const n = t.map((i) => ({
    entry: hr(i),
    callback: zn(i)
  }));
  try {
    rr(n);
  } catch (i) {
    const c = i instanceof Error ? i.message : String(i);
    throw new Error(`Registry registration failed: ${c}`);
  }
  const { freezeManifest: s } = await import("./extension_js.js");
  try {
    s();
  } catch (i) {
    const c = i instanceof Error ? i.message : String(i);
    throw new Error(`Manifest freeze failed: ${c}`);
  }
  if (ie.injectRegistryBindings(), e) {
    const i = JSON.stringify(e);
    await ie.runCellAsync(
      `(function(){var r=globalThis.chrome&&globalThis.chrome.runtime;if(!r){r={};if(!globalThis.chrome)globalThis.chrome={};globalThis.chrome.runtime=r;}r.id=${i};})();`,
      "",
      "inject-runtime-id"
    );
  }
  at = !0, C.trace("initWasm_done");
}
self.onmessage = async (t) => {
  const e = t.data;
  if (C.trace("onmessage", {
    type: e.type,
    id: "id" in e ? e.id : void 0
  }), e.type === "asyncRelayResult") {
    C.trace("asyncRelayResult", { id: e.id }), ct(e.id, e.result);
    return;
  }
  if (e.type === "registerWorkerPort") {
    const n = t.ports[0];
    if (!n) {
      C.error("register_worker_port_missing", { owner: e.owner });
      return;
    }
    jn(e.owner, n);
    return;
  }
  if (e.type === "init") {
    try {
      await Hn(e.manifest, e.extensionId), self.postMessage({ type: "ready" });
    } catch (n) {
      const s = n instanceof Error ? n.message : String(n);
      C.error("worker_init_failed", { error: s }), self.postMessage({
        type: "error",
        error: `WASM init failed: ${s}`
      });
    }
    return;
  }
  if (e.type === "setLogLevel") {
    Ye(e.level), cr(Ln(e.level)), C.trace("set_log_level", { level: e.level });
    return;
  }
  if (!at || !ie) {
    self.postMessage({
      type: "error",
      id: e.id,
      error: "WASM not initialized"
    });
    return;
  }
  const r = ie;
  await Mn(async () => {
    switch (e.type) {
      case "runCell": {
        const n = e.runId, s = new AbortController();
        n && F.set(n, s), Z = { id: e.id, runId: n }, C.trace("runCell_start", {
          runId: n,
          callId: e.id,
          codeLen: e.code.length
        });
        try {
          const i = await r.runCellAsync(
            e.code,
            e.stdin || "",
            n || ""
          );
          C.trace("runCell_done", {
            runId: n,
            callId: e.id,
            status: i.status
          }), self.postMessage({
            type: "result",
            id: e.id,
            data: i,
            runId: n
          });
        } catch (i) {
          const c = i instanceof Error ? i.message : String(i), a = i instanceof Error ? i.name : void 0, h = i instanceof Error ? i.stack : void 0;
          let d;
          if (h) {
            const R = h.match(/:(\d+):\d+\)?$/m);
            R && (d = parseInt(R[1], 10));
          }
          C.error("runCell_error", { runId: n, error: c, name: a, line: d });
          const m = i instanceof Error ? {
            name: a,
            message: c,
            stack: h,
            ...d !== void 0 ? { line: d } : {}
          } : { message: c };
          self.postMessage({
            type: "error",
            id: e.id,
            error: m,
            runId: n
          });
        } finally {
          (Z == null ? void 0 : Z.id) === e.id && (Z = null), n && (F.delete(n), Sn(n));
        }
        break;
      }
      case "reset": {
        r.setAborted(!0);
        for (const n of F.values())
          n.abort();
        F.clear(), St(), Nn(), ir(), At("E_RESET", "Worker reset");
        try {
          r.reset(), self.postMessage({ type: "result", id: e.id, data: { ok: !0 } });
        } catch (n) {
          const s = n instanceof Error ? n.message : String(n);
          self.postMessage({ type: "error", id: e.id, error: s });
        }
        break;
      }
      case "stop": {
        r.setAborted(!0);
        for (const n of F.values())
          n.abort();
        F.clear(), St(), At("E_STOPPED", "Worker stopped"), self.postMessage({ type: "result", id: e.id, data: { ok: !0 } });
        break;
      }
      case "setFuelLimit": {
        try {
          r.set_fuel_limit(e.limit), e.id && self.postMessage({
            type: "result",
            id: e.id,
            data: { ok: !0 }
          });
        } catch (n) {
          if (e.id) {
            const s = n instanceof Error ? n.message : String(n);
            self.postMessage({ type: "error", id: e.id, error: s });
          }
        }
        break;
      }
      case "inspectGlobals": {
        try {
          const n = r.inspect_globals();
          self.postMessage({ type: "result", id: e.id, data: n });
        } catch (n) {
          const s = n instanceof Error ? n.message : String(n);
          self.postMessage({ type: "error", id: e.id, error: s });
        }
        break;
      }
      case "apiDocs": {
        try {
          const n = r.apiDocs(e.format);
          self.postMessage({ type: "result", id: e.id, data: n });
        } catch (n) {
          const s = n instanceof Error ? n.message : String(n);
          self.postMessage({ type: "error", id: e.id, error: s });
        }
        break;
      }
      case "loadLibrary": {
        try {
          const n = r.load_library(e.source);
          self.postMessage({ type: "result", id: e.id, data: n });
        } catch (n) {
          const s = n instanceof Error ? n.message : String(n);
          self.postMessage({ type: "error", id: e.id, error: s });
        }
        break;
      }
      case "fsCall": {
        const n = ye.get(e.action);
        if (!n) {
          self.postMessage({
            type: "error",
            id: e.id,
            error: `Unknown fs action: ${e.action}`
          });
          break;
        }
        try {
          const s = await n(e.params);
          self.postMessage({ type: "result", id: e.id, data: s });
        } catch (s) {
          const i = s instanceof Error ? s.message : String(s);
          self.postMessage({ type: "error", id: e.id, error: i });
        }
        break;
      }
      default: {
        C.error("unhandled_worker_message", {
          type: e.type
        });
        break;
      }
    }
  });
};
export {
  ve as DEFAULT_RELAY_TIMEOUT_MS,
  zn as createExecutableCallback,
  Jn as extensionDispatch,
  Pn as registerWorkerHandler,
  N as registerWorkerHandlerValidated,
  jn as registerWorkerPort,
  ct as resolveAsyncRelayResult,
  Qt as resolveRelayTimeoutMs,
  Yt as safePostAsCall,
  At as settleAllPendingRelays
};
