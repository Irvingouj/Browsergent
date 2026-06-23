(() => {
	const X = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };
	let Ct = X.error;
	function br(t) {
		if (!t) return "";
		const e = [];
		for (const [r, n] of Object.entries(t)) {
			let a;
			if (n === null) a = "null";
			else if (n === void 0) a = "undefined";
			else if (typeof n == "string") a = n;
			else if (typeof n == "number" || typeof n == "boolean") a = String(n);
			else
				try {
					a = JSON.stringify(n);
				} catch {
					a = "[Circular]";
				}
			e.push(`${r}=${a}`);
		}
		return e.length > 0 ? ` ${e.join(" ")}` : "";
	}
	function Ze(t, e, r) {
		if (t < Ct) return;
		const n = br(r),
			a = `[extension-js][content-script] ${e}${n}`;
		t >= X.error
			? console.error(a)
			: t === X.warn
				? console.warn(a)
				: console.log(a);
	}
	const me = {
		debug: (t, e) => {
			Ze(X.debug, t, e);
		},
		info: (t, e) => {
			Ze(X.info, t, e);
		},
		warn: (t, e) => {
			Ze(X.warn, t, e);
		},
		error: (t, e) => {
			Ze(X.error, t, e);
		},
	};
	function gr() {
		window.__jsNotebookSetLogLevel = (t) => {
			Ct = X[t] ?? X.error;
		};
	}
	function yr(t) {
		if (t.startsWith("page_") || t.startsWith("tab_")) {
			const e = t.indexOf("_");
			if (e >= 0) return t.slice(e + 1);
		}
		return t;
	}
	const vr =
		"Content script is not connected on this tab. This tab was likely open before the extension loaded (MV3 does not retro-inject).";
	function _r(t) {
		return [
			`await page.goto(${JSON.stringify(t || "")})`,
			"Or ask the user to refresh the target tab, then retry fill/click",
		];
	}
	function Nt(t, e) {
		const r = e || "unknown url",
			n = {
				message:
					t !== void 0
						? `Content script is not connected on tab ${t} (${r}).`
						: `Content script is not connected on this tab (${r}).`,
				code: "E_CONTENT_SCRIPT",
				category: "content-script",
				hint: vr,
				recovery: _r(e),
			};
		return t !== void 0 && (n.details = { tabId: t, url: r }), n;
	}
	function wr(t, e) {
		var s, o;
		const r = t ? "refId" : e != null && e.label ? "label" : null,
			n = t || (e == null ? void 0 : e.label) || "";
		let a = `Element not found${r ? ` by ${r} "${n}"` : ""}`;
		if (e != null && e.label && (s = e.candidates) != null && s.length) {
			const l = e.candidates
				.map((d) => d.name || d.refId)
				.filter(Boolean)
				.slice(0, 5);
			l.length > 0
				? (a += `. Candidates: ${l.join(", ")}`)
				: (a += ". Candidates: none");
		}
		const i = {
			message: a,
			code: "E_STALE",
			category: "resource",
			hint: "RefIds are ephemeral. They are assigned at snapshot time and invalidated when the DOM is replaced (navigation, SPA rerender, autocomplete).",
			recovery: [
				"const d = await page.snapshot_data(); find the target in d.nodes",
				"Use a fresh refId from that snapshot only",
				"Do not reuse refIds from before press/click/navigation",
			],
			details: { staleRefId: t || void 0 },
		};
		return (
			(o = e == null ? void 0 : e.candidates) != null &&
				o.length &&
				(i.details = { ...i.details, candidates: e.candidates }),
			i
		);
	}
	function xe(t, e, r) {
		return {
			message: `${t} on ${e} returned no effect.`,
			code: "E_NOT_INTERACTABLE",
			category: "resource",
			hint: "Some sites ignore programmatic value assignment; value may not appear in snapshot_data.",
			recovery: [
				`await page.click({ refId: ${JSON.stringify(e)} }) then await page.type({ refId: ${JSON.stringify(e)}, text: "..." })`,
				'Or await page.press({ key: "Enter" }) after fill',
				"Re-snapshot and confirm URL or node state changed",
			],
			details: { refId: e, ...r },
		};
	}
	function xr(t) {
		return {
			message: `${t} requires a fresh observation before acting.`,
			code: "E_OBSERVATION_REQUIRED",
			category: "observation",
			hint: "Element refIds are only valid after a snapshot. Take a fresh observation and select a refId from its returned nodes.",
			recovery: [
				"const d = await page.snapshot_data(); find the target in d.nodes",
				"Use a refId from that snapshot only",
			],
			details: { action: t },
		};
	}
	function kr(t) {
		return (
			t.includes("Could not establish connection") ||
			t.includes("Receiving end does not exist") ||
			t.includes("Timeout waiting for content-script ping") ||
			t.includes("content script not available") ||
			t.includes("message port closed before a response was received")
		);
	}
	function N(t) {
		const e = new Error(t.message);
		throw (
			((e.code = t.code),
			t.category && (e.category = t.category),
			t.hint && (e.hint = t.hint),
			t.recovery && (e.recovery = t.recovery),
			t.details && (e.details = t.details),
			e)
		);
	}
	function st(t, e) {
		let r = `Element not found by label "${t}"`;
		if (e != null && e.length) {
			const n = e
				.map((a) => a.name || a.refId)
				.filter(Boolean)
				.slice(0, 5);
			r +=
				n.length > 0 ? `. Candidates: ${n.join(", ")}` : ". Candidates: none";
		}
		return {
			message: r,
			code: "E_NOT_FOUND",
			category: "resource",
			hint: "No element matched this label. Check candidates or snapshot for visible controls.",
			recovery: [
				"const d = await page.snapshot_data(); find the target in d.nodes",
				"Try a more specific label or use refId from snapshot",
			],
			details:
				e != null && e.length ? { label: t, candidates: e } : { label: t },
		};
	}
	function Ir(t) {
		if (!(t instanceof Error)) return {};
		const e = t.name !== "Error" ? t.name : void 0,
			r = t.stack;
		let n;
		if (r) {
			const a = r.match(/:(\d+):\d+\)?$/m);
			a && (n = parseInt(a[1], 10));
		}
		return { name: e, stack: r, line: n };
	}
	function Ot(t, e) {
		if (
			typeof t == "object" &&
			t !== null &&
			"code" in t &&
			typeof t.code == "string" &&
			"message" in t &&
			typeof t.message == "string"
		) {
			const o = t;
			return o.hint || o.recovery
				? o
				: o.code === "E_CONTENT_SCRIPT"
					? Nt(e == null ? void 0 : e.tabId, e == null ? void 0 : e.url)
					: o;
		}
		const r = (t instanceof Error ? t.message : String(t)) || "",
			{ name: n, stack: a, line: i } = Ir(t);
		if (kr(r))
			return Nt(e == null ? void 0 : e.tabId, e == null ? void 0 : e.url);
		if (r.includes("permission") || r.includes("Permission")) {
			const o = { message: r, code: "E_PERMISSION", category: "permission" };
			return (n || a || i) && (o.details = { name: n, stack: a, line: i }), o;
		}
		if (
			r.includes("not found") ||
			r.includes("No tab") ||
			r.includes("No active tab")
		) {
			const o = { message: r, code: "E_NOT_FOUND", category: "resource" };
			return (n || a || i) && (o.details = { name: n, stack: a, line: i }), o;
		}
		const s = { message: r, code: "E_EXTENSION", category: "extension" };
		return (n || a || i) && (s.details = { name: n, stack: a, line: i }), s;
	}
	const Tr = /^e\d+$/;
	let Rt = 0;
	function ot() {
		let t = 0;
		for (const e of document.querySelectorAll("[data-ref-id]")) {
			const r = e.getAttribute("data-ref-id");
			if (!r) continue;
			const n = parseInt(r.replace(/^e/, ""), 10);
			!Number.isNaN(n) && n > t && (t = n);
		}
		Rt = t;
	}
	function Ue(t) {
		const e = t.getAttribute("data-ref-id");
		if (e && Tr.test(e)) return e;
		const r = `e${++Rt}`;
		return t.setAttribute("data-ref-id", r), r;
	}
	const ct =
			'input, textarea, select, button, a, [role="button"], [role="link"]',
		Sr = new Set(["script", "style", "noscript", "template"]),
		Dt = new Set([
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
			"sup",
		]);
	function Be(t) {
		const e = {};
		return (
			t instanceof HTMLInputElement
				? (t.type !== "password" && t.type !== "hidden" && (e.value = t.value),
					(t.type === "checkbox" || t.type === "radio") &&
						(e.checked = t.checked),
					(e.disabled = t.disabled),
					(e.readOnly = t.readOnly))
				: t instanceof HTMLTextAreaElement
					? ((e.value = t.value),
						(e.disabled = t.disabled),
						(e.readOnly = t.readOnly))
					: t instanceof HTMLSelectElement &&
						((e.value = t.value), (e.disabled = t.disabled)),
			e
		);
	}
	function Er(t, e) {
		const r = t.tagName.toLowerCase();
		(r !== "input" && r !== "textarea" && r !== "select") ||
			Object.assign(e, Be(t));
	}
	const Ar = new Set(["http:", "https:", "file:"]);
	function ie(t) {
		if (t)
			try {
				const e = new URL(t, window.location.href);
				return Ar.has(e.protocol) ? e.href : void 0;
			} catch {
				return;
			}
	}
	function Mt(t) {
		const e = t.closest("article[data-post-id], [data-post-id]");
		if (e) return Ue(e);
	}
	function Cr(t) {
		const e = t.querySelector(
			":scope > h2 a[href], a[data-permalink], a[rel='permalink']",
		);
		if (e instanceof HTMLAnchorElement) return e;
		const r = t.querySelector("a[href]");
		return r instanceof HTMLAnchorElement ? r : null;
	}
	function Z(t) {
		const e = t.tagName.toLowerCase(),
			r = t.getAttribute("role");
		if (r) return r;
		if (e === "button" || (e === "input" && t.type === "submit"))
			return "button";
		if (e === "a") return "link";
		if (e === "input") {
			const n = t.type;
			if (n === "text" || n === "email" || n === "password" || n === "search")
				return "textbox";
			if (n === "checkbox") return "checkbox";
			if (n === "radio") return "radio";
			if (n === "submit" || n === "button") return "button";
		}
		return e === "textarea"
			? "textbox"
			: e === "select"
				? "combobox"
				: e === "img"
					? "img"
					: e === "h1" ||
							e === "h2" ||
							e === "h3" ||
							e === "h4" ||
							e === "h5" ||
							e === "h6"
						? "heading"
						: e === "li"
							? "listitem"
							: e === "ul" || e === "ol"
								? "list"
								: e === "table"
									? "table"
									: e === "tr"
										? "row"
										: e === "td" || e === "th"
											? "cell"
											: e === "nav"
												? "navigation"
												: e === "main"
													? "main"
													: e === "article"
														? "article"
														: e === "section"
															? "region"
															: e === "aside"
																? "complementary"
																: e === "form"
																	? "form"
																	: e === "dialog" || e === "modal"
																		? "dialog"
																		: e === "figure"
																			? "figure"
																			: e === "figcaption"
																				? "caption"
																				: t.getAttribute("onclick") || t.onclick
																					? "button"
																					: "generic";
	}
	function Nr(t) {
		var e;
		for (const r of t.childNodes)
			if (
				r.nodeType === Node.TEXT_NODE &&
				((e = r.textContent) == null ? void 0 : e.trim())
			)
				return !0;
		return !1;
	}
	function lt(t, e = 60) {
		var a, i;
		const r = [];
		for (const s of t.childNodes)
			if (s.nodeType === Node.TEXT_NODE) {
				const o = (a = s.textContent) == null ? void 0 : a.trim();
				o && r.push(o);
			}
		if (r.length > 0) return r.join(" ").slice(0, e);
		const n = (i = t.textContent) == null ? void 0 : i.trim();
		return n ? n.slice(0, e) : "";
	}
	function dt(t) {
		let e = t;
		for (; e; ) {
			if (e.hidden || e.getAttribute("aria-hidden") === "true" || e.inert)
				return !0;
			const r = window.getComputedStyle(e);
			if (r.display === "none" || r.visibility === "hidden") return !0;
			e = e.parentElement;
		}
		return !1;
	}
	function Or(t) {
		return dt(t);
	}
	function qt(t) {
		var s;
		const e = t.tagName.toLowerCase();
		if (Sr.has(e) || Or(t)) return !1;
		const r = Z(t);
		if (r === "presentation" || r === "none") return !1;
		if (r !== "generic") return !0;
		const n = t.getAttribute("aria-live");
		if (n && n !== "off") return !0;
		const a = t.getAttribute("role");
		return a === "status" || a === "alert"
			? !0
			: ((s = t.textContent) == null ? void 0 : s.trim()) || ""
				? !!(Dt.has(e) || Nr(t))
				: !1;
	}
	function se(t) {
		var s, o, l;
		const e = t.getAttribute("aria-label");
		if (e) return e;
		const r = t.getAttribute("aria-labelledby");
		if (r) {
			const d = document.getElementById(r);
			if (d)
				return ((s = d.textContent) == null ? void 0 : s.slice(0, 60)) || "";
		}
		if (t.tagName.toLowerCase() === "img") {
			const d = t.getAttribute("alt");
			if (d) return d;
		}
		const a = t.title;
		if (a) return a;
		const i = Z(t);
		if (
			i !== "generic" &&
			i !== "list" &&
			i !== "table" &&
			i !== "row" &&
			i !== "region" &&
			i !== "navigation" &&
			i !== "main"
		)
			return (
				((o = t.textContent) == null ? void 0 : o.trim().slice(0, 60)) || ""
			);
		if (i === "generic" && qt(t)) {
			const d = lt(t);
			if (d) return d;
			const h = t.tagName.toLowerCase();
			if (Dt.has(h) || t.childElementCount === 0)
				return (
					((l = t.textContent) == null ? void 0 : l.trim().slice(0, 60)) || ""
				);
		}
		return "";
	}
	function Rr(t) {
		return t instanceof HTMLInputElement && t.type === "file" ? !0 : qt(t);
	}
	function Pt(t) {
		return document.querySelector(`[data-ref-id='${CSS.escape(t)}']`);
	}
	function oe(t, e) {
		if (
			t.hasAttribute("disabled") ||
			t.getAttribute("aria-disabled") === "true"
		) {
			const r = t.getAttribute("data-ref-id") || void 0;
			N(xe(e, r ?? "", { reason: "disabled" }));
		}
		if (dt(t)) {
			const r = t.getAttribute("data-ref-id") || void 0;
			N(xe(e, r ?? "", { reason: "hidden" }));
		}
	}
	function Lt(t) {
		var n, a, i;
		const e = t.toLowerCase().trim();
		if (!e) return null;
		const r = Array.from(document.querySelectorAll(ct));
		for (const s of r) {
			const o = s.getAttribute("aria-label");
			if (o && o.toLowerCase().trim() === e) return s;
			const l = s.placeholder;
			if (l && l.toLowerCase().trim() === e) return s;
			const d = s.id;
			if (d) {
				const ne = document.querySelector(`label[for='${CSS.escape(d)}']`);
				if (
					ne &&
					((n = ne.textContent) == null ? void 0 : n.trim().toLowerCase()) === e
				)
					return s;
			}
			const h = s.closest("label");
			if (
				(h &&
					((a = h.textContent) == null ? void 0 : a.trim().toLowerCase()) ===
						e) ||
				(((i = s.textContent) == null ? void 0 : i.trim().toLowerCase()) ||
					"") === e
			)
				return s;
		}
		return null;
	}
	function Dr(t) {
		var a;
		const e = t.toLowerCase().trim();
		if (!e) return [];
		const r = Array.from(document.querySelectorAll(ct)),
			n = [];
		for (const i of r) {
			const s = i.getAttribute("aria-label"),
				o = i.placeholder,
				l = ((a = i.textContent) == null ? void 0 : a.trim()) || "";
			if (![s, o, l].filter(Boolean).some((S) => S.toLowerCase().includes(e)))
				continue;
			const h = i.getAttribute("data-ref-id");
			if (
				h &&
				(n.push({ refId: h, role: Z(i), name: se(i) || void 0 }), n.length >= 5)
			)
				break;
		}
		return n;
	}
	function be(t) {
		return typeof t == "object" && t !== null && !Array.isArray(t) ? t : {};
	}
	function Mr(t) {
		const e = document.querySelector(`[data-ref-id='${CSS.escape(t)}']`);
		let r, n;
		e && ((r = e.tagName.toLowerCase()), (n = Z(e)));
		const a = Array.from(document.querySelectorAll(ct)),
			i = [];
		for (const s of a) {
			const o = s.getAttribute("data-ref-id");
			if (o) {
				if (r || n) {
					const l = s.tagName.toLowerCase(),
						d = Z(s);
					if (l !== r && d !== n) continue;
				}
				if (
					(i.push({ refId: o, role: Z(s), name: se(s) || void 0 }),
					i.length >= 5)
				)
					break;
			}
		}
		return i;
	}
	function Ve(t, e, r = !1) {
		if (t) {
			const n = r ? Mr(t) : [];
			N(wr(t, { candidates: n }));
		}
		if (e) {
			const n = r ? Dr(e) : [];
			N(st(e, n));
		}
		N({
			message: "Element not found",
			code: "E_NOT_FOUND",
			category: "resource",
		});
	}
	function Y(t, e) {
		let r = t ? Pt(t) : null;
		return !r && e && (r = Lt(e)), r || Ve(t, e, !0), r;
	}
	const $t = 8 * 1024;
	function qr(t) {
		const e = atob(t),
			r = new Uint8Array(e.length);
		for (let n = 0; n < e.length; n++) r[n] = e.charCodeAt(n);
		return r;
	}
	function Pr(t) {
		let e = "";
		for (let r = 0; r < t.length; r += $t) {
			const n = t.subarray(r, r + $t);
			for (let a = 0; a < n.length; a++) e += String.fromCharCode(n[a]);
		}
		return btoa(e);
	}
	function Lr(t) {
		return t.toLowerCase().split(";")[0].trim();
	}
	function $r(t) {
		return t.startsWith("image/") ||
			t.startsWith("audio/") ||
			t.startsWith("video/") ||
			t === "application/octet-stream" ||
			t === "application/pdf" ||
			t === "application/zip" ||
			t === "application/gzip" ||
			t === "application/x-gzip" ||
			t === "application/x-zip-compressed"
			? !0
			: t.startsWith("application/vnd.");
	}
	function jr(t) {
		for (let e = 0; e < t.length; e++) if (t[e] === 0) return !0;
		return !1;
	}
	function jt(t) {
		return Object.fromEntries(t.headers.entries());
	}
	function Ft(t, e, r) {
		return {
			status: t.status,
			ok: t.ok,
			headers: jt(t),
			body: Pr(e),
			bodyEncoding: "base64",
			byteLength: e.length,
			contentType: r,
			finalUrl: t.url,
		};
	}
	function Zt(t, e, r) {
		return {
			status: t.status,
			ok: t.ok,
			headers: jt(t),
			body: e,
			bodyEncoding: "text",
			byteLength: new TextEncoder().encode(e).length,
			contentType: r,
			finalUrl: t.url,
		};
	}
	async function Fr(t) {
		const e = t.headers.get("content-type") || "",
			r = Lr(e);
		if ($r(r)) {
			const a = new Uint8Array(await t.arrayBuffer());
			return Ft(t, a, e);
		}
		if (!r || r.startsWith("text/")) {
			const a = new Uint8Array(await t.arrayBuffer());
			if (jr(a)) return Ft(t, a, e);
			const i = new TextDecoder().decode(a);
			return Zt(t, i, e);
		}
		const n = await t.text();
		return Zt(t, n, e);
	}
	const Zr = new Set([
			"button",
			"link",
			"textbox",
			"checkbox",
			"radio",
			"combobox",
			"searchbox",
			"switch",
			"menuitem",
			"tab",
			"treeitem",
		]),
		Ur = new Set([
			"a",
			"button",
			"input",
			"textarea",
			"select",
			"details",
			"summary",
		]);
	function We(t) {
		if (t instanceof RegExp) return (r) => t.test(r);
		if (typeof t != "string") return () => !1;
		const e = t.toLowerCase();
		return (r) => r.toLowerCase().includes(e);
	}
	function Ut(t) {
		return Array.isArray(t)
			? new Set(
					t.filter((e) => typeof e == "string").map((e) => e.toLowerCase()),
				)
			: typeof t != "string"
				? new Set()
				: new Set([t.toLowerCase()]);
	}
	function Br(t, e) {
		let r = t;
		if (e.role) {
			const n = Ut(e.role);
			r = r.filter((a) => n.has(a.role.toLowerCase()));
		}
		if (e.tag) {
			const n = Ut(e.tag);
			r = r.filter((a) => n.has(a.tag.toLowerCase()));
		}
		if (e.text) {
			const n = We(e.text);
			r = r.filter((a) => a.text !== void 0 && n(a.text));
		}
		if (e.name) {
			const n = We(e.name);
			r = r.filter((a) => a.name !== void 0 && n(a.name));
		}
		if (e.href) {
			const n = We(e.href);
			r = r.filter((a) => a.href !== void 0 && n(a.href));
		}
		if (e.src) {
			const n = We(e.src);
			r = r.filter((a) => a.src !== void 0 && n(a.src));
		}
		return (
			e.interactiveOnly &&
				(r = r.filter(
					(n) => Zr.has(n.role.toLowerCase()) || Ur.has(n.tag.toLowerCase()),
				)),
			e.limit !== void 0 && e.limit > 0 && (r = r.slice(0, e.limit)),
			r
		);
	}
	function ut(t) {
		return { tag: t.tagName.toLowerCase(), role: Z(t), name: se(t) };
	}
	function Vr(t, e) {
		return t.tag === e.tag && t.role === e.role && t.name === e.name;
	}
	let ke = !1,
		Bt = 0,
		He,
		ge = new Map();
	function Wr(t = []) {
		(Bt += 1), (He = `obs${Bt}`), (ke = !0), (ge = new Map());
		for (const e of t)
			ge.set(e.refId, { element: e.element, fingerprint: ut(e.element) });
		return He;
	}
	function ft() {
		(ke = !1), (He = void 0), (ge = new Map());
	}
	function Hr() {
		return ke;
	}
	function pt() {
		return He;
	}
	function Vt(t, e) {
		ke || Wt(e);
		const r = ge.get(t);
		r || Ke(t, "not_in_latest_observation");
		const { element: n, fingerprint: a } = r;
		if (!n.isConnected) {
			const s = Kr(r);
			if (s) return ge.set(t, { element: s, fingerprint: ut(s) }), s;
			Ke(t, "disconnected");
		}
		const i = ut(n);
		return Vr(i, a) || Ke(t, "fingerprint_changed"), n;
	}
	function Kr(t) {
		const { fingerprint: e } = t,
			r = e.role,
			n = e.name.trim().toLowerCase();
		return (
			Array.from(document.querySelectorAll("*")).find(
				(a) => Z(a) === r && se(a).toLowerCase().trim() === n,
			) ?? null
		);
	}
	function Wt(t) {
		const e = new Error(`${t} requires a fresh observation before acting.`);
		throw (
			((e.code = "E_OBSERVATION_REQUIRED"),
			(e.category = "observation"),
			(e.hint =
				"Element refIds are only valid after a snapshot. Take a fresh observation and select a refId from its returned nodes."),
			(e.recovery = [
				"const d = await page.snapshot_data(); find the target in d.nodes",
				"Use a refId from that snapshot only",
			]),
			(e.details = { action: t }),
			e)
		);
	}
	function Ke(t, e) {
		const r = new Error(`Element refId "${t}" is stale (${e}).`);
		throw (
			((r.code = "E_STALE"),
			(r.category = "observation"),
			(r.hint =
				"The element changed or was removed after the last observation."),
			(r.recovery = [
				"const d = await page.snapshot_data(); find the target in d.nodes",
				"Use a fresh refId from that snapshot only",
			]),
			(r.details = { staleRefId: t, reason: e }),
			r)
		);
	}
	function zr(t, e) {
		ke || Wt(e);
		const r = t.toLowerCase().trim(),
			n = [];
		for (const i of ge.values())
			se(i.element).toLowerCase().trim() === r && n.push(i.element);
		if (n.length === 0) throw new Error(`Element not found by label "${t}"`);
		n.length > 1 && Gr(t);
		const a = n[0];
		return (
			a.isConnected || Ke(a.getAttribute("data-ref-id") || "", "disconnected"),
			a
		);
	}
	function Gr(t) {
		const e = new Error(
			`Multiple elements match label "${t}". The target is ambiguous.`,
		);
		throw (
			((e.code = "E_AMBIGUOUS_TARGET"),
			(e.category = "observation"),
			(e.hint =
				"Use a refId from the latest snapshot_data instead of a label, or narrow the label."),
			(e.recovery = [
				"const d = await page.snapshot_data(); find the target in d.nodes",
				"Use the refId from that snapshot",
			]),
			(e.details = { label: t }),
			e)
		);
	}
	function M(t, e, r) {
		const n = (e == null ? void 0 : e.getAttribute("data-ref-id")) ?? void 0;
		return {
			ok: !0,
			action: t,
			...(n ? { refId: n } : {}),
			...(e ? Be(e) : {}),
			...r,
		};
	}
	function ht(t, e, r, n) {
		(e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) &&
			e.value !== n &&
			N(xe(t, r, { requested: n, actual: e.value }));
	}
	function mt(t) {
		ot();
		const e = [],
			r = [];
		let n = !1,
			a = !1;
		const i =
			typeof MutationObserver < "u" && document.body
				? new MutationObserver(() => {
						a = !0;
					})
				: null;
		i &&
			document.body &&
			i.observe(document.body, { childList: !0, subtree: !0 });
		try {
			const o = (l, d, h) => {
				var fr;
				if (n) return;
				if (e.length >= t) {
					n = !0;
					return;
				}
				const S = l.tagName.toLowerCase();
				if (
					S === "script" ||
					S === "style" ||
					S === "noscript" ||
					S === "template"
				)
					return;
				const ne = Rr(l);
				let ae = d,
					nt = h;
				if (ne) {
					const Fe = Ue(l),
						pr = Z(l),
						at = se(l),
						L = { refId: Fe, role: pr, tag: S };
					if (
						(at && (L.name = at), (L.text = lt(l, 100)), Er(l, L), S === "a")
					) {
						const q = ie(l.getAttribute("href"));
						q && (L.href = q);
					}
					if (S === "img") {
						const q = ie(l.getAttribute("src"));
						q && (L.src = q), (L.alt = l.getAttribute("alt") || "");
					}
					if (S === "input") {
						const q = l.getAttribute("title");
						q && (L.title = q);
						const Q = l;
						if (Q.type === "file") {
							const it = Q.getAttribute("accept");
							it && (L.accept = it),
								(L.filesCount =
									((fr = Q.files) == null ? void 0 : fr.length) ?? 0);
						}
					}
					if (S === "img" || S === "a") {
						const q = Mt(l);
						q ? (L.parentRefId = q) : h && (L.parentRefId = h);
					}
					const hr = l.getAttribute("data-post-id");
					if ((hr && (L.postId = hr), S !== "a")) {
						const q = Cr(l);
						if (q) {
							const Q = ie(q.getAttribute("href"));
							Q && (L.permalink = Q);
						}
					}
					if (S !== "img") {
						const q = l.querySelectorAll("img");
						if (q.length > 0) {
							const Q = [];
							for (const it of q) {
								const mr = ie(it.getAttribute("src"));
								mr && Q.push(mr);
							}
							Q.length > 0 && (L.imageUrls = Q);
						}
					}
					e.push(L), (nt = Fe);
					const At = [`${"  ".repeat(d)}- ${pr}`];
					at && At.push(`"${at.replace(/"/g, '\\"')}"`),
						At.push(`[${Fe}]`),
						r.push(At.join(" ")),
						(ae = d + 1);
				}
				for (const Fe of l.children) {
					if (n) break;
					o(Fe, ae, nt);
				}
			};
			document.body && o(document.body, 0);
		} finally {
			i && (i.takeRecords().length > 0 && (a = !0), i.disconnect());
		}
		return (
			a &&
				N({
					message: "DOM mutated during snapshot collection",
					code: "E_SNAPSHOT",
					category: "resource",
					details: {
						cause: "dom_mutated_during_snapshot",
						nodesCollected: e.length,
					},
					recovery: [
						"Wait for the page to finish rendering before snapshot",
						"Retry with a smaller max_nodes bound",
						"Use page.snapshot_data() after navigation settles",
					],
				}),
			{
				text: [`URL: ${window.location.href}`, `Title: ${document.title}`, ""]
					.concat(r)
					.join(`
`),
				nodes: e,
				url: window.location.href,
				title: document.title,
				viewport: { width: window.innerWidth, height: window.innerHeight },
			}
		);
	}
	const Jr = 100;
	function bt(t) {
		const e = be(t),
			n = be(e.options ?? e).max_nodes ?? e.max_nodes;
		let a = 500;
		return (
			typeof n == "number" && Number.isFinite(n)
				? (a = n)
				: typeof n == "bigint" && (a = Number(n)),
			Math.max(1, Math.min(1e4, Math.floor(a)))
		);
	}
	function Qr(t, e) {
		return e != null && e.aborted
			? Promise.reject(new DOMException("Aborted", "AbortError"))
			: new Promise((r, n) => {
					const a = setTimeout(() => {
							e == null || e.removeEventListener("abort", i), r();
						}, t),
						i = () => {
							clearTimeout(a),
								e == null || e.removeEventListener("abort", i),
								n(new DOMException("Aborted", "AbortError"));
						};
					e == null || e.addEventListener("abort", i, { once: !0 });
				});
	}
	function Xr(t) {
		const r = be(t).files;
		(!Array.isArray(r) || r.length === 0) &&
			N({
				message: "setFiles requires a non-empty files array",
				code: "E_INVALID_PARAMS",
				category: "validation",
			});
		const n = [];
		for (const a of r) {
			const i = be(a),
				s = i.kind;
			if (s === "bytes") {
				const o = typeof i.name == "string" ? i.name.trim() : "",
					l = typeof i.data == "string" ? i.data : "";
				(!o || !l) &&
					N({
						message: "Resolved bytes file requires name and data",
						code: "E_INVALID_PARAMS",
						category: "validation",
					}),
					n.push({
						kind: "bytes",
						name: o,
						data: l,
						mimeType:
							typeof i.mimeType == "string" && i.mimeType.length > 0
								? i.mimeType
								: void 0,
					});
				continue;
			}
			if (s === "url") {
				const o = typeof i.url == "string" ? i.url : "",
					l = typeof i.name == "string" ? i.name.trim() : "";
				(!o || !l) &&
					N({
						message: "Resolved url file requires url and name",
						code: "E_INVALID_PARAMS",
						category: "validation",
					}),
					n.push({
						kind: "url",
						url: o,
						name: l,
						mimeType:
							typeof i.mimeType == "string" && i.mimeType.length > 0
								? i.mimeType
								: void 0,
					});
			}
		}
		return (
			n.length !== r.length &&
				N({
					message:
						"setFiles files must be worker-resolved (kind: bytes or url)",
					code: "E_INVALID_PARAMS",
					category: "validation",
				}),
			n
		);
	}
	function Yr(t) {
		try {
			const e = qr(t.data);
			return new File([e.slice()], t.name, {
				type: t.mimeType ?? "application/octet-stream",
			});
		} catch {
			N({
				message: `Invalid base64 data for file ${t.name}`,
				code: "E_INVALID_PARAMS",
				category: "validation",
			});
		}
	}
	async function en(t) {
		try {
			const e = await fetch(t.url);
			e.ok ||
				N({
					message: `Failed to fetch file URL ${t.url}: HTTP ${e.status}`,
					code: "E_NETWORK",
					category: "network",
				});
			const r = new Uint8Array(await e.arrayBuffer()),
				n =
					t.mimeType ||
					e.headers.get("content-type") ||
					"application/octet-stream";
			return new File([r.slice()], t.name, { type: n });
		} catch (e) {
			if (
				typeof e == "object" &&
				e !== null &&
				"code" in e &&
				typeof e.code == "string"
			)
				throw e;
			const r = e instanceof Error ? e.message : String(e);
			N({
				message: `Failed to fetch file URL ${t.url}: ${r}`,
				code: "E_NETWORK",
				category: "network",
			});
		}
	}
	function tn(t, e, r) {
		var a;
		const n = Array.from(t.files ?? []).map((i) => i.name);
		((((a = t.files) == null ? void 0 : a.length) ?? 0) !== r.length ||
			!r.every((i, s) => n[s] === i)) &&
			N(xe("setFiles", e, { expectedNames: r, actualNames: n }));
	}
	function rn(t) {
		const e = be(t),
			r = e.script ?? e.code ?? e.js ?? "";
		if (typeof r != "string" || r.length === 0)
			throw new Error("evaluate requires a string argument");
		return r;
	}
	function nn(t) {
		if (t.hidden) return "hidden-attr";
		if (t.getAttribute("aria-hidden") === "true") return "aria-hidden";
		if (t.inert) return "inert";
		const e = window.getComputedStyle(t);
		if (e.display === "none") return "display-none";
		if (e.visibility === "hidden") return "visibility-hidden";
		if (e.opacity === "0") return "opacity-zero";
	}
	function Ht(t, e, r) {
		var o;
		if (!r && dt(t)) return null;
		const n = t.tagName.toLowerCase(),
			a = {
				tag: n,
				refId: Ue(t),
				role: Z(t),
				name: se(t) || void 0,
				text: lt(t, 100) || void 0,
			},
			i = {};
		for (const l of Array.from(t.attributes)) i[l.name] = l.value;
		Object.keys(i).length && (a.attributes = i);
		const s = nn(t);
		if (
			(s && ((a.hidden = !0), (a.hiddenReason = s)),
			Object.assign(a, Be(t)),
			t instanceof HTMLInputElement && t.type === "file")
		) {
			const l = t.getAttribute("accept");
			l && (a.accept = l),
				(a.filesCount = ((o = t.files) == null ? void 0 : o.length) ?? 0);
		}
		if (n === "a") {
			const l = ie(t.getAttribute("href"));
			l && (a.href = l);
		}
		if (n === "img") {
			const l = ie(t.getAttribute("src"));
			l && (a.src = l), (a.alt = t.getAttribute("alt") || void 0);
		}
		if (e > 0) {
			const l = [];
			for (const d of Array.from(t.children)) {
				const h = Ht(d, e - 1, r);
				h && l.push(h);
			}
			l.length && (a.children = l);
		}
		return a;
	}
	const an = {
		click: (t) => {
			const e = t.refId,
				r = t.label;
			let n;
			return (
				e ? (n = Vt(e, "click")) : r ? (n = zr(r, "click")) : Ve(e, r, !0),
				oe(n, "click"),
				n.click(),
				M("click", n, {
					observationId: pt(),
					dispatched: !0,
					verification: "required",
				})
			);
		},
		fill: (t) => {
			const e = t.refId,
				r = t.label,
				n = t.value;
			let a;
			if (
				(e
					? (a = Vt(e, "fill"))
					: r
						? ((a = Lt(r)), a || Ve(e, r, !0))
						: Ve(e, r, !0),
				oe(a, "fill"),
				a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)
			) {
				a.value = n;
				const i = new InputEvent("input", { bubbles: !0 });
				a.dispatchEvent(i);
				const s = e || a.getAttribute("data-ref-id") || "";
				return (
					ht("fill", a, s, n),
					M("fill", a, {
						value: a.value,
						observationId: pt(),
						dispatched: !0,
						verification: "required",
					})
				);
			}
			throw new Error("Element is not an input");
		},
		set_files: async (t) => {
			var o, l;
			const e = Xr(t),
				r = Y(t.refId, t.label);
			let n;
			if (r instanceof HTMLInputElement && r.type === "file") n = r;
			else {
				const d = r.querySelector('input[type="file"]'),
					h =
						(o = r.closest("label")) == null
							? void 0
							: o.querySelector('input[type="file"]'),
					S = r.getAttribute("for"),
					ne = S
						? (l = document.getElementById(S)) == null
							? void 0
							: l.querySelector('input[type="file"]')
						: null,
					ae = d ?? h ?? ne;
				if (!ae) {
					const nt = t.refId ?? "";
					N(xe("setFiles", nt, { reason: "not_file_input" }));
				}
				n = ae;
			}
			const a = new DataTransfer(),
				i = [];
			for (const d of e) {
				const h = d.kind === "bytes" ? Yr(d) : await en(d);
				a.items.add(h), i.push(h.name);
			}
			(n.files = a.files),
				n.dispatchEvent(new Event("change", { bubbles: !0 }));
			const s = t.refId || n.getAttribute("data-ref-id") || "";
			return (
				tn(n, s, i), M("setFiles", n, { fileCount: i.length, fileNames: i })
			);
		},
		type: (t) => {
			const e = t.refId,
				r = t.label,
				n = t.text,
				a = Y(e, r);
			if (
				(oe(a, "type"),
				a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)
			) {
				a.value = n;
				const i = new InputEvent("input", { bubbles: !0 });
				a.dispatchEvent(i);
				const s = e || a.getAttribute("data-ref-id") || "";
				return ht("type", a, s, n), M("type", a, { text: a.value });
			}
			throw new Error("Element is not an input");
		},
		append: (t) => {
			const e = t.refId,
				r = t.label,
				n = t.text,
				a = Y(e, r);
			if (
				(oe(a, "append"),
				a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)
			) {
				const s = a.value + n;
				a.value += n;
				const o = new InputEvent("input", { bubbles: !0 });
				a.dispatchEvent(o);
				const l = e || a.getAttribute("data-ref-id") || "";
				return ht("append", a, l, s), M("append", a, { text: a.value });
			}
			throw new Error("Element is not an input");
		},
		press: (t) => {
			Hr() || N(xr("press"));
			const e = t.key,
				r = new KeyboardEvent("keydown", { key: e, bubbles: !0 });
			document.dispatchEvent(r);
			const n = new KeyboardEvent("keyup", { key: e, bubbles: !0 });
			return (
				document.dispatchEvent(n),
				M("press", null, {
					key: e,
					observationId: pt(),
					dispatched: !0,
					verification: "required",
				})
			);
		},
		select: (t) => {
			const e = t.refId,
				r = t.label,
				n = t.value,
				a = Y(e, r);
			if ((oe(a, "select"), a instanceof HTMLSelectElement))
				return (
					(a.value = n),
					a.dispatchEvent(new Event("change", { bubbles: !0 })),
					M("select", a, { value: a.value })
				);
			throw new Error("Element is not a select");
		},
		select_option: (t) => {
			const e = t.value,
				r = Y(t.refId, t.label);
			if ((oe(r, "select_option"), r instanceof HTMLSelectElement)) {
				const l =
					Array.from(r.options).find((d) => (d.text || "").trim() === e) ||
					Array.from(r.options).find(
						(d) => (d.text || "").trim().toLowerCase() === e.toLowerCase(),
					);
				if (!l) {
					const d = Array.from(r.options).map((h, S) => ({
						refId: `opt${S}`,
						name: (h.text || "").trim() || void 0,
					}));
					N(st(e, d));
				}
				return (
					(r.value = l.value),
					r.dispatchEvent(new Event("change", { bubbles: !0 })),
					M("select_option", r, { value: l.value })
				);
			}
			const n = r;
			n.click();
			const a = n.getAttribute("aria-controls") || n.getAttribute("aria-owns"),
				i = a ? document.getElementById(a) : document,
				s = Array.from(
					(i || document).querySelectorAll('[role="listbox"] [role="option"]'),
				),
				o =
					s.find((l) => (l.textContent || "").trim() === e) ||
					s.find(
						(l) =>
							(l.textContent || "").trim().toLowerCase() === e.toLowerCase(),
					);
			if (!o) {
				const l = s.map((d, h) => ({
					refId: d.getAttribute("data-ref-id") || `opt${h}`,
					name: (d.textContent || "").trim() || void 0,
				}));
				N(st(e, l));
			}
			for (const l of ["mouseover", "mousedown", "mouseup"])
				o.dispatchEvent(new MouseEvent(l, { bubbles: !0, cancelable: !0 }));
			return o.click(), M("select_option", r, { value: e });
		},
		check: (t) => {
			const e = t.refId,
				r = t.label,
				n = t.checked ?? !0,
				a = Y(e, r);
			if (
				(oe(a, "check"),
				a instanceof HTMLInputElement &&
					(a.type === "checkbox" || a.type === "radio"))
			)
				return (
					(a.checked = n),
					a.dispatchEvent(new Event("change", { bubbles: !0 })),
					M("check", a, { checked: a.checked })
				);
			throw new Error("Element is not a checkbox or radio");
		},
		hover: (t) => {
			const e = t.refId,
				r = t.label,
				n = Y(e, r);
			oe(n, "hover");
			const a = new MouseEvent("mouseenter", { bubbles: !0 });
			return n.dispatchEvent(a), M("hover", n);
		},
		unhover: () => {
			const t = new MouseEvent("mouseleave", { bubbles: !0 });
			return document.body.dispatchEvent(t), M("unhover", null);
		},
		scroll: (t) => {
			ft();
			const e = t.direction,
				r = t.amount,
				n = e === "down" ? r : e === "up" ? -r : 0,
				a = e === "right" ? r : e === "left" ? -r : 0;
			return (
				window.scrollBy({ top: n, left: a, behavior: "smooth" }),
				M("scroll", null, { direction: e, amount: r })
			);
		},
		dblclick: (t) => {
			const e = t.refId,
				r = t.label,
				n = Y(e, r),
				a = n;
			return (
				a.click(),
				a.click(),
				a.dispatchEvent(
					new MouseEvent("dblclick", { bubbles: !0, cancelable: !0 }),
				),
				M("dblclick", n)
			);
		},
		forward: () => (ft(), window.history.forward(), M("forward", null)),
		scroll_to: (t) => {
			const e = t.refId,
				r = t.label,
				n = t.x ?? 0,
				a = t.y ?? 0;
			if (e || r) {
				const i = Y(e, r);
				return i.scrollIntoView({ behavior: "smooth" }), M("scroll_to", i);
			}
			return (
				window.scrollTo({ top: a, left: n, behavior: "smooth" }),
				M("scroll_to", null, { amount: a })
			);
		},
		evaluate: (t) => {
			const e = rn(t);
			return new Function(e)();
		},
		back: () => (ft(), window.history.back(), M("back", null)),
		ping: () => ({ ok: !0 }),
		snapshot: async (t) => {
			document.body ||
				N({
					message: "Document body not available for snapshot",
					code: "E_SNAPSHOT",
					category: "resource",
					details: { cause: "document.body is null" },
					recovery: [
						"Wait for the page to load fully before taking a snapshot.",
					],
				});
			const e = bt(t);
			me.debug("snapshot", { maxNodes: e, hasBody: !!document.body });
			const r = mt(e),
				n = r.nodes
					.map((i) => {
						const s = Pt(i.refId);
						return s ? { refId: i.refId, element: s } : null;
					})
					.filter((i) => i !== null),
				a = Wr(n);
			return { ...r, observationId: a };
		},
		snapshot_text: async (t) => {
			document.body ||
				N({
					message: "Document body not available for snapshot",
					code: "E_SNAPSHOT",
					category: "resource",
					details: { cause: "document.body is null" },
					recovery: [
						"Wait for the page to load fully before taking a snapshot.",
					],
				});
			const e = bt(t);
			return mt(e).text;
		},
		snapshot_query: async (t) => {
			document.body ||
				N({
					message: "Document body not available for snapshot",
					code: "E_SNAPSHOT",
					category: "resource",
					details: { cause: "document.body is null" },
					recovery: [
						"Wait for the page to load fully before taking a snapshot.",
					],
				});
			const e = bt(t),
				r = mt(e),
				n = t.filter ?? {};
			return {
				text: "",
				nodes: Br(r.nodes, n),
				url: r.url,
				title: r.title,
				viewport: r.viewport,
			};
		},
		find: (t) => {
			ot();
			const e = t.selector;
			return Array.from(document.querySelectorAll(e)).map((n) => {
				var d;
				const a = Ue(n),
					i = Z(n),
					s = se(n),
					o = {
						tag: n.tagName.toLowerCase(),
						refId: a,
						role: i,
						text:
							((d = n.textContent) == null ? void 0 : d.slice(0, 100)) || "",
						...Be(n),
					};
				s && (o.name = s);
				const l = n.tagName.toLowerCase();
				if (l === "a") {
					const h = ie(n.getAttribute("href"));
					h && (o.href = h);
				}
				if (l === "img") {
					const h = ie(n.getAttribute("src"));
					h && (o.src = h), (o.alt = n.getAttribute("alt") || "");
				}
				if (l === "input") {
					const h = n.getAttribute("title");
					h && (o.title = h);
				}
				if (l === "img" || l === "a") {
					const h = Mt(n);
					h && (o.parentRefId = h);
				}
				return o;
			});
		},
		dom: (t) => {
			ot();
			const e = t.selector,
				r = t.depth ?? 2,
				n = t.includeHidden ?? !0;
			return {
				nodes: Array.from(document.querySelectorAll(e))
					.map((s) => Ht(s, r, n))
					.filter((s) => s !== null),
				url: window.location.href,
				title: document.title,
			};
		},
		wait_for: async (t, e) => {
			const r = t.selector,
				n = Number(t.timeout),
				a = Date.now();
			for (;;) {
				if (e != null && e.aborted)
					throw new DOMException("Aborted", "AbortError");
				if (document.querySelector(r)) return !0;
				Date.now() - a >= n &&
					N({
						message: `Timeout waiting for selector: ${r}`,
						code: "E_TIMEOUT",
						category: "timeout",
					}),
					await Qr(Jr, e);
			}
		},
		extract: (t) => {
			var n, a;
			const e = t.fields,
				r = {};
			for (const i of e)
				if (i === "title") r.title = document.title;
				else if (i === "url") r.url = window.location.href;
				else if (i === "headings") {
					const s = Array.from(
						document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
					);
					r.headings = s.map((o) => {
						var l;
						return {
							tag: o.tagName,
							text:
								((l = o.textContent) == null
									? void 0
									: l.trim().slice(0, 200)) || "",
						};
					});
				} else if (i === "links") {
					const s = Array.from(document.querySelectorAll("a[href]"));
					r.links = s.map((o) => {
						var l;
						return {
							href: o.getAttribute("href"),
							text:
								((l = o.textContent) == null
									? void 0
									: l.trim().slice(0, 100)) || "",
						};
					});
				} else
					i === "text" &&
						(r.text =
							((a = (n = document.body) == null ? void 0 : n.textContent) ==
							null
								? void 0
								: a.trim().slice(0, 500)) || "");
			return r;
		},
		fetch: async (t, e) => {
			const r = t.url;
			if (!r) throw new Error("fetch requires a url");
			const n = t.method.toUpperCase(),
				a = t.headers,
				i = t.body,
				s = Number(t.timeout),
				o = new AbortController(),
				l = () => o.abort();
			if (e) {
				if (e.aborted) throw new DOMException("Aborted", "AbortError");
				e.addEventListener("abort", l, { once: !0 });
			}
			const d = setTimeout(() => o.abort(), s);
			try {
				const h = { method: n, headers: a, signal: o.signal };
				i !== null && (h.body = i);
				const S = await fetch(r, h);
				return Fr(S);
			} finally {
				clearTimeout(d), e == null || e.removeEventListener("abort", l);
			}
		},
	};
	function ze(t) {
		return t == null
			? {}
			: t instanceof Map
				? Object.fromEntries([...t.entries()].map(([e, r]) => [e, ze(r)]))
				: Array.isArray(t)
					? t.map(ze)
					: t;
	}
	var A;
	((t) => {
		t.assertEqual = (a) => {};
		function e(a) {}
		t.assertIs = e;
		function r(a) {
			throw new Error();
		}
		(t.assertNever = r),
			(t.arrayToEnum = (a) => {
				const i = {};
				for (const s of a) i[s] = s;
				return i;
			}),
			(t.getValidEnumValues = (a) => {
				const i = t.objectKeys(a).filter((o) => typeof a[a[o]] != "number"),
					s = {};
				for (const o of i) s[o] = a[o];
				return t.objectValues(s);
			}),
			(t.objectValues = (a) => t.objectKeys(a).map((i) => a[i])),
			(t.objectKeys =
				typeof Object.keys == "function"
					? (a) => Object.keys(a)
					: (a) => {
							const i = [];
							for (const s in a) Object.hasOwn(a, s) && i.push(s);
							return i;
						}),
			(t.find = (a, i) => {
				for (const s of a) if (i(s)) return s;
			}),
			(t.isInteger =
				typeof Number.isInteger == "function"
					? (a) => Number.isInteger(a)
					: (a) =>
							typeof a == "number" &&
							Number.isFinite(a) &&
							Math.floor(a) === a);
		function n(a, i = " | ") {
			return a.map((s) => (typeof s == "string" ? `'${s}'` : s)).join(i);
		}
		(t.joinValues = n),
			(t.jsonStringifyReplacer = (a, i) =>
				typeof i == "bigint" ? i.toString() : i);
	})(A || (A = {}));
	var Kt;
	((t) => {
		t.mergeShapes = (e, r) => ({ ...e, ...r });
	})(Kt || (Kt = {}));
	const b = A.arrayToEnum([
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
			"set",
		]),
		ce = (t) => {
			switch (typeof t) {
				case "undefined":
					return b.undefined;
				case "string":
					return b.string;
				case "number":
					return Number.isNaN(t) ? b.nan : b.number;
				case "boolean":
					return b.boolean;
				case "function":
					return b.function;
				case "bigint":
					return b.bigint;
				case "symbol":
					return b.symbol;
				case "object":
					return Array.isArray(t)
						? b.array
						: t === null
							? b.null
							: t.then &&
									typeof t.then == "function" &&
									t.catch &&
									typeof t.catch == "function"
								? b.promise
								: typeof Map < "u" && t instanceof Map
									? b.map
									: typeof Set < "u" && t instanceof Set
										? b.set
										: typeof Date < "u" && t instanceof Date
											? b.date
											: b.object;
				default:
					return b.unknown;
			}
		},
		f = A.arrayToEnum([
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
			"not_finite",
		]);
	class j extends Error {
		get errors() {
			return this.issues;
		}
		constructor(e) {
			super(),
				(this.issues = []),
				(this.addIssue = (n) => {
					this.issues = [...this.issues, n];
				}),
				(this.addIssues = (n = []) => {
					this.issues = [...this.issues, ...n];
				});
			const r = new.target.prototype;
			Object.setPrototypeOf
				? Object.setPrototypeOf(this, r)
				: (this.__proto__ = r),
				(this.name = "ZodError"),
				(this.issues = e);
		}
		format(e) {
			const r = e || ((i) => i.message),
				n = { _errors: [] },
				a = (i) => {
					for (const s of i.issues)
						if (s.code === "invalid_union") s.unionErrors.map(a);
						else if (s.code === "invalid_return_type") a(s.returnTypeError);
						else if (s.code === "invalid_arguments") a(s.argumentsError);
						else if (s.path.length === 0) n._errors.push(r(s));
						else {
							let o = n,
								l = 0;
							for (; l < s.path.length; ) {
								const d = s.path[l];
								l === s.path.length - 1
									? ((o[d] = o[d] || { _errors: [] }), o[d]._errors.push(r(s)))
									: (o[d] = o[d] || { _errors: [] }),
									(o = o[d]),
									l++;
							}
						}
				};
			return a(this), n;
		}
		static assert(e) {
			if (!(e instanceof j)) throw new Error(`Not a ZodError: ${e}`);
		}
		toString() {
			return this.message;
		}
		get message() {
			return JSON.stringify(this.issues, A.jsonStringifyReplacer, 2);
		}
		get isEmpty() {
			return this.issues.length === 0;
		}
		flatten(e = (r) => r.message) {
			const r = {},
				n = [];
			for (const a of this.issues)
				if (a.path.length > 0) {
					const i = a.path[0];
					(r[i] = r[i] || []), r[i].push(e(a));
				} else n.push(e(a));
			return { formErrors: n, fieldErrors: r };
		}
		get formErrors() {
			return this.flatten();
		}
	}
	j.create = (t) => new j(t);
	const Ie = (t, e) => {
		let r;
		switch (t.code) {
			case f.invalid_type:
				t.received === b.undefined
					? (r = "Required")
					: (r = `Expected ${t.expected}, received ${t.received}`);
				break;
			case f.invalid_literal:
				r = `Invalid literal value, expected ${JSON.stringify(t.expected, A.jsonStringifyReplacer)}`;
				break;
			case f.unrecognized_keys:
				r = `Unrecognized key(s) in object: ${A.joinValues(t.keys, ", ")}`;
				break;
			case f.invalid_union:
				r = "Invalid input";
				break;
			case f.invalid_union_discriminator:
				r = `Invalid discriminator value. Expected ${A.joinValues(t.options)}`;
				break;
			case f.invalid_enum_value:
				r = `Invalid enum value. Expected ${A.joinValues(t.options)}, received '${t.received}'`;
				break;
			case f.invalid_arguments:
				r = "Invalid function arguments";
				break;
			case f.invalid_return_type:
				r = "Invalid function return type";
				break;
			case f.invalid_date:
				r = "Invalid date";
				break;
			case f.invalid_string:
				typeof t.validation == "object"
					? "includes" in t.validation
						? ((r = `Invalid input: must include "${t.validation.includes}"`),
							typeof t.validation.position == "number" &&
								(r = `${r} at one or more positions greater than or equal to ${t.validation.position}`))
						: "startsWith" in t.validation
							? (r = `Invalid input: must start with "${t.validation.startsWith}"`)
							: "endsWith" in t.validation
								? (r = `Invalid input: must end with "${t.validation.endsWith}"`)
								: A.assertNever(t.validation)
					: t.validation !== "regex"
						? (r = `Invalid ${t.validation}`)
						: (r = "Invalid");
				break;
			case f.too_small:
				t.type === "array"
					? (r = `Array must contain ${t.exact ? "exactly" : t.inclusive ? "at least" : "more than"} ${t.minimum} element(s)`)
					: t.type === "string"
						? (r = `String must contain ${t.exact ? "exactly" : t.inclusive ? "at least" : "over"} ${t.minimum} character(s)`)
						: t.type === "number"
							? (r = `Number must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${t.minimum}`)
							: t.type === "bigint"
								? (r = `Number must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${t.minimum}`)
								: t.type === "date"
									? (r = `Date must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(t.minimum))}`)
									: (r = "Invalid input");
				break;
			case f.too_big:
				t.type === "array"
					? (r = `Array must contain ${t.exact ? "exactly" : t.inclusive ? "at most" : "less than"} ${t.maximum} element(s)`)
					: t.type === "string"
						? (r = `String must contain ${t.exact ? "exactly" : t.inclusive ? "at most" : "under"} ${t.maximum} character(s)`)
						: t.type === "number"
							? (r = `Number must be ${t.exact ? "exactly" : t.inclusive ? "less than or equal to" : "less than"} ${t.maximum}`)
							: t.type === "bigint"
								? (r = `BigInt must be ${t.exact ? "exactly" : t.inclusive ? "less than or equal to" : "less than"} ${t.maximum}`)
								: t.type === "date"
									? (r = `Date must be ${t.exact ? "exactly" : t.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(t.maximum))}`)
									: (r = "Invalid input");
				break;
			case f.custom:
				r = "Invalid input";
				break;
			case f.invalid_intersection_types:
				r = "Intersection results could not be merged";
				break;
			case f.not_multiple_of:
				r = `Number must be a multiple of ${t.multipleOf}`;
				break;
			case f.not_finite:
				r = "Number must be finite";
				break;
			default:
				(r = e.defaultError), A.assertNever(t);
		}
		return { message: r };
	};
	const sn = Ie;
	function gt() {
		return sn;
	}
	const yt = (t) => {
		const { data: e, path: r, errorMaps: n, issueData: a } = t,
			i = [...r, ...(a.path || [])],
			s = { ...a, path: i };
		if (a.message !== void 0) return { ...a, path: i, message: a.message };
		let o = "";
		const l = n
			.filter((d) => !!d)
			.slice()
			.reverse();
		for (const d of l) o = d(s, { data: e, defaultError: o }).message;
		return { ...a, path: i, message: o };
	};
	function m(t, e) {
		const r = gt(),
			n = yt({
				issueData: e,
				data: t.data,
				path: t.path,
				errorMaps: [
					t.common.contextualErrorMap,
					t.schemaErrorMap,
					r,
					r === Ie ? void 0 : Ie,
				].filter((a) => !!a),
			});
		t.common.issues.push(n);
	}
	class P {
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
			for (const a of r) {
				if (a.status === "aborted") return w;
				a.status === "dirty" && e.dirty(), n.push(a.value);
			}
			return { status: e.value, value: n };
		}
		static async mergeObjectAsync(e, r) {
			const n = [];
			for (const a of r) {
				const i = await a.key,
					s = await a.value;
				n.push({ key: i, value: s });
			}
			return P.mergeObjectSync(e, n);
		}
		static mergeObjectSync(e, r) {
			const n = {};
			for (const a of r) {
				const { key: i, value: s } = a;
				if (i.status === "aborted" || s.status === "aborted") return w;
				i.status === "dirty" && e.dirty(),
					s.status === "dirty" && e.dirty(),
					i.value !== "__proto__" &&
						(typeof s.value < "u" || a.alwaysSet) &&
						(n[i.value] = s.value);
			}
			return { status: e.value, value: n };
		}
	}
	const w = Object.freeze({ status: "aborted" }),
		Te = (t) => ({ status: "dirty", value: t }),
		$ = (t) => ({ status: "valid", value: t }),
		zt = (t) => t.status === "aborted",
		Gt = (t) => t.status === "dirty",
		ye = (t) => t.status === "valid",
		Ge = (t) => typeof Promise < "u" && t instanceof Promise;
	var g;
	((t) => {
		(t.errToObj = (e) => (typeof e == "string" ? { message: e } : e || {})),
			(t.toString = (e) =>
				typeof e == "string" ? e : e == null ? void 0 : e.message);
	})(g || (g = {}));
	class W {
		constructor(e, r, n, a) {
			(this._cachedPath = []),
				(this.parent = e),
				(this.data = r),
				(this._path = n),
				(this._key = a);
		}
		get path() {
			return (
				this._cachedPath.length ||
					(Array.isArray(this._key)
						? this._cachedPath.push(...this._path, ...this._key)
						: this._cachedPath.push(...this._path, this._key)),
				this._cachedPath
			);
		}
	}
	const Jt = (t, e) => {
		if (ye(e)) return { success: !0, data: e.value };
		if (!t.common.issues.length)
			throw new Error("Validation failed but no issues detected.");
		return {
			success: !1,
			get error() {
				if (this._error) return this._error;
				const r = new j(t.common.issues);
				return (this._error = r), this._error;
			},
		};
	};
	function k(t) {
		if (!t) return {};
		const {
			errorMap: e,
			invalid_type_error: r,
			required_error: n,
			description: a,
		} = t;
		if (e && (r || n))
			throw new Error(
				`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`,
			);
		return e
			? { errorMap: e, description: a }
			: {
					errorMap: (s, o) => {
						const { message: l } = t;
						return s.code === "invalid_enum_value"
							? { message: l ?? o.defaultError }
							: typeof o.data > "u"
								? { message: l ?? n ?? o.defaultError }
								: s.code !== "invalid_type"
									? { message: o.defaultError }
									: { message: l ?? r ?? o.defaultError };
					},
					description: a,
				};
	}
	class T {
		get description() {
			return this._def.description;
		}
		_getType(e) {
			return ce(e.data);
		}
		_getOrReturnCtx(e, r) {
			return (
				r || {
					common: e.parent.common,
					data: e.data,
					parsedType: ce(e.data),
					schemaErrorMap: this._def.errorMap,
					path: e.path,
					parent: e.parent,
				}
			);
		}
		_processInputParams(e) {
			return {
				status: new P(),
				ctx: {
					common: e.parent.common,
					data: e.data,
					parsedType: ce(e.data),
					schemaErrorMap: this._def.errorMap,
					path: e.path,
					parent: e.parent,
				},
			};
		}
		_parseSync(e) {
			const r = this._parse(e);
			if (Ge(r)) throw new Error("Synchronous parse encountered promise.");
			return r;
		}
		_parseAsync(e) {
			const r = this._parse(e);
			return Promise.resolve(r);
		}
		parse(e, r) {
			const n = this.safeParse(e, r);
			if (n.success) return n.data;
			throw n.error;
		}
		safeParse(e, r) {
			const n = {
					common: {
						issues: [],
						async: (r == null ? void 0 : r.async) ?? !1,
						contextualErrorMap: r == null ? void 0 : r.errorMap,
					},
					path: (r == null ? void 0 : r.path) || [],
					schemaErrorMap: this._def.errorMap,
					parent: null,
					data: e,
					parsedType: ce(e),
				},
				a = this._parseSync({ data: e, path: n.path, parent: n });
			return Jt(n, a);
		}
		"~validate"(e) {
			var n, a;
			const r = {
				common: { issues: [], async: !!this["~standard"].async },
				path: [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data: e,
				parsedType: ce(e),
			};
			if (!this["~standard"].async)
				try {
					const i = this._parseSync({ data: e, path: [], parent: r });
					return ye(i) ? { value: i.value } : { issues: r.common.issues };
				} catch (i) {
					(a =
						(n = i == null ? void 0 : i.message) == null
							? void 0
							: n.toLowerCase()) != null &&
						a.includes("encountered") &&
						(this["~standard"].async = !0),
						(r.common = { issues: [], async: !0 });
				}
			return this._parseAsync({ data: e, path: [], parent: r }).then((i) =>
				ye(i) ? { value: i.value } : { issues: r.common.issues },
			);
		}
		async parseAsync(e, r) {
			const n = await this.safeParseAsync(e, r);
			if (n.success) return n.data;
			throw n.error;
		}
		async safeParseAsync(e, r) {
			const n = {
					common: {
						issues: [],
						contextualErrorMap: r == null ? void 0 : r.errorMap,
						async: !0,
					},
					path: (r == null ? void 0 : r.path) || [],
					schemaErrorMap: this._def.errorMap,
					parent: null,
					data: e,
					parsedType: ce(e),
				},
				a = this._parse({ data: e, path: n.path, parent: n }),
				i = await (Ge(a) ? a : Promise.resolve(a));
			return Jt(n, i);
		}
		refine(e, r) {
			const n = (a) =>
				typeof r == "string" || typeof r > "u"
					? { message: r }
					: typeof r == "function"
						? r(a)
						: r;
			return this._refinement((a, i) => {
				const s = e(a),
					o = () => i.addIssue({ code: f.custom, ...n(a) });
				return typeof Promise < "u" && s instanceof Promise
					? s.then((l) => (l ? !0 : (o(), !1)))
					: s
						? !0
						: (o(), !1);
			});
		}
		refinement(e, r) {
			return this._refinement((n, a) =>
				e(n) ? !0 : (a.addIssue(typeof r == "function" ? r(n, a) : r), !1),
			);
		}
		_refinement(e) {
			return new te({
				schema: this,
				typeName: x.ZodEffects,
				effect: { type: "refinement", refinement: e },
			});
		}
		superRefine(e) {
			return this._refinement(e);
		}
		constructor(e) {
			(this.spa = this.safeParseAsync),
				(this._def = e),
				(this.parse = this.parse.bind(this)),
				(this.safeParse = this.safeParse.bind(this)),
				(this.parseAsync = this.parseAsync.bind(this)),
				(this.safeParseAsync = this.safeParseAsync.bind(this)),
				(this.spa = this.spa.bind(this)),
				(this.refine = this.refine.bind(this)),
				(this.refinement = this.refinement.bind(this)),
				(this.superRefine = this.superRefine.bind(this)),
				(this.optional = this.optional.bind(this)),
				(this.nullable = this.nullable.bind(this)),
				(this.nullish = this.nullish.bind(this)),
				(this.array = this.array.bind(this)),
				(this.promise = this.promise.bind(this)),
				(this.or = this.or.bind(this)),
				(this.and = this.and.bind(this)),
				(this.transform = this.transform.bind(this)),
				(this.brand = this.brand.bind(this)),
				(this.default = this.default.bind(this)),
				(this.catch = this.catch.bind(this)),
				(this.describe = this.describe.bind(this)),
				(this.pipe = this.pipe.bind(this)),
				(this.readonly = this.readonly.bind(this)),
				(this.isNullable = this.isNullable.bind(this)),
				(this.isOptional = this.isOptional.bind(this)),
				(this["~standard"] = {
					version: 1,
					vendor: "zod",
					validate: (r) => this["~validate"](r),
				});
		}
		optional() {
			return B.create(this, this._def);
		}
		nullable() {
			return ue.create(this, this._def);
		}
		nullish() {
			return this.nullable().optional();
		}
		array() {
			return U.create(this);
		}
		promise() {
			return we.create(this, this._def);
		}
		or(e) {
			return Ae.create([this, e], this._def);
		}
		and(e) {
			return Ce.create(this, e, this._def);
		}
		transform(e) {
			return new te({
				...k(this._def),
				schema: this,
				typeName: x.ZodEffects,
				effect: { type: "transform", transform: e },
			});
		}
		default(e) {
			const r = typeof e == "function" ? e : () => e;
			return new Me({
				...k(this._def),
				innerType: this,
				defaultValue: r,
				typeName: x.ZodDefault,
			});
		}
		brand() {
			return new St({ typeName: x.ZodBranded, type: this, ...k(this._def) });
		}
		catch(e) {
			const r = typeof e == "function" ? e : () => e;
			return new qe({
				...k(this._def),
				innerType: this,
				catchValue: r,
				typeName: x.ZodCatch,
			});
		}
		describe(e) {
			const r = this.constructor;
			return new r({ ...this._def, description: e });
		}
		pipe(e) {
			return Ye.create(this, e);
		}
		readonly() {
			return Pe.create(this);
		}
		isOptional() {
			return this.safeParse(void 0).success;
		}
		isNullable() {
			return this.safeParse(null).success;
		}
	}
	const on = /^c[^\s-]{8,}$/i,
		cn = /^[0-9a-z]+$/,
		ln = /^[0-9A-HJKMNP-TV-Z]{26}$/i,
		dn =
			/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,
		un = /^[a-z0-9_-]{21}$/i,
		fn = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
		pn =
			/^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,
		hn =
			/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i,
		mn = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
	let vt;
	const bn =
			/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
		gn =
			/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
		yn =
			/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,
		vn =
			/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
		_n = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
		wn =
			/^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
		Qt =
			"((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))",
		xn = new RegExp(`^${Qt}$`);
	function Xt(t) {
		let e = "[0-5]\\d";
		t.precision
			? (e = `${e}\\.\\d{${t.precision}}`)
			: t.precision == null && (e = `${e}(\\.\\d+)?`);
		const r = t.precision ? "+" : "?";
		return `([01]\\d|2[0-3]):[0-5]\\d(:${e})${r}`;
	}
	function kn(t) {
		return new RegExp(`^${Xt(t)}$`);
	}
	function In(t) {
		let e = `${Qt}T${Xt(t)}`;
		const r = [];
		return (
			r.push(t.local ? "Z?" : "Z"),
			t.offset && r.push("([+-]\\d{2}:?\\d{2})"),
			(e = `${e}(${r.join("|")})`),
			new RegExp(`^${e}$`)
		);
	}
	function Tn(t, e) {
		return !!(
			((e === "v4" || !e) && bn.test(t)) ||
			((e === "v6" || !e) && yn.test(t))
		);
	}
	function Sn(t, e) {
		if (!fn.test(t)) return !1;
		try {
			const [r] = t.split(".");
			if (!r) return !1;
			const n = r
					.replace(/-/g, "+")
					.replace(/_/g, "/")
					.padEnd(r.length + ((4 - (r.length % 4)) % 4), "="),
				a = JSON.parse(atob(n));
			return !(
				typeof a != "object" ||
				a === null ||
				("typ" in a && (a == null ? void 0 : a.typ) !== "JWT") ||
				!a.alg ||
				(e && a.alg !== e)
			);
		} catch {
			return !1;
		}
	}
	function En(t, e) {
		return !!(
			((e === "v4" || !e) && gn.test(t)) ||
			((e === "v6" || !e) && vn.test(t))
		);
	}
	class H extends T {
		_parse(e) {
			if (
				(this._def.coerce && (e.data = String(e.data)),
				this._getType(e) !== b.string)
			) {
				const i = this._getOrReturnCtx(e);
				return (
					m(i, {
						code: f.invalid_type,
						expected: b.string,
						received: i.parsedType,
					}),
					w
				);
			}
			const n = new P();
			let a;
			for (const i of this._def.checks)
				if (i.kind === "min")
					e.data.length < i.value &&
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							code: f.too_small,
							minimum: i.value,
							type: "string",
							inclusive: !0,
							exact: !1,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "max")
					e.data.length > i.value &&
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							code: f.too_big,
							maximum: i.value,
							type: "string",
							inclusive: !0,
							exact: !1,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "length") {
					const s = e.data.length > i.value,
						o = e.data.length < i.value;
					(s || o) &&
						((a = this._getOrReturnCtx(e, a)),
						s
							? m(a, {
									code: f.too_big,
									maximum: i.value,
									type: "string",
									inclusive: !0,
									exact: !0,
									message: i.message,
								})
							: o &&
								m(a, {
									code: f.too_small,
									minimum: i.value,
									type: "string",
									inclusive: !0,
									exact: !0,
									message: i.message,
								}),
						n.dirty());
				} else if (i.kind === "email")
					hn.test(e.data) ||
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							validation: "email",
							code: f.invalid_string,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "emoji")
					vt || (vt = new RegExp(mn, "u")),
						vt.test(e.data) ||
							((a = this._getOrReturnCtx(e, a)),
							m(a, {
								validation: "emoji",
								code: f.invalid_string,
								message: i.message,
							}),
							n.dirty());
				else if (i.kind === "uuid")
					dn.test(e.data) ||
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							validation: "uuid",
							code: f.invalid_string,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "nanoid")
					un.test(e.data) ||
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							validation: "nanoid",
							code: f.invalid_string,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "cuid")
					on.test(e.data) ||
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							validation: "cuid",
							code: f.invalid_string,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "cuid2")
					cn.test(e.data) ||
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							validation: "cuid2",
							code: f.invalid_string,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "ulid")
					ln.test(e.data) ||
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							validation: "ulid",
							code: f.invalid_string,
							message: i.message,
						}),
						n.dirty());
				else if (i.kind === "url")
					try {
						new URL(e.data);
					} catch {
						(a = this._getOrReturnCtx(e, a)),
							m(a, {
								validation: "url",
								code: f.invalid_string,
								message: i.message,
							}),
							n.dirty();
					}
				else
					i.kind === "regex"
						? ((i.regex.lastIndex = 0),
							i.regex.test(e.data) ||
								((a = this._getOrReturnCtx(e, a)),
								m(a, {
									validation: "regex",
									code: f.invalid_string,
									message: i.message,
								}),
								n.dirty()))
						: i.kind === "trim"
							? (e.data = e.data.trim())
							: i.kind === "includes"
								? e.data.includes(i.value, i.position) ||
									((a = this._getOrReturnCtx(e, a)),
									m(a, {
										code: f.invalid_string,
										validation: { includes: i.value, position: i.position },
										message: i.message,
									}),
									n.dirty())
								: i.kind === "toLowerCase"
									? (e.data = e.data.toLowerCase())
									: i.kind === "toUpperCase"
										? (e.data = e.data.toUpperCase())
										: i.kind === "startsWith"
											? e.data.startsWith(i.value) ||
												((a = this._getOrReturnCtx(e, a)),
												m(a, {
													code: f.invalid_string,
													validation: { startsWith: i.value },
													message: i.message,
												}),
												n.dirty())
											: i.kind === "endsWith"
												? e.data.endsWith(i.value) ||
													((a = this._getOrReturnCtx(e, a)),
													m(a, {
														code: f.invalid_string,
														validation: { endsWith: i.value },
														message: i.message,
													}),
													n.dirty())
												: i.kind === "datetime"
													? In(i).test(e.data) ||
														((a = this._getOrReturnCtx(e, a)),
														m(a, {
															code: f.invalid_string,
															validation: "datetime",
															message: i.message,
														}),
														n.dirty())
													: i.kind === "date"
														? xn.test(e.data) ||
															((a = this._getOrReturnCtx(e, a)),
															m(a, {
																code: f.invalid_string,
																validation: "date",
																message: i.message,
															}),
															n.dirty())
														: i.kind === "time"
															? kn(i).test(e.data) ||
																((a = this._getOrReturnCtx(e, a)),
																m(a, {
																	code: f.invalid_string,
																	validation: "time",
																	message: i.message,
																}),
																n.dirty())
															: i.kind === "duration"
																? pn.test(e.data) ||
																	((a = this._getOrReturnCtx(e, a)),
																	m(a, {
																		validation: "duration",
																		code: f.invalid_string,
																		message: i.message,
																	}),
																	n.dirty())
																: i.kind === "ip"
																	? Tn(e.data, i.version) ||
																		((a = this._getOrReturnCtx(e, a)),
																		m(a, {
																			validation: "ip",
																			code: f.invalid_string,
																			message: i.message,
																		}),
																		n.dirty())
																	: i.kind === "jwt"
																		? Sn(e.data, i.alg) ||
																			((a = this._getOrReturnCtx(e, a)),
																			m(a, {
																				validation: "jwt",
																				code: f.invalid_string,
																				message: i.message,
																			}),
																			n.dirty())
																		: i.kind === "cidr"
																			? En(e.data, i.version) ||
																				((a = this._getOrReturnCtx(e, a)),
																				m(a, {
																					validation: "cidr",
																					code: f.invalid_string,
																					message: i.message,
																				}),
																				n.dirty())
																			: i.kind === "base64"
																				? _n.test(e.data) ||
																					((a = this._getOrReturnCtx(e, a)),
																					m(a, {
																						validation: "base64",
																						code: f.invalid_string,
																						message: i.message,
																					}),
																					n.dirty())
																				: i.kind === "base64url"
																					? wn.test(e.data) ||
																						((a = this._getOrReturnCtx(e, a)),
																						m(a, {
																							validation: "base64url",
																							code: f.invalid_string,
																							message: i.message,
																						}),
																						n.dirty())
																					: A.assertNever(i);
			return { status: n.value, value: e.data };
		}
		_regex(e, r, n) {
			return this.refinement((a) => e.test(a), {
				validation: r,
				code: f.invalid_string,
				...g.errToObj(n),
			});
		}
		_addCheck(e) {
			return new H({ ...this._def, checks: [...this._def.checks, e] });
		}
		email(e) {
			return this._addCheck({ kind: "email", ...g.errToObj(e) });
		}
		url(e) {
			return this._addCheck({ kind: "url", ...g.errToObj(e) });
		}
		emoji(e) {
			return this._addCheck({ kind: "emoji", ...g.errToObj(e) });
		}
		uuid(e) {
			return this._addCheck({ kind: "uuid", ...g.errToObj(e) });
		}
		nanoid(e) {
			return this._addCheck({ kind: "nanoid", ...g.errToObj(e) });
		}
		cuid(e) {
			return this._addCheck({ kind: "cuid", ...g.errToObj(e) });
		}
		cuid2(e) {
			return this._addCheck({ kind: "cuid2", ...g.errToObj(e) });
		}
		ulid(e) {
			return this._addCheck({ kind: "ulid", ...g.errToObj(e) });
		}
		base64(e) {
			return this._addCheck({ kind: "base64", ...g.errToObj(e) });
		}
		base64url(e) {
			return this._addCheck({ kind: "base64url", ...g.errToObj(e) });
		}
		jwt(e) {
			return this._addCheck({ kind: "jwt", ...g.errToObj(e) });
		}
		ip(e) {
			return this._addCheck({ kind: "ip", ...g.errToObj(e) });
		}
		cidr(e) {
			return this._addCheck({ kind: "cidr", ...g.errToObj(e) });
		}
		datetime(e) {
			return typeof e == "string"
				? this._addCheck({
						kind: "datetime",
						precision: null,
						offset: !1,
						local: !1,
						message: e,
					})
				: this._addCheck({
						kind: "datetime",
						precision:
							typeof (e == null ? void 0 : e.precision) > "u"
								? null
								: e == null
									? void 0
									: e.precision,
						offset: (e == null ? void 0 : e.offset) ?? !1,
						local: (e == null ? void 0 : e.local) ?? !1,
						...g.errToObj(e == null ? void 0 : e.message),
					});
		}
		date(e) {
			return this._addCheck({ kind: "date", message: e });
		}
		time(e) {
			return typeof e == "string"
				? this._addCheck({ kind: "time", precision: null, message: e })
				: this._addCheck({
						kind: "time",
						precision:
							typeof (e == null ? void 0 : e.precision) > "u"
								? null
								: e == null
									? void 0
									: e.precision,
						...g.errToObj(e == null ? void 0 : e.message),
					});
		}
		duration(e) {
			return this._addCheck({ kind: "duration", ...g.errToObj(e) });
		}
		regex(e, r) {
			return this._addCheck({ kind: "regex", regex: e, ...g.errToObj(r) });
		}
		includes(e, r) {
			return this._addCheck({
				kind: "includes",
				value: e,
				position: r == null ? void 0 : r.position,
				...g.errToObj(r == null ? void 0 : r.message),
			});
		}
		startsWith(e, r) {
			return this._addCheck({ kind: "startsWith", value: e, ...g.errToObj(r) });
		}
		endsWith(e, r) {
			return this._addCheck({ kind: "endsWith", value: e, ...g.errToObj(r) });
		}
		min(e, r) {
			return this._addCheck({ kind: "min", value: e, ...g.errToObj(r) });
		}
		max(e, r) {
			return this._addCheck({ kind: "max", value: e, ...g.errToObj(r) });
		}
		length(e, r) {
			return this._addCheck({ kind: "length", value: e, ...g.errToObj(r) });
		}
		nonempty(e) {
			return this.min(1, g.errToObj(e));
		}
		trim() {
			return new H({
				...this._def,
				checks: [...this._def.checks, { kind: "trim" }],
			});
		}
		toLowerCase() {
			return new H({
				...this._def,
				checks: [...this._def.checks, { kind: "toLowerCase" }],
			});
		}
		toUpperCase() {
			return new H({
				...this._def,
				checks: [...this._def.checks, { kind: "toUpperCase" }],
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
	H.create = (t) =>
		new H({
			checks: [],
			typeName: x.ZodString,
			coerce: (t == null ? void 0 : t.coerce) ?? !1,
			...k(t),
		});
	function An(t, e) {
		const r = (t.toString().split(".")[1] || "").length,
			n = (e.toString().split(".")[1] || "").length,
			a = r > n ? r : n,
			i = Number.parseInt(t.toFixed(a).replace(".", "")),
			s = Number.parseInt(e.toFixed(a).replace(".", ""));
		return (i % s) / 10 ** a;
	}
	class fe extends T {
		constructor() {
			super(...arguments),
				(this.min = this.gte),
				(this.max = this.lte),
				(this.step = this.multipleOf);
		}
		_parse(e) {
			if (
				(this._def.coerce && (e.data = Number(e.data)),
				this._getType(e) !== b.number)
			) {
				const i = this._getOrReturnCtx(e);
				return (
					m(i, {
						code: f.invalid_type,
						expected: b.number,
						received: i.parsedType,
					}),
					w
				);
			}
			let n;
			const a = new P();
			for (const i of this._def.checks)
				i.kind === "int"
					? A.isInteger(e.data) ||
						((n = this._getOrReturnCtx(e, n)),
						m(n, {
							code: f.invalid_type,
							expected: "integer",
							received: "float",
							message: i.message,
						}),
						a.dirty())
					: i.kind === "min"
						? (i.inclusive ? e.data < i.value : e.data <= i.value) &&
							((n = this._getOrReturnCtx(e, n)),
							m(n, {
								code: f.too_small,
								minimum: i.value,
								type: "number",
								inclusive: i.inclusive,
								exact: !1,
								message: i.message,
							}),
							a.dirty())
						: i.kind === "max"
							? (i.inclusive ? e.data > i.value : e.data >= i.value) &&
								((n = this._getOrReturnCtx(e, n)),
								m(n, {
									code: f.too_big,
									maximum: i.value,
									type: "number",
									inclusive: i.inclusive,
									exact: !1,
									message: i.message,
								}),
								a.dirty())
							: i.kind === "multipleOf"
								? An(e.data, i.value) !== 0 &&
									((n = this._getOrReturnCtx(e, n)),
									m(n, {
										code: f.not_multiple_of,
										multipleOf: i.value,
										message: i.message,
									}),
									a.dirty())
								: i.kind === "finite"
									? Number.isFinite(e.data) ||
										((n = this._getOrReturnCtx(e, n)),
										m(n, { code: f.not_finite, message: i.message }),
										a.dirty())
									: A.assertNever(i);
			return { status: a.value, value: e.data };
		}
		gte(e, r) {
			return this.setLimit("min", e, !0, g.toString(r));
		}
		gt(e, r) {
			return this.setLimit("min", e, !1, g.toString(r));
		}
		lte(e, r) {
			return this.setLimit("max", e, !0, g.toString(r));
		}
		lt(e, r) {
			return this.setLimit("max", e, !1, g.toString(r));
		}
		setLimit(e, r, n, a) {
			return new fe({
				...this._def,
				checks: [
					...this._def.checks,
					{ kind: e, value: r, inclusive: n, message: g.toString(a) },
				],
			});
		}
		_addCheck(e) {
			return new fe({ ...this._def, checks: [...this._def.checks, e] });
		}
		int(e) {
			return this._addCheck({ kind: "int", message: g.toString(e) });
		}
		positive(e) {
			return this._addCheck({
				kind: "min",
				value: 0,
				inclusive: !1,
				message: g.toString(e),
			});
		}
		negative(e) {
			return this._addCheck({
				kind: "max",
				value: 0,
				inclusive: !1,
				message: g.toString(e),
			});
		}
		nonpositive(e) {
			return this._addCheck({
				kind: "max",
				value: 0,
				inclusive: !0,
				message: g.toString(e),
			});
		}
		nonnegative(e) {
			return this._addCheck({
				kind: "min",
				value: 0,
				inclusive: !0,
				message: g.toString(e),
			});
		}
		multipleOf(e, r) {
			return this._addCheck({
				kind: "multipleOf",
				value: e,
				message: g.toString(r),
			});
		}
		finite(e) {
			return this._addCheck({ kind: "finite", message: g.toString(e) });
		}
		safe(e) {
			return this._addCheck({
				kind: "min",
				inclusive: !0,
				value: Number.MIN_SAFE_INTEGER,
				message: g.toString(e),
			})._addCheck({
				kind: "max",
				inclusive: !0,
				value: Number.MAX_SAFE_INTEGER,
				message: g.toString(e),
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
			return !!this._def.checks.find(
				(e) =>
					e.kind === "int" || (e.kind === "multipleOf" && A.isInteger(e.value)),
			);
		}
		get isFinite() {
			let e = null,
				r = null;
			for (const n of this._def.checks) {
				if (n.kind === "finite" || n.kind === "int" || n.kind === "multipleOf")
					return !0;
				n.kind === "min"
					? (r === null || n.value > r) && (r = n.value)
					: n.kind === "max" && (e === null || n.value < e) && (e = n.value);
			}
			return Number.isFinite(r) && Number.isFinite(e);
		}
	}
	fe.create = (t) =>
		new fe({
			checks: [],
			typeName: x.ZodNumber,
			coerce: (t == null ? void 0 : t.coerce) || !1,
			...k(t),
		});
	class pe extends T {
		constructor() {
			super(...arguments), (this.min = this.gte), (this.max = this.lte);
		}
		_parse(e) {
			if (this._def.coerce)
				try {
					e.data = BigInt(e.data);
				} catch {
					return this._getInvalidInput(e);
				}
			if (this._getType(e) !== b.bigint) return this._getInvalidInput(e);
			let n;
			const a = new P();
			for (const i of this._def.checks)
				i.kind === "min"
					? (i.inclusive ? e.data < i.value : e.data <= i.value) &&
						((n = this._getOrReturnCtx(e, n)),
						m(n, {
							code: f.too_small,
							type: "bigint",
							minimum: i.value,
							inclusive: i.inclusive,
							message: i.message,
						}),
						a.dirty())
					: i.kind === "max"
						? (i.inclusive ? e.data > i.value : e.data >= i.value) &&
							((n = this._getOrReturnCtx(e, n)),
							m(n, {
								code: f.too_big,
								type: "bigint",
								maximum: i.value,
								inclusive: i.inclusive,
								message: i.message,
							}),
							a.dirty())
						: i.kind === "multipleOf"
							? e.data % i.value !== BigInt(0) &&
								((n = this._getOrReturnCtx(e, n)),
								m(n, {
									code: f.not_multiple_of,
									multipleOf: i.value,
									message: i.message,
								}),
								a.dirty())
							: A.assertNever(i);
			return { status: a.value, value: e.data };
		}
		_getInvalidInput(e) {
			const r = this._getOrReturnCtx(e);
			return (
				m(r, {
					code: f.invalid_type,
					expected: b.bigint,
					received: r.parsedType,
				}),
				w
			);
		}
		gte(e, r) {
			return this.setLimit("min", e, !0, g.toString(r));
		}
		gt(e, r) {
			return this.setLimit("min", e, !1, g.toString(r));
		}
		lte(e, r) {
			return this.setLimit("max", e, !0, g.toString(r));
		}
		lt(e, r) {
			return this.setLimit("max", e, !1, g.toString(r));
		}
		setLimit(e, r, n, a) {
			return new pe({
				...this._def,
				checks: [
					...this._def.checks,
					{ kind: e, value: r, inclusive: n, message: g.toString(a) },
				],
			});
		}
		_addCheck(e) {
			return new pe({ ...this._def, checks: [...this._def.checks, e] });
		}
		positive(e) {
			return this._addCheck({
				kind: "min",
				value: BigInt(0),
				inclusive: !1,
				message: g.toString(e),
			});
		}
		negative(e) {
			return this._addCheck({
				kind: "max",
				value: BigInt(0),
				inclusive: !1,
				message: g.toString(e),
			});
		}
		nonpositive(e) {
			return this._addCheck({
				kind: "max",
				value: BigInt(0),
				inclusive: !0,
				message: g.toString(e),
			});
		}
		nonnegative(e) {
			return this._addCheck({
				kind: "min",
				value: BigInt(0),
				inclusive: !0,
				message: g.toString(e),
			});
		}
		multipleOf(e, r) {
			return this._addCheck({
				kind: "multipleOf",
				value: e,
				message: g.toString(r),
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
	pe.create = (t) =>
		new pe({
			checks: [],
			typeName: x.ZodBigInt,
			coerce: (t == null ? void 0 : t.coerce) ?? !1,
			...k(t),
		});
	class Je extends T {
		_parse(e) {
			if (
				(this._def.coerce && (e.data = !!e.data),
				this._getType(e) !== b.boolean)
			) {
				const n = this._getOrReturnCtx(e);
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.boolean,
						received: n.parsedType,
					}),
					w
				);
			}
			return $(e.data);
		}
	}
	Je.create = (t) =>
		new Je({
			typeName: x.ZodBoolean,
			coerce: (t == null ? void 0 : t.coerce) || !1,
			...k(t),
		});
	class Se extends T {
		_parse(e) {
			if (
				(this._def.coerce && (e.data = new Date(e.data)),
				this._getType(e) !== b.date)
			) {
				const i = this._getOrReturnCtx(e);
				return (
					m(i, {
						code: f.invalid_type,
						expected: b.date,
						received: i.parsedType,
					}),
					w
				);
			}
			if (Number.isNaN(e.data.getTime())) {
				const i = this._getOrReturnCtx(e);
				return m(i, { code: f.invalid_date }), w;
			}
			const n = new P();
			let a;
			for (const i of this._def.checks)
				i.kind === "min"
					? e.data.getTime() < i.value &&
						((a = this._getOrReturnCtx(e, a)),
						m(a, {
							code: f.too_small,
							message: i.message,
							inclusive: !0,
							exact: !1,
							minimum: i.value,
							type: "date",
						}),
						n.dirty())
					: i.kind === "max"
						? e.data.getTime() > i.value &&
							((a = this._getOrReturnCtx(e, a)),
							m(a, {
								code: f.too_big,
								message: i.message,
								inclusive: !0,
								exact: !1,
								maximum: i.value,
								type: "date",
							}),
							n.dirty())
						: A.assertNever(i);
			return { status: n.value, value: new Date(e.data.getTime()) };
		}
		_addCheck(e) {
			return new Se({ ...this._def, checks: [...this._def.checks, e] });
		}
		min(e, r) {
			return this._addCheck({
				kind: "min",
				value: e.getTime(),
				message: g.toString(r),
			});
		}
		max(e, r) {
			return this._addCheck({
				kind: "max",
				value: e.getTime(),
				message: g.toString(r),
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
	Se.create = (t) =>
		new Se({
			checks: [],
			coerce: (t == null ? void 0 : t.coerce) || !1,
			typeName: x.ZodDate,
			...k(t),
		});
	class Yt extends T {
		_parse(e) {
			if (this._getType(e) !== b.symbol) {
				const n = this._getOrReturnCtx(e);
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.symbol,
						received: n.parsedType,
					}),
					w
				);
			}
			return $(e.data);
		}
	}
	Yt.create = (t) => new Yt({ typeName: x.ZodSymbol, ...k(t) });
	class Qe extends T {
		_parse(e) {
			if (this._getType(e) !== b.undefined) {
				const n = this._getOrReturnCtx(e);
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.undefined,
						received: n.parsedType,
					}),
					w
				);
			}
			return $(e.data);
		}
	}
	Qe.create = (t) => new Qe({ typeName: x.ZodUndefined, ...k(t) });
	class Ee extends T {
		_parse(e) {
			if (this._getType(e) !== b.null) {
				const n = this._getOrReturnCtx(e);
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.null,
						received: n.parsedType,
					}),
					w
				);
			}
			return $(e.data);
		}
	}
	Ee.create = (t) => new Ee({ typeName: x.ZodNull, ...k(t) });
	class _t extends T {
		constructor() {
			super(...arguments), (this._any = !0);
		}
		_parse(e) {
			return $(e.data);
		}
	}
	_t.create = (t) => new _t({ typeName: x.ZodAny, ...k(t) });
	class he extends T {
		constructor() {
			super(...arguments), (this._unknown = !0);
		}
		_parse(e) {
			return $(e.data);
		}
	}
	he.create = (t) => new he({ typeName: x.ZodUnknown, ...k(t) });
	class le extends T {
		_parse(e) {
			const r = this._getOrReturnCtx(e);
			return (
				m(r, {
					code: f.invalid_type,
					expected: b.never,
					received: r.parsedType,
				}),
				w
			);
		}
	}
	le.create = (t) => new le({ typeName: x.ZodNever, ...k(t) });
	class wt extends T {
		_parse(e) {
			if (this._getType(e) !== b.undefined) {
				const n = this._getOrReturnCtx(e);
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.void,
						received: n.parsedType,
					}),
					w
				);
			}
			return $(e.data);
		}
	}
	wt.create = (t) => new wt({ typeName: x.ZodVoid, ...k(t) });
	class U extends T {
		_parse(e) {
			const { ctx: r, status: n } = this._processInputParams(e),
				a = this._def;
			if (r.parsedType !== b.array)
				return (
					m(r, {
						code: f.invalid_type,
						expected: b.array,
						received: r.parsedType,
					}),
					w
				);
			if (a.exactLength !== null) {
				const s = r.data.length > a.exactLength.value,
					o = r.data.length < a.exactLength.value;
				(s || o) &&
					(m(r, {
						code: s ? f.too_big : f.too_small,
						minimum: o ? a.exactLength.value : void 0,
						maximum: s ? a.exactLength.value : void 0,
						type: "array",
						inclusive: !0,
						exact: !0,
						message: a.exactLength.message,
					}),
					n.dirty());
			}
			if (
				(a.minLength !== null &&
					r.data.length < a.minLength.value &&
					(m(r, {
						code: f.too_small,
						minimum: a.minLength.value,
						type: "array",
						inclusive: !0,
						exact: !1,
						message: a.minLength.message,
					}),
					n.dirty()),
				a.maxLength !== null &&
					r.data.length > a.maxLength.value &&
					(m(r, {
						code: f.too_big,
						maximum: a.maxLength.value,
						type: "array",
						inclusive: !0,
						exact: !1,
						message: a.maxLength.message,
					}),
					n.dirty()),
				r.common.async)
			)
				return Promise.all(
					[...r.data].map((s, o) => a.type._parseAsync(new W(r, s, r.path, o))),
				).then((s) => P.mergeArray(n, s));
			const i = [...r.data].map((s, o) =>
				a.type._parseSync(new W(r, s, r.path, o)),
			);
			return P.mergeArray(n, i);
		}
		get element() {
			return this._def.type;
		}
		min(e, r) {
			return new U({
				...this._def,
				minLength: { value: e, message: g.toString(r) },
			});
		}
		max(e, r) {
			return new U({
				...this._def,
				maxLength: { value: e, message: g.toString(r) },
			});
		}
		length(e, r) {
			return new U({
				...this._def,
				exactLength: { value: e, message: g.toString(r) },
			});
		}
		nonempty(e) {
			return this.min(1, e);
		}
	}
	U.create = (t, e) =>
		new U({
			type: t,
			minLength: null,
			maxLength: null,
			exactLength: null,
			typeName: x.ZodArray,
			...k(e),
		});
	function ve(t) {
		if (t instanceof O) {
			const e = {};
			for (const r in t.shape) {
				const n = t.shape[r];
				e[r] = B.create(ve(n));
			}
			return new O({ ...t._def, shape: () => e });
		} else
			return t instanceof U
				? new U({ ...t._def, type: ve(t.element) })
				: t instanceof B
					? B.create(ve(t.unwrap()))
					: t instanceof ue
						? ue.create(ve(t.unwrap()))
						: t instanceof K
							? K.create(t.items.map((e) => ve(e)))
							: t;
	}
	class O extends T {
		constructor() {
			super(...arguments),
				(this._cached = null),
				(this.nonstrict = this.passthrough),
				(this.augment = this.extend);
		}
		_getCached() {
			if (this._cached !== null) return this._cached;
			const e = this._def.shape(),
				r = A.objectKeys(e);
			return (this._cached = { shape: e, keys: r }), this._cached;
		}
		_parse(e) {
			if (this._getType(e) !== b.object) {
				const d = this._getOrReturnCtx(e);
				return (
					m(d, {
						code: f.invalid_type,
						expected: b.object,
						received: d.parsedType,
					}),
					w
				);
			}
			const { status: n, ctx: a } = this._processInputParams(e),
				{ shape: i, keys: s } = this._getCached(),
				o = [];
			if (
				!(this._def.catchall instanceof le && this._def.unknownKeys === "strip")
			)
				for (const d in a.data) s.includes(d) || o.push(d);
			const l = [];
			for (const d of s) {
				const h = i[d],
					S = a.data[d];
				l.push({
					key: { status: "valid", value: d },
					value: h._parse(new W(a, S, a.path, d)),
					alwaysSet: d in a.data,
				});
			}
			if (this._def.catchall instanceof le) {
				const d = this._def.unknownKeys;
				if (d === "passthrough")
					for (const h of o)
						l.push({
							key: { status: "valid", value: h },
							value: { status: "valid", value: a.data[h] },
						});
				else if (d === "strict")
					o.length > 0 &&
						(m(a, { code: f.unrecognized_keys, keys: o }), n.dirty());
				else if (d !== "strip")
					throw new Error(
						"Internal ZodObject error: invalid unknownKeys value.",
					);
			} else {
				const d = this._def.catchall;
				for (const h of o) {
					const S = a.data[h];
					l.push({
						key: { status: "valid", value: h },
						value: d._parse(new W(a, S, a.path, h)),
						alwaysSet: h in a.data,
					});
				}
			}
			return a.common.async
				? Promise.resolve()
						.then(async () => {
							const d = [];
							for (const h of l) {
								const S = await h.key,
									ne = await h.value;
								d.push({ key: S, value: ne, alwaysSet: h.alwaysSet });
							}
							return d;
						})
						.then((d) => P.mergeObjectSync(n, d))
				: P.mergeObjectSync(n, l);
		}
		get shape() {
			return this._def.shape();
		}
		strict(e) {
			return (
				g.errToObj,
				new O({
					...this._def,
					unknownKeys: "strict",
					...(e !== void 0
						? {
								errorMap: (r, n) => {
									var i, s;
									const a =
										((s = (i = this._def).errorMap) == null
											? void 0
											: s.call(i, r, n).message) ?? n.defaultError;
									return r.code === "unrecognized_keys"
										? { message: g.errToObj(e).message ?? a }
										: { message: a };
								},
							}
						: {}),
				})
			);
		}
		strip() {
			return new O({ ...this._def, unknownKeys: "strip" });
		}
		passthrough() {
			return new O({ ...this._def, unknownKeys: "passthrough" });
		}
		extend(e) {
			return new O({
				...this._def,
				shape: () => ({ ...this._def.shape(), ...e }),
			});
		}
		merge(e) {
			return new O({
				unknownKeys: e._def.unknownKeys,
				catchall: e._def.catchall,
				shape: () => ({ ...this._def.shape(), ...e._def.shape() }),
				typeName: x.ZodObject,
			});
		}
		setKey(e, r) {
			return this.augment({ [e]: r });
		}
		catchall(e) {
			return new O({ ...this._def, catchall: e });
		}
		pick(e) {
			const r = {};
			for (const n of A.objectKeys(e))
				e[n] && this.shape[n] && (r[n] = this.shape[n]);
			return new O({ ...this._def, shape: () => r });
		}
		omit(e) {
			const r = {};
			for (const n of A.objectKeys(this.shape)) e[n] || (r[n] = this.shape[n]);
			return new O({ ...this._def, shape: () => r });
		}
		deepPartial() {
			return ve(this);
		}
		partial(e) {
			const r = {};
			for (const n of A.objectKeys(this.shape)) {
				const a = this.shape[n];
				e && !e[n] ? (r[n] = a) : (r[n] = a.optional());
			}
			return new O({ ...this._def, shape: () => r });
		}
		required(e) {
			const r = {};
			for (const n of A.objectKeys(this.shape))
				if (e && !e[n]) r[n] = this.shape[n];
				else {
					let i = this.shape[n];
					for (; i instanceof B; ) i = i._def.innerType;
					r[n] = i;
				}
			return new O({ ...this._def, shape: () => r });
		}
		keyof() {
			return er(A.objectKeys(this.shape));
		}
	}
	(O.create = (t, e) =>
		new O({
			shape: () => t,
			unknownKeys: "strip",
			catchall: le.create(),
			typeName: x.ZodObject,
			...k(e),
		})),
		(O.strictCreate = (t, e) =>
			new O({
				shape: () => t,
				unknownKeys: "strict",
				catchall: le.create(),
				typeName: x.ZodObject,
				...k(e),
			})),
		(O.lazycreate = (t, e) =>
			new O({
				shape: t,
				unknownKeys: "strip",
				catchall: le.create(),
				typeName: x.ZodObject,
				...k(e),
			}));
	class Ae extends T {
		_parse(e) {
			const { ctx: r } = this._processInputParams(e),
				n = this._def.options;
			function a(i) {
				for (const o of i) if (o.result.status === "valid") return o.result;
				for (const o of i)
					if (o.result.status === "dirty")
						return r.common.issues.push(...o.ctx.common.issues), o.result;
				const s = i.map((o) => new j(o.ctx.common.issues));
				return m(r, { code: f.invalid_union, unionErrors: s }), w;
			}
			if (r.common.async)
				return Promise.all(
					n.map(async (i) => {
						const s = {
							...r,
							common: { ...r.common, issues: [] },
							parent: null,
						};
						return {
							result: await i._parseAsync({
								data: r.data,
								path: r.path,
								parent: s,
							}),
							ctx: s,
						};
					}),
				).then(a);
			{
				let i;
				const s = [];
				for (const l of n) {
					const d = { ...r, common: { ...r.common, issues: [] }, parent: null },
						h = l._parseSync({ data: r.data, path: r.path, parent: d });
					if (h.status === "valid") return h;
					h.status === "dirty" && !i && (i = { result: h, ctx: d }),
						d.common.issues.length && s.push(d.common.issues);
				}
				if (i) return r.common.issues.push(...i.ctx.common.issues), i.result;
				const o = s.map((l) => new j(l));
				return m(r, { code: f.invalid_union, unionErrors: o }), w;
			}
		}
		get options() {
			return this._def.options;
		}
	}
	Ae.create = (t, e) => new Ae({ options: t, typeName: x.ZodUnion, ...k(e) });
	const ee = (t) =>
		t instanceof Re
			? ee(t.schema)
			: t instanceof te
				? ee(t.innerType())
				: t instanceof De
					? [t.value]
					: t instanceof de
						? t.options
						: t instanceof It
							? A.objectValues(t.enum)
							: t instanceof Me
								? ee(t._def.innerType)
								: t instanceof Qe
									? [void 0]
									: t instanceof Ee
										? [null]
										: t instanceof B
											? [void 0, ...ee(t.unwrap())]
											: t instanceof ue
												? [null, ...ee(t.unwrap())]
												: t instanceof St || t instanceof Pe
													? ee(t.unwrap())
													: t instanceof qe
														? ee(t._def.innerType)
														: [];
	class Xe extends T {
		_parse(e) {
			const { ctx: r } = this._processInputParams(e);
			if (r.parsedType !== b.object)
				return (
					m(r, {
						code: f.invalid_type,
						expected: b.object,
						received: r.parsedType,
					}),
					w
				);
			const n = this.discriminator,
				a = r.data[n],
				i = this.optionsMap.get(a);
			return i
				? r.common.async
					? i._parseAsync({ data: r.data, path: r.path, parent: r })
					: i._parseSync({ data: r.data, path: r.path, parent: r })
				: (m(r, {
						code: f.invalid_union_discriminator,
						options: Array.from(this.optionsMap.keys()),
						path: [n],
					}),
					w);
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
		static create(e, r, n) {
			const a = new Map();
			for (const i of r) {
				const s = ee(i.shape[e]);
				if (!s.length)
					throw new Error(
						`A discriminator value for key \`${e}\` could not be extracted from all schema options`,
					);
				for (const o of s) {
					if (a.has(o))
						throw new Error(
							`Discriminator property ${String(e)} has duplicate value ${String(o)}`,
						);
					a.set(o, i);
				}
			}
			return new Xe({
				typeName: x.ZodDiscriminatedUnion,
				discriminator: e,
				options: r,
				optionsMap: a,
				...k(n),
			});
		}
	}
	function xt(t, e) {
		const r = ce(t),
			n = ce(e);
		if (t === e) return { valid: !0, data: t };
		if (r === b.object && n === b.object) {
			const a = A.objectKeys(e),
				i = A.objectKeys(t).filter((o) => a.indexOf(o) !== -1),
				s = { ...t, ...e };
			for (const o of i) {
				const l = xt(t[o], e[o]);
				if (!l.valid) return { valid: !1 };
				s[o] = l.data;
			}
			return { valid: !0, data: s };
		} else if (r === b.array && n === b.array) {
			if (t.length !== e.length) return { valid: !1 };
			const a = [];
			for (let i = 0; i < t.length; i++) {
				const s = t[i],
					o = e[i],
					l = xt(s, o);
				if (!l.valid) return { valid: !1 };
				a.push(l.data);
			}
			return { valid: !0, data: a };
		} else
			return r === b.date && n === b.date && +t == +e
				? { valid: !0, data: t }
				: { valid: !1 };
	}
	class Ce extends T {
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e),
				a = (i, s) => {
					if (zt(i) || zt(s)) return w;
					const o = xt(i.value, s.value);
					return o.valid
						? ((Gt(i) || Gt(s)) && r.dirty(),
							{ status: r.value, value: o.data })
						: (m(n, { code: f.invalid_intersection_types }), w);
				};
			return n.common.async
				? Promise.all([
						this._def.left._parseAsync({
							data: n.data,
							path: n.path,
							parent: n,
						}),
						this._def.right._parseAsync({
							data: n.data,
							path: n.path,
							parent: n,
						}),
					]).then(([i, s]) => a(i, s))
				: a(
						this._def.left._parseSync({
							data: n.data,
							path: n.path,
							parent: n,
						}),
						this._def.right._parseSync({
							data: n.data,
							path: n.path,
							parent: n,
						}),
					);
		}
	}
	Ce.create = (t, e, r) =>
		new Ce({ left: t, right: e, typeName: x.ZodIntersection, ...k(r) });
	class K extends T {
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e);
			if (n.parsedType !== b.array)
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.array,
						received: n.parsedType,
					}),
					w
				);
			if (n.data.length < this._def.items.length)
				return (
					m(n, {
						code: f.too_small,
						minimum: this._def.items.length,
						inclusive: !0,
						exact: !1,
						type: "array",
					}),
					w
				);
			!this._def.rest &&
				n.data.length > this._def.items.length &&
				(m(n, {
					code: f.too_big,
					maximum: this._def.items.length,
					inclusive: !0,
					exact: !1,
					type: "array",
				}),
				r.dirty());
			const i = [...n.data]
				.map((s, o) => {
					const l = this._def.items[o] || this._def.rest;
					return l ? l._parse(new W(n, s, n.path, o)) : null;
				})
				.filter((s) => !!s);
			return n.common.async
				? Promise.all(i).then((s) => P.mergeArray(r, s))
				: P.mergeArray(r, i);
		}
		get items() {
			return this._def.items;
		}
		rest(e) {
			return new K({ ...this._def, rest: e });
		}
	}
	K.create = (t, e) => {
		if (!Array.isArray(t))
			throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
		return new K({ items: t, typeName: x.ZodTuple, rest: null, ...k(e) });
	};
	class Ne extends T {
		get keySchema() {
			return this._def.keyType;
		}
		get valueSchema() {
			return this._def.valueType;
		}
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e);
			if (n.parsedType !== b.object)
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.object,
						received: n.parsedType,
					}),
					w
				);
			const a = [],
				i = this._def.keyType,
				s = this._def.valueType;
			for (const o in n.data)
				a.push({
					key: i._parse(new W(n, o, n.path, o)),
					value: s._parse(new W(n, n.data[o], n.path, o)),
					alwaysSet: o in n.data,
				});
			return n.common.async
				? P.mergeObjectAsync(r, a)
				: P.mergeObjectSync(r, a);
		}
		get element() {
			return this._def.valueType;
		}
		static create(e, r, n) {
			return r instanceof T
				? new Ne({ keyType: e, valueType: r, typeName: x.ZodRecord, ...k(n) })
				: new Ne({
						keyType: H.create(),
						valueType: e,
						typeName: x.ZodRecord,
						...k(r),
					});
		}
	}
	class kt extends T {
		get keySchema() {
			return this._def.keyType;
		}
		get valueSchema() {
			return this._def.valueType;
		}
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e);
			if (n.parsedType !== b.map)
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.map,
						received: n.parsedType,
					}),
					w
				);
			const a = this._def.keyType,
				i = this._def.valueType,
				s = [...n.data.entries()].map(([o, l], d) => ({
					key: a._parse(new W(n, o, n.path, [d, "key"])),
					value: i._parse(new W(n, l, n.path, [d, "value"])),
				}));
			if (n.common.async) {
				const o = new Map();
				return Promise.resolve().then(async () => {
					for (const l of s) {
						const d = await l.key,
							h = await l.value;
						if (d.status === "aborted" || h.status === "aborted") return w;
						(d.status === "dirty" || h.status === "dirty") && r.dirty(),
							o.set(d.value, h.value);
					}
					return { status: r.value, value: o };
				});
			} else {
				const o = new Map();
				for (const l of s) {
					const d = l.key,
						h = l.value;
					if (d.status === "aborted" || h.status === "aborted") return w;
					(d.status === "dirty" || h.status === "dirty") && r.dirty(),
						o.set(d.value, h.value);
				}
				return { status: r.value, value: o };
			}
		}
	}
	kt.create = (t, e, r) =>
		new kt({ valueType: e, keyType: t, typeName: x.ZodMap, ...k(r) });
	class _e extends T {
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e);
			if (n.parsedType !== b.set)
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.set,
						received: n.parsedType,
					}),
					w
				);
			const a = this._def;
			a.minSize !== null &&
				n.data.size < a.minSize.value &&
				(m(n, {
					code: f.too_small,
					minimum: a.minSize.value,
					type: "set",
					inclusive: !0,
					exact: !1,
					message: a.minSize.message,
				}),
				r.dirty()),
				a.maxSize !== null &&
					n.data.size > a.maxSize.value &&
					(m(n, {
						code: f.too_big,
						maximum: a.maxSize.value,
						type: "set",
						inclusive: !0,
						exact: !1,
						message: a.maxSize.message,
					}),
					r.dirty());
			const i = this._def.valueType;
			function s(l) {
				const d = new Set();
				for (const h of l) {
					if (h.status === "aborted") return w;
					h.status === "dirty" && r.dirty(), d.add(h.value);
				}
				return { status: r.value, value: d };
			}
			const o = [...n.data.values()].map((l, d) =>
				i._parse(new W(n, l, n.path, d)),
			);
			return n.common.async ? Promise.all(o).then((l) => s(l)) : s(o);
		}
		min(e, r) {
			return new _e({
				...this._def,
				minSize: { value: e, message: g.toString(r) },
			});
		}
		max(e, r) {
			return new _e({
				...this._def,
				maxSize: { value: e, message: g.toString(r) },
			});
		}
		size(e, r) {
			return this.min(e, r).max(e, r);
		}
		nonempty(e) {
			return this.min(1, e);
		}
	}
	_e.create = (t, e) =>
		new _e({
			valueType: t,
			minSize: null,
			maxSize: null,
			typeName: x.ZodSet,
			...k(e),
		});
	class Oe extends T {
		constructor() {
			super(...arguments), (this.validate = this.implement);
		}
		_parse(e) {
			const { ctx: r } = this._processInputParams(e);
			if (r.parsedType !== b.function)
				return (
					m(r, {
						code: f.invalid_type,
						expected: b.function,
						received: r.parsedType,
					}),
					w
				);
			function n(o, l) {
				return yt({
					data: o,
					path: r.path,
					errorMaps: [
						r.common.contextualErrorMap,
						r.schemaErrorMap,
						gt(),
						Ie,
					].filter((d) => !!d),
					issueData: { code: f.invalid_arguments, argumentsError: l },
				});
			}
			function a(o, l) {
				return yt({
					data: o,
					path: r.path,
					errorMaps: [
						r.common.contextualErrorMap,
						r.schemaErrorMap,
						gt(),
						Ie,
					].filter((d) => !!d),
					issueData: { code: f.invalid_return_type, returnTypeError: l },
				});
			}
			const i = { errorMap: r.common.contextualErrorMap },
				s = r.data;
			if (this._def.returns instanceof we) {
				const o = this;
				return $(async function (...l) {
					const d = new j([]),
						h = await o._def.args.parseAsync(l, i).catch((ae) => {
							throw (d.addIssue(n(l, ae)), d);
						}),
						S = await Reflect.apply(s, this, h);
					return await o._def.returns._def.type.parseAsync(S, i).catch((ae) => {
						throw (d.addIssue(a(S, ae)), d);
					});
				});
			} else {
				const o = this;
				return $(function (...l) {
					const d = o._def.args.safeParse(l, i);
					if (!d.success) throw new j([n(l, d.error)]);
					const h = Reflect.apply(s, this, d.data),
						S = o._def.returns.safeParse(h, i);
					if (!S.success) throw new j([a(h, S.error)]);
					return S.data;
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
			return new Oe({ ...this._def, args: K.create(e).rest(he.create()) });
		}
		returns(e) {
			return new Oe({ ...this._def, returns: e });
		}
		implement(e) {
			return this.parse(e);
		}
		strictImplement(e) {
			return this.parse(e);
		}
		static create(e, r, n) {
			return new Oe({
				args: e || K.create([]).rest(he.create()),
				returns: r || he.create(),
				typeName: x.ZodFunction,
				...k(n),
			});
		}
	}
	class Re extends T {
		get schema() {
			return this._def.getter();
		}
		_parse(e) {
			const { ctx: r } = this._processInputParams(e);
			return this._def
				.getter()
				._parse({ data: r.data, path: r.path, parent: r });
		}
	}
	Re.create = (t, e) => new Re({ getter: t, typeName: x.ZodLazy, ...k(e) });
	class De extends T {
		_parse(e) {
			if (e.data !== this._def.value) {
				const r = this._getOrReturnCtx(e);
				return (
					m(r, {
						received: r.data,
						code: f.invalid_literal,
						expected: this._def.value,
					}),
					w
				);
			}
			return { status: "valid", value: e.data };
		}
		get value() {
			return this._def.value;
		}
	}
	De.create = (t, e) => new De({ value: t, typeName: x.ZodLiteral, ...k(e) });
	function er(t, e) {
		return new de({ values: t, typeName: x.ZodEnum, ...k(e) });
	}
	class de extends T {
		_parse(e) {
			if (typeof e.data != "string") {
				const r = this._getOrReturnCtx(e),
					n = this._def.values;
				return (
					m(r, {
						expected: A.joinValues(n),
						received: r.parsedType,
						code: f.invalid_type,
					}),
					w
				);
			}
			if (
				(this._cache || (this._cache = new Set(this._def.values)),
				!this._cache.has(e.data))
			) {
				const r = this._getOrReturnCtx(e),
					n = this._def.values;
				return (
					m(r, { received: r.data, code: f.invalid_enum_value, options: n }), w
				);
			}
			return $(e.data);
		}
		get options() {
			return this._def.values;
		}
		get enum() {
			const e = {};
			for (const r of this._def.values) e[r] = r;
			return e;
		}
		get Values() {
			const e = {};
			for (const r of this._def.values) e[r] = r;
			return e;
		}
		get Enum() {
			const e = {};
			for (const r of this._def.values) e[r] = r;
			return e;
		}
		extract(e, r = this._def) {
			return de.create(e, { ...this._def, ...r });
		}
		exclude(e, r = this._def) {
			return de.create(
				this.options.filter((n) => !e.includes(n)),
				{ ...this._def, ...r },
			);
		}
	}
	de.create = er;
	class It extends T {
		_parse(e) {
			const r = A.getValidEnumValues(this._def.values),
				n = this._getOrReturnCtx(e);
			if (n.parsedType !== b.string && n.parsedType !== b.number) {
				const a = A.objectValues(r);
				return (
					m(n, {
						expected: A.joinValues(a),
						received: n.parsedType,
						code: f.invalid_type,
					}),
					w
				);
			}
			if (
				(this._cache ||
					(this._cache = new Set(A.getValidEnumValues(this._def.values))),
				!this._cache.has(e.data))
			) {
				const a = A.objectValues(r);
				return (
					m(n, { received: n.data, code: f.invalid_enum_value, options: a }), w
				);
			}
			return $(e.data);
		}
		get enum() {
			return this._def.values;
		}
	}
	It.create = (t, e) =>
		new It({ values: t, typeName: x.ZodNativeEnum, ...k(e) });
	class we extends T {
		unwrap() {
			return this._def.type;
		}
		_parse(e) {
			const { ctx: r } = this._processInputParams(e);
			if (r.parsedType !== b.promise && r.common.async === !1)
				return (
					m(r, {
						code: f.invalid_type,
						expected: b.promise,
						received: r.parsedType,
					}),
					w
				);
			const n = r.parsedType === b.promise ? r.data : Promise.resolve(r.data);
			return $(
				n.then((a) =>
					this._def.type.parseAsync(a, {
						path: r.path,
						errorMap: r.common.contextualErrorMap,
					}),
				),
			);
		}
	}
	we.create = (t, e) => new we({ type: t, typeName: x.ZodPromise, ...k(e) });
	class te extends T {
		innerType() {
			return this._def.schema;
		}
		sourceType() {
			return this._def.schema._def.typeName === x.ZodEffects
				? this._def.schema.sourceType()
				: this._def.schema;
		}
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e),
				a = this._def.effect || null,
				i = {
					addIssue: (s) => {
						m(n, s), s.fatal ? r.abort() : r.dirty();
					},
					get path() {
						return n.path;
					},
				};
			if (((i.addIssue = i.addIssue.bind(i)), a.type === "preprocess")) {
				const s = a.transform(n.data, i);
				if (n.common.async)
					return Promise.resolve(s).then(async (o) => {
						if (r.value === "aborted") return w;
						const l = await this._def.schema._parseAsync({
							data: o,
							path: n.path,
							parent: n,
						});
						return l.status === "aborted"
							? w
							: l.status === "dirty" || r.value === "dirty"
								? Te(l.value)
								: l;
					});
				{
					if (r.value === "aborted") return w;
					const o = this._def.schema._parseSync({
						data: s,
						path: n.path,
						parent: n,
					});
					return o.status === "aborted"
						? w
						: o.status === "dirty" || r.value === "dirty"
							? Te(o.value)
							: o;
				}
			}
			if (a.type === "refinement") {
				const s = (o) => {
					const l = a.refinement(o, i);
					if (n.common.async) return Promise.resolve(l);
					if (l instanceof Promise)
						throw new Error(
							"Async refinement encountered during synchronous parse operation. Use .parseAsync instead.",
						);
					return o;
				};
				if (n.common.async === !1) {
					const o = this._def.schema._parseSync({
						data: n.data,
						path: n.path,
						parent: n,
					});
					return o.status === "aborted"
						? w
						: (o.status === "dirty" && r.dirty(),
							s(o.value),
							{ status: r.value, value: o.value });
				} else
					return this._def.schema
						._parseAsync({ data: n.data, path: n.path, parent: n })
						.then((o) =>
							o.status === "aborted"
								? w
								: (o.status === "dirty" && r.dirty(),
									s(o.value).then(() => ({ status: r.value, value: o.value }))),
						);
			}
			if (a.type === "transform")
				if (n.common.async === !1) {
					const s = this._def.schema._parseSync({
						data: n.data,
						path: n.path,
						parent: n,
					});
					if (!ye(s)) return w;
					const o = a.transform(s.value, i);
					if (o instanceof Promise)
						throw new Error(
							"Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.",
						);
					return { status: r.value, value: o };
				} else
					return this._def.schema
						._parseAsync({ data: n.data, path: n.path, parent: n })
						.then((s) =>
							ye(s)
								? Promise.resolve(a.transform(s.value, i)).then((o) => ({
										status: r.value,
										value: o,
									}))
								: w,
						);
			A.assertNever(a);
		}
	}
	(te.create = (t, e, r) =>
		new te({ schema: t, typeName: x.ZodEffects, effect: e, ...k(r) })),
		(te.createWithPreprocess = (t, e, r) =>
			new te({
				schema: e,
				effect: { type: "preprocess", transform: t },
				typeName: x.ZodEffects,
				...k(r),
			}));
	class B extends T {
		_parse(e) {
			return this._getType(e) === b.undefined
				? $(void 0)
				: this._def.innerType._parse(e);
		}
		unwrap() {
			return this._def.innerType;
		}
	}
	B.create = (t, e) =>
		new B({ innerType: t, typeName: x.ZodOptional, ...k(e) });
	class ue extends T {
		_parse(e) {
			return this._getType(e) === b.null
				? $(null)
				: this._def.innerType._parse(e);
		}
		unwrap() {
			return this._def.innerType;
		}
	}
	ue.create = (t, e) =>
		new ue({ innerType: t, typeName: x.ZodNullable, ...k(e) });
	class Me extends T {
		_parse(e) {
			const { ctx: r } = this._processInputParams(e);
			let n = r.data;
			return (
				r.parsedType === b.undefined && (n = this._def.defaultValue()),
				this._def.innerType._parse({ data: n, path: r.path, parent: r })
			);
		}
		removeDefault() {
			return this._def.innerType;
		}
	}
	Me.create = (t, e) =>
		new Me({
			innerType: t,
			typeName: x.ZodDefault,
			defaultValue:
				typeof e.default == "function" ? e.default : () => e.default,
			...k(e),
		});
	class qe extends T {
		_parse(e) {
			const { ctx: r } = this._processInputParams(e),
				n = { ...r, common: { ...r.common, issues: [] } },
				a = this._def.innerType._parse({
					data: n.data,
					path: n.path,
					parent: { ...n },
				});
			return Ge(a)
				? a.then((i) => ({
						status: "valid",
						value:
							i.status === "valid"
								? i.value
								: this._def.catchValue({
										get error() {
											return new j(n.common.issues);
										},
										input: n.data,
									}),
					}))
				: {
						status: "valid",
						value:
							a.status === "valid"
								? a.value
								: this._def.catchValue({
										get error() {
											return new j(n.common.issues);
										},
										input: n.data,
									}),
					};
		}
		removeCatch() {
			return this._def.innerType;
		}
	}
	qe.create = (t, e) =>
		new qe({
			innerType: t,
			typeName: x.ZodCatch,
			catchValue: typeof e.catch == "function" ? e.catch : () => e.catch,
			...k(e),
		});
	class Tt extends T {
		_parse(e) {
			if (this._getType(e) !== b.nan) {
				const n = this._getOrReturnCtx(e);
				return (
					m(n, {
						code: f.invalid_type,
						expected: b.nan,
						received: n.parsedType,
					}),
					w
				);
			}
			return { status: "valid", value: e.data };
		}
	}
	Tt.create = (t) => new Tt({ typeName: x.ZodNaN, ...k(t) });
	class St extends T {
		_parse(e) {
			const { ctx: r } = this._processInputParams(e),
				n = r.data;
			return this._def.type._parse({ data: n, path: r.path, parent: r });
		}
		unwrap() {
			return this._def.type;
		}
	}
	class Ye extends T {
		_parse(e) {
			const { status: r, ctx: n } = this._processInputParams(e);
			if (n.common.async)
				return (async () => {
					const i = await this._def.in._parseAsync({
						data: n.data,
						path: n.path,
						parent: n,
					});
					return i.status === "aborted"
						? w
						: i.status === "dirty"
							? (r.dirty(), Te(i.value))
							: this._def.out._parseAsync({
									data: i.value,
									path: n.path,
									parent: n,
								});
				})();
			{
				const a = this._def.in._parseSync({
					data: n.data,
					path: n.path,
					parent: n,
				});
				return a.status === "aborted"
					? w
					: a.status === "dirty"
						? (r.dirty(), { status: "dirty", value: a.value })
						: this._def.out._parseSync({
								data: a.value,
								path: n.path,
								parent: n,
							});
			}
		}
		static create(e, r) {
			return new Ye({ in: e, out: r, typeName: x.ZodPipeline });
		}
	}
	class Pe extends T {
		_parse(e) {
			const r = this._def.innerType._parse(e),
				n = (a) => (ye(a) && (a.value = Object.freeze(a.value)), a);
			return Ge(r) ? r.then((a) => n(a)) : n(r);
		}
		unwrap() {
			return this._def.innerType;
		}
	}
	Pe.create = (t, e) =>
		new Pe({ innerType: t, typeName: x.ZodReadonly, ...k(e) });
	var x;
	((t) => {
		(t.ZodString = "ZodString"),
			(t.ZodNumber = "ZodNumber"),
			(t.ZodNaN = "ZodNaN"),
			(t.ZodBigInt = "ZodBigInt"),
			(t.ZodBoolean = "ZodBoolean"),
			(t.ZodDate = "ZodDate"),
			(t.ZodSymbol = "ZodSymbol"),
			(t.ZodUndefined = "ZodUndefined"),
			(t.ZodNull = "ZodNull"),
			(t.ZodAny = "ZodAny"),
			(t.ZodUnknown = "ZodUnknown"),
			(t.ZodNever = "ZodNever"),
			(t.ZodVoid = "ZodVoid"),
			(t.ZodArray = "ZodArray"),
			(t.ZodObject = "ZodObject"),
			(t.ZodUnion = "ZodUnion"),
			(t.ZodDiscriminatedUnion = "ZodDiscriminatedUnion"),
			(t.ZodIntersection = "ZodIntersection"),
			(t.ZodTuple = "ZodTuple"),
			(t.ZodRecord = "ZodRecord"),
			(t.ZodMap = "ZodMap"),
			(t.ZodSet = "ZodSet"),
			(t.ZodFunction = "ZodFunction"),
			(t.ZodLazy = "ZodLazy"),
			(t.ZodLiteral = "ZodLiteral"),
			(t.ZodEnum = "ZodEnum"),
			(t.ZodEffects = "ZodEffects"),
			(t.ZodNativeEnum = "ZodNativeEnum"),
			(t.ZodOptional = "ZodOptional"),
			(t.ZodNullable = "ZodNullable"),
			(t.ZodDefault = "ZodDefault"),
			(t.ZodCatch = "ZodCatch"),
			(t.ZodPromise = "ZodPromise"),
			(t.ZodBranded = "ZodBranded"),
			(t.ZodPipeline = "ZodPipeline"),
			(t.ZodReadonly = "ZodReadonly");
	})(x || (x = {}));
	const c = H.create,
		p = fe.create,
		z = pe.create,
		_ = Je.create,
		tr = Ee.create,
		v = he.create;
	le.create;
	const E = U.create,
		u = O.create,
		I = Ae.create,
		Cn = Xe.create;
	Ce.create;
	const Nn = K.create,
		y = Ne.create,
		On = Re.create,
		Le = De.create,
		$e = de.create;
	we.create, B.create, ue.create;
	const re = te.createWithPreprocess;
	function D(t, e = 0, r = 2) {
		if (e > r) return "...";
		if (t instanceof O) {
			const n = t.shape,
				a = Object.keys(n).filter((s) => !s.startsWith("__"));
			return a.length === 0
				? "{ }"
				: e >= r - 1
					? "{ ... }"
					: `{ ${a
							.map((s) => {
								const o = n[s],
									l = o instanceof B,
									d = D(l ? o.unwrap() : o, e + 1, r);
								return `${s}${l ? "?" : ""}: ${d}`;
							})
							.join(", ")} }`;
		}
		if (t instanceof Ae) return t.options.map((n) => D(n, e, r)).join(" or ");
		if (t instanceof H) return "string";
		if (t instanceof fe) return "number";
		if (t instanceof Je) return "boolean";
		if (t instanceof pe) return "bigint";
		if (t instanceof Ee) return "null";
		if (t instanceof U) {
			const n = D(t.element, e + 1, r);
			return n === "unknown" || n === "any" ? "array" : `${n}[]`;
		}
		if (t instanceof K)
			return `[${t.items.map((n) => D(n, e + 1, r)).join(", ")}]`;
		if (t instanceof Ne) {
			const n = D(t._def.valueType, e + 1, r);
			return n === "unknown" || n === "any"
				? "{ [key: string]: unknown }"
				: `{ [key: string]: ${n} }`;
		}
		return t instanceof B
			? `${D(t.unwrap(), e, r)}?`
			: t instanceof De
				? JSON.stringify(t.value)
				: t instanceof de
					? t.options.map((n) => `"${n}"`).join(" | ")
					: t instanceof _t
						? "any"
						: t instanceof he
							? "unknown"
							: t instanceof wt
								? "void"
								: t instanceof Qe
									? "undefined"
									: t instanceof te
										? D(t.innerType(), e, r)
										: t instanceof Me
											? D(t.removeDefault(), e, r)
											: t instanceof ue
												? `${D(t.unwrap(), e, r)} | null`
												: t instanceof Re
													? "lazy"
													: t instanceof we
														? `Promise<${D(t.unwrap(), e + 1, r)}>`
														: t instanceof Oe
															? "function"
															: t instanceof Se
																? "Date"
																: t instanceof kt
																	? "Map"
																	: t instanceof _e
																		? "Set"
																		: t instanceof Ce
																			? `${D(t._def.left, e, r)} & ${D(t._def.right, e, r)}`
																			: t instanceof Xe
																				? t.options
																						.map((n) => D(n, e, r))
																						.join(" or ")
																				: t instanceof St
																					? D(t.unwrap(), e, r)
																					: t instanceof Tt
																						? "NaN"
																						: t instanceof qe
																							? D(t.removeCatch(), e, r)
																							: t instanceof Ye
																								? D(t._def.in, e, r)
																								: t instanceof Pe
																									? `readonly ${D(t.unwrap(), e, r)}`
																									: "unknown";
	}
	function Rn(t) {
		return t === null
			? "null"
			: t === void 0
				? "undefined"
				: Array.isArray(t)
					? "array"
					: typeof t;
	}
	function Dn(t, e, r, n) {
		const a = r.filter((o) => o.path.length === 0),
			i = r.filter((o) => o.path.length > 0);
		if (a.length > 0 && i.length === 0) {
			const o = a.some((d) => d.code === "custom"),
				l = a.some(
					(d) =>
						d.code !== "invalid_type" &&
						d.code !== "invalid_literal" &&
						d.code !== "invalid_union",
				);
			if (!o && !l) {
				const d = D(e),
					h = Rn(n);
				return `Invalid parameters for ${t}: expected ${d}${d === "{ }" ? " or no args" : ""}, received ${h}`;
			}
		}
		const s = r.map(
			(o) =>
				`at '${o.path.length > 0 ? o.path.join(".") : "root"}': ${o.message}`,
		);
		return `Invalid parameters for ${t}: ${s.join("; ")}`;
	}
	async function Mn(t, e, r, n, a) {
		const i = t.safeParse(ze(n));
		if (!i.success)
			return {
				ok: !1,
				error: {
					message: Dn(a, t, i.error.issues, n),
					code: "E_INVALID_PARAMS",
					category: "validation",
				},
			};
		try {
			const s = await r(i.data),
				o = e.safeParse(s);
			if (!o.success) {
				const l = o.error.issues.map((d) => {
					const h = d.path.join(".");
					return `invalid return value${h ? ` at '${h}'` : ""} (${d.message})`;
				});
				return {
					ok: !1,
					error: {
						message: `Invalid return value for ${a}: ${l.join("; ")}`,
						code: "E_INVALID_RETURN",
						category: "validation",
					},
				};
			}
			return { ok: !0, value: o.data };
		} catch (s) {
			const o = Ot(s),
				l =
					o.code === "E_EXTENSION" &&
					(typeof s != "object" || s === null || !("code" in s));
			return {
				ok: !1,
				error: {
					...o,
					code: l ? "E_HANDLER" : o.code,
					message: `${a}: ${o.message}`,
				},
			};
		}
	}
	const rr = new Map(),
		et = new Map();
	function qn(t) {
		rr.set(t.registryAction, t);
	}
	function tt(t) {
		return rr.get(t);
	}
	function Pn(t) {
		for (const e of t) qn(e);
		try {
			chrome.runtime.sendMessage({ type: "contentScriptReady" });
		} catch {}
	}
	function Ln(t) {
		const e = et.get(t);
		return e ? (e.abort(), et.delete(t), !0) : !1;
	}
	async function $n(t, e, r, n, a) {
		const i = tt(t);
		if (!i)
			return {
				ok: !1,
				error: {
					message: `No schema registered for content-script action: ${t}`,
					code: "E_INTERNAL",
				},
			};
		const s = new AbortController();
		a && et.set(a, s);
		try {
			return await Mn(
				i.params,
				i.returns,
				async (o) => r(o, s.signal),
				ze(n),
				t,
			);
		} finally {
			a && et.delete(a);
		}
	}
	function jn(t, e) {
		if (tt(t)) return t;
		const r = `page_${e}`;
		return tt(r) ? r : t;
	}
	function Fn(t, e) {
		const r = tt(t);
		return (r == null ? void 0 : r.handlerKey) ?? e;
	}
	function nr(t, e, r, n, a) {
		const i = jn(t, e),
			s = Fn(i, e),
			o = an[s];
		return o
			? ($n(i, s, o, r, a)
					.then((d) => {
						me.debug("dispatch_response", {
							registryAction: t,
							handlerAction: s,
							ok: d.ok,
						}),
							n(d);
					})
					.catch((d) => {
						const h = Ot(d, {});
						me.debug("dispatch_error", {
							registryAction: t,
							handlerAction: s,
							error: h.message,
						}),
							n({ ok: !1, error: h });
					}),
				!0)
			: (me.debug("no_handler", { action: s, registryAction: t }),
				n({ ok: !1, error: `Unknown content script action: ${s}` }),
				!1);
	}
	function Zn() {
		chrome.runtime.onMessage.addListener((t, e, r) => {
			if (e.id !== chrome.runtime.id)
				return (
					me.warn("unauthorized_sender", {
						senderId: e.id,
						expected: chrome.runtime.id,
					}),
					r({ ok: !1, error: "Unauthorized sender" }),
					!1
				);
			const n = be(t),
				a = String(n.type ?? ""),
				i = String(n.action ?? "");
			if (
				(me.debug("received", {
					messageType: a,
					action: i,
					hasParams: !!n.params,
				}),
				a === "registryCallCancel")
			) {
				const s = String(n.id ?? "");
				return Ln(s), r({ ok: !0 }), !1;
			}
			if (a === "registryCall") {
				const s = yr(i),
					o = typeof n.id == "string" ? n.id : void 0;
				return nr(i, s, n.params, r, o);
			}
			return !i && a === "contract-ping"
				? (r({ ok: !0 }), !1)
				: i
					? i === "ping"
						? nr("ping", "ping", n.params, r)
						: (r({
								ok: !1,
								error: "Use registryCall for content-script actions",
							}),
							!1)
					: (r({ ok: !1, error: "Missing action" }), !1);
		});
	}
	const F = () => I([z(), p().finite()]).transform((t) => BigInt(t));
	u({ key: c().describe("Storage key to retrieve") }),
		u({
			key: c().describe("Storage key to set"),
			value: c().describe("Value to store"),
		}),
		u({ key: c().describe("Storage key to delete") }),
		u({});
	const Un = u({
		items: y(c()).describe("Record of key-value string pairs to store"),
	});
	re(
		(t) =>
			t !== null && typeof t == "object" && !Array.isArray(t) && !("items" in t)
				? { items: t }
				: t,
		Un,
	);
	const Bn = u({
		keys: E(c()).describe("Array of storage keys to retrieve"),
		defaults: y(c())
			.optional()
			.describe("Default string values for missing keys"),
	});
	re((t) => (Array.isArray(t) ? { keys: t } : t), Bn), u({});
	const Vn = u({ keys: E(c()).describe("Array of storage keys to delete") });
	re((t) => (Array.isArray(t) ? { keys: t } : t), Vn),
		u({}),
		u({}),
		I([
			Nn([I([u({ text: c() }), c()])]),
			u({ text: c().optional(), value: c().optional() }),
		]);
	const Wn = u({
		url: c().describe("URL to fetch"),
		method: c()
			.default("GET")
			.describe("HTTP method (GET, POST, PUT, DELETE, etc.)"),
		headers: y(c()).default({}).describe("Request headers as key-value pairs"),
		body: c().nullable().default(null).describe("Request body string"),
		timeout: F().default(30000n).describe("Timeout in milliseconds"),
		store: _()
			.optional()
			.describe(
				"When true, store binary responses as a handle instead of returning body bytes",
			),
		options: u({}).passthrough().optional().describe("Fetch options"),
	}).passthrough();
	u({ duration: F().describe("Duration to sleep in milliseconds") });
	const G = () => c().regex(/^e\d+$/),
		Hn =
			'use { refId: "e2" } or { label: "..." } object form, not positional arguments',
		Et = (t, e) => {
			if (t.__invalidPositional !== void 0) {
				e.addIssue({ code: f.custom, message: Hn });
				return;
			}
			!t.refId &&
				!t.label &&
				e.addIssue({
					code: f.custom,
					message: "Either refId or label is required",
				});
		},
		ar = (t, e) => {
			t.x !== void 0 || t.y !== void 0 || Et(t, e);
		},
		R = (t) =>
			re(
				(e) =>
					typeof e == "string" || typeof e == "number"
						? { __invalidPositional: e }
						: e,
				u({
					__invalidPositional: I([c(), p()])
						.optional()
						.describe("Internal flag for positional argument rejection"),
					refId: G().optional().describe("Element reference ID (e.g. e2)"),
					label: c().optional().describe("Human-readable element label"),
					...t,
				}).superRefine(Et),
			),
		je = { tabId: I([p(), z()]).optional().describe("Target tab ID") },
		J = (t) =>
			re(
				(e) =>
					typeof e == "string" || typeof e == "number"
						? { __invalidPositional: e }
						: e,
				u({
					__invalidPositional: I([c(), p()])
						.optional()
						.describe("Internal flag for positional argument rejection"),
					...je,
					refId: G().optional().describe("Element reference ID (e.g. e2)"),
					label: c().optional().describe("Human-readable element label"),
					...t,
				}).superRefine(Et),
			);
	u({}),
		u({}),
		u({
			url: c().describe("URL to navigate to"),
			timeout: F().optional().describe("Navigation timeout in milliseconds"),
			waitUntil: $e(["load", "networkidle"])
				.optional()
				.describe(
					"When to consider navigation complete: 'load' (tab status complete) or 'networkidle' (no in-flight requests for 500ms)",
				),
		});
	const Kn = u({}),
		zn = u({});
	u({}),
		u({
			duration: F().default(1000n).describe("Duration to wait in milliseconds"),
		});
	const Gn = R(),
		Jn = (t, e) => {
			[t.url, t.path, t.handle].filter(
				(n) => typeof n == "string" && n.length > 0,
			).length !== 1 &&
				e.addIssue({
					code: f.custom,
					message:
						"Each file entry requires exactly one of url, path, or handle",
				});
		},
		ir = u({
			name: c().optional().describe("File name including extension"),
			mimeType: c()
				.optional()
				.describe("MIME type (defaults to application/octet-stream)"),
			url: c()
				.url()
				.optional()
				.describe("HTTP(S) URL to fetch in the target tab"),
			path: c()
				.min(1)
				.optional()
				.describe("Virtual filesystem path (resolved in worker)"),
			handle: c()
				.min(1)
				.optional()
				.describe("Binary handle from page.fetch({ store: true })"),
		}).superRefine(Jn),
		sr = Cn("kind", [
			u({
				kind: Le("bytes"),
				name: c().min(1),
				data: c().min(1),
				mimeType: c().optional(),
			}),
			u({
				kind: Le("url"),
				url: c().url(),
				name: c().min(1),
				mimeType: c().optional(),
			}),
		]),
		Qn = R({ value: c().describe("Value to fill into the element") }),
		Xn = R({ files: E(ir).min(1).describe("Files to attach to the input") }),
		Yn = R({
			files: E(sr)
				.min(1)
				.describe("Resolved files for content-script application"),
		}),
		ea = R({ text: c().describe("Text to type into the element") }),
		ta = R({ text: c().describe("Text to append into the element") }),
		ra = u({
			key: c().describe("Key to press (e.g. Enter, Escape, ArrowDown)"),
		}),
		na = R({ value: c().describe("Value to select in the dropdown") }),
		aa = R({
			value: c().describe(
				"Visible text of the option to select (matched case-insensitively)",
			),
		}),
		ia = R({
			checked: _()
				.optional()
				.describe("Desired checked state (true to check, false to uncheck)"),
		}),
		sa = R(),
		oa = u({}),
		ca = u({
			direction: c()
				.default("down")
				.describe("Scroll direction: up, down, left, or right"),
			amount: p().default(300).describe("Pixels to scroll"),
		}),
		la = re(
			(t) =>
				typeof t == "string" || typeof t == "number"
					? { __invalidPositional: t }
					: t,
			u({
				__invalidPositional: I([c(), p()])
					.optional()
					.describe("Internal flag for positional argument rejection"),
				refId: G().optional().describe("Element reference ID (e.g. e2)"),
				label: c().optional().describe("Human-readable element label"),
				x: p().optional().describe("X coordinate to scroll to"),
				y: p().optional().describe("Y coordinate to scroll to"),
			}).superRefine(ar),
		),
		da = R(),
		ua = u({ selector: c().describe("CSS selector to find elements") }),
		fa = u({
			selector: c().describe(
				"CSS selector for the root element(s) to introspect",
			),
			depth: p()
				.int()
				.min(0)
				.max(10)
				.default(2)
				.describe("How many descendant levels to include (0 = root only)"),
			includeHidden: _()
				.default(!0)
				.describe(
					"Include elements hidden by CSS/aria (default true — this tool's purpose is to see what the curated snapshot filters out)",
				),
		}),
		pa = u({
			selector: c().describe("CSS selector to wait for"),
			timeout: F().default(30000n).describe("Timeout in milliseconds"),
		}),
		ha = u({ fields: E(c()).describe("Array of field names to extract") }),
		ma = re((t) => (Array.isArray(t) ? { fields: t } : t), ha);
	I([p(), E(u({}).passthrough()), u({}).passthrough()]),
		u({}),
		u({
			active: _().optional().describe("Whether the tabs are active"),
			currentWindow: _()
				.optional()
				.describe("Whether the tabs are in the current window"),
			url: c().optional().describe("URL pattern to match tabs against"),
		}).passthrough(),
		re(
			(t) => (typeof t == "string" ? { url: t } : t),
			u({
				url: c().optional().describe("URL to open in the new tab"),
				active: _().optional().describe("Whether to focus the new tab"),
			}),
		),
		I([
			p(),
			E(
				u({
					id: p().optional(),
					tabId: p().optional(),
					tab_id: p().optional(),
				}).passthrough(),
			),
			u({
				id: p().optional(),
				tabId: p().optional(),
				tab_id: p().optional(),
			}).passthrough(),
		]);
	const ba = J(),
		ga = J({ value: c().describe("Value to fill into the element") }),
		ya = J({ files: E(ir).min(1).describe("Files to attach to the input") }),
		va = J({
			files: E(sr)
				.min(1)
				.describe("Resolved files for content-script application"),
		}),
		_a = re(
			(t) =>
				typeof t == "string" || typeof t == "number"
					? { __invalidPositional: t }
					: t,
			u({
				__invalidPositional: I([c(), p()])
					.optional()
					.describe("Internal flag for positional argument rejection"),
				...je,
				refId: G().optional().describe("Element reference ID (e.g. e2)"),
				label: c().optional().describe("Human-readable element label"),
				x: p().optional().describe("X coordinate to scroll to"),
				y: p().optional().describe("Y coordinate to scroll to"),
			}).superRefine(ar),
		),
		wa = J({ text: c().describe("Text to type into the element") }),
		xa = u({
			...je,
			key: c().describe("Key to press (e.g. Enter, Escape, ArrowDown)"),
		}),
		ka = J({ value: c().describe("Value to select in the dropdown") }),
		Ia = J({
			value: c().describe(
				"Visible text of the option to select (matched case-insensitively)",
			),
		}),
		Ta = J({
			checked: _()
				.optional()
				.describe("Desired checked state (true to check, false to uncheck)"),
		}),
		Sa = J(),
		Ea = u({ ...je }),
		Aa = u({
			...je,
			direction: c()
				.default("down")
				.describe("Scroll direction: up, down, left, or right"),
			amount: p().default(300).describe("Pixels to scroll"),
		}),
		Ca = J(),
		Na = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
			script: c().optional().describe("Script to evaluate"),
			code: c().optional().describe("Alternative script code"),
			js: c().optional().describe("Alternative JS code"),
		}).passthrough(),
		Oa = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
		}).passthrough(),
		Ra = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
		}).passthrough();
	u({
		tabId: I([p(), z()]).optional().describe("Target tab ID"),
		timeout: p().optional().describe("Timeout in milliseconds"),
	}).passthrough();
	const Da = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
			url: c().optional().describe("URL to fetch"),
			options: u({}).passthrough().optional().describe("Fetch options"),
		}).passthrough(),
		Ma = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
			max_nodes: p().optional().describe("Maximum nodes to include"),
			options: u({}).passthrough().optional().describe("Snapshot options"),
		}).passthrough(),
		qa = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
			max_nodes: p().optional().describe("Maximum nodes to include"),
			options: u({}).passthrough().optional().describe("Snapshot options"),
		}).passthrough(),
		Pa = u({
			tabId: I([p(), z()]).optional().describe("Target tab ID"),
			max_nodes: p().optional().describe("Maximum nodes to include"),
			options: u({}).passthrough().optional().describe("Snapshot options"),
		}).passthrough();
	R(),
		R(),
		R({ value: c().optional().describe("Value to fill into the element") }),
		R({ text: c().optional().describe("Text to type into the element") }),
		u({
			key: c()
				.optional()
				.describe("Key to press (e.g. Enter, Escape, ArrowDown)"),
		}),
		R({ value: c().optional().describe("Value to select in the dropdown") }),
		R({
			checked: _()
				.optional()
				.describe("Desired checked state (true to check, false to uncheck)"),
		}),
		R(),
		u({}),
		u({
			direction: c()
				.optional()
				.describe("Scroll direction: up, down, left, or right"),
			amount: p().optional().describe("Pixels to scroll"),
		}),
		R(),
		R({ text: c().optional().describe("Text to append into the element") }),
		u({}),
		u({}),
		u({
			duration: F().default(1000n).describe("Duration to wait in milliseconds"),
		}),
		u({
			interactive_only: _()
				.default(!1)
				.describe("Only include interactive elements"),
			max_nodes: F()
				.default(500n)
				.describe("Maximum number of nodes to include in snapshot"),
		}),
		u({
			interactive_only: _()
				.default(!1)
				.describe("Only include interactive elements"),
			max_nodes: F()
				.default(500n)
				.describe("Maximum number of nodes to include in snapshot"),
		}),
		u({
			interactive_only: _()
				.default(!1)
				.describe("Only include interactive elements"),
			max_nodes: F()
				.default(500n)
				.describe("Maximum number of nodes to include in snapshot"),
		}),
		u({
			interactive_only: _()
				.default(!1)
				.describe("Only include interactive elements"),
			max_nodes: F()
				.default(500n)
				.describe("Maximum number of nodes to include in snapshot"),
		}),
		u({
			snapshot: u({}).passthrough().describe("Raw DOM snapshot data to format"),
			format: c().optional().describe("Output format (e.g. markdown, html)"),
		});
	const La = u({
			max_nodes: p().optional().describe("Maximum nodes to include"),
			options: u({}).passthrough().optional().describe("Snapshot options"),
		}).passthrough(),
		$a = u({
			max_nodes: p().optional().describe("Maximum nodes to include"),
			options: u({}).passthrough().optional().describe("Snapshot options"),
		}).passthrough(),
		ja = u({
			max_nodes: p().optional().describe("Maximum nodes to include"),
			options: u({}).passthrough().optional().describe("Snapshot options"),
		}).passthrough(),
		Fa = u({
			role: I([c(), E(c())])
				.optional()
				.describe("Filter by ARIA role"),
			tag: I([c(), E(c())])
				.optional()
				.describe("Filter by HTML tag"),
			text: c()
				.optional()
				.describe("Filter by text content (case-insensitive substring)"),
			name: c()
				.optional()
				.describe("Filter by accessible name (case-insensitive substring)"),
			interactiveOnly: _()
				.optional()
				.describe("Only include interactive elements"),
			href: c()
				.optional()
				.describe("Filter by href pattern (case-insensitive substring)"),
			src: c()
				.optional()
				.describe("Filter by src pattern (case-insensitive substring)"),
			limit: p()
				.positive()
				.optional()
				.describe("Maximum filtered nodes to return"),
		}).passthrough(),
		or = u({
			filter: Fa.optional().describe("Semantic filter criteria"),
			max_nodes: p()
				.optional()
				.describe("Maximum nodes to collect before filtering"),
		}).passthrough(),
		Za = or.extend({ tabId: p().describe("Tab ID") });
	u({ path: c().describe("File or directory path") }),
		u({
			from: c().describe("Source path"),
			to: c().describe("Destination path"),
		}),
		u({
			path: c().describe("File path to write to"),
			data: c().describe("Data to write"),
		}),
		u({
			path: c().describe("File path to read from"),
			offset: F().describe("Byte offset to start reading"),
			len: p().describe("Number of bytes to read"),
		}),
		u({
			path: c().describe("File path to update"),
			offset: F().describe("Byte offset to start writing"),
			data: c().describe("Data to write"),
		}),
		u({
			path: c().describe("File path to hash"),
			algo: c().default("sha256").describe("Hash algorithm (e.g. sha256, md5)"),
		}),
		y(v()),
		y(v()),
		y(v()),
		y(v()),
		I([p(), y(v())]),
		I([p(), y(v())]),
		y(v()),
		y(v()),
		y(v()),
		I([c(), y(v())]),
		y(v()),
		y(v()),
		y(v()),
		y(v()),
		y(v()),
		I([c(), p(), y(v())]),
		y(v()),
		y(v()),
		y(v()),
		I([p(), y(v())]),
		y(v()),
		y(v()),
		y(v()),
		y(v()),
		y(v()),
		E(v()),
		I([c(), y(v())]),
		y(v()),
		I([c(), y(v())]),
		y(v()),
		I([c(), y(v())]),
		y(v()),
		I([c(), y(v())]),
		y(v()),
		y(v()),
		I([p(), y(v())]),
		y(v()),
		y(v()),
		I([p(), y(v())]),
		y(v()),
		I([c(), p(), y(v())]),
		y(v()),
		y(v()),
		y(v()),
		y(v()),
		I([p(), y(v())]),
		I([p(), y(v())]),
		I([p(), y(v())]),
		I([p(), y(v())]),
		I([p(), y(v())]),
		y(v()),
		y(v()),
		y(v()),
		u({
			action: c().describe("Host action name"),
			params: u({})
				.passthrough()
				.optional()
				.describe("Parameters for the host action"),
		}).passthrough();
	const Ua = I([c(), p(), _(), tr(), E(v()), y(v())]),
		C = u({
			ok: Le(!0).describe("Whether the action succeeded"),
			action: c().describe("Action identifier (e.g. 'page_fill')"),
			refId: G()
				.optional()
				.describe("Element reference ID that was acted upon (e.g. e2)"),
			tag: c().optional().describe("HTML tag name of the element"),
			role: c().optional().describe("ARIA role of the element"),
			name: c().optional().describe("Accessible name of the element"),
			value: c()
				.optional()
				.describe("Final value of the element after the action"),
			checked: _().optional().describe("Checked state after the action"),
			disabled: _().optional().describe("Whether the element is disabled"),
			readOnly: _().optional().describe("Whether the element is read-only"),
			text: c().optional().describe("Text content of the element"),
			key: c().optional().describe("Key that was pressed (for press actions)"),
			direction: c()
				.optional()
				.describe("Scroll direction (for scroll actions)"),
			amount: p()
				.optional()
				.describe("Scroll amount in pixels (for scroll actions)"),
			fileCount: p()
				.optional()
				.describe("Number of files attached (for setFiles actions)"),
			fileNames: E(c())
				.optional()
				.describe("Names of attached files (for setFiles actions)"),
			observationId: c()
				.optional()
				.describe(
					"Opaque ID of the observation lease authorizing this action (snapshot-scoped)",
				),
			dispatched: Le(!0)
				.optional()
				.describe(
					"True if the action was dispatched to the DOM. Does NOT prove the application accepted it.",
				),
			verification: Le("required")
				.optional()
				.describe(
					"Always 'required': a fresh observation is required to verify the effect.",
				),
		});
	I([C, tr()]);
	const cr = u({
		status: p().describe("HTTP response status code"),
		ok: _().describe("Whether the response status is 2xx"),
		headers: y(c()).describe("Response headers as key-value pairs"),
		body: c()
			.optional()
			.describe("Response body (omitted when bodyEncoding is handle)"),
		bodyEncoding: $e(["text", "base64", "handle"]).describe(
			"Encoding of the body field",
		),
		handle: c()
			.optional()
			.describe("Binary handle when bodyEncoding is handle"),
		byteLength: p().describe("Length of the body in bytes"),
		contentType: c().describe("Response Content-Type header"),
		finalUrl: c().describe("Final URL after redirects"),
	});
	u({
		data: u({}).passthrough().describe("Structured snapshot data"),
		text: c().describe("Plain text representation of the snapshot"),
	}),
		u({}),
		u({
			tabId: p(),
			url: c(),
			title: c(),
			contentScript: $e(["connected", "missing"]),
			domApis: $e(["ok", "blocked"]),
			mutationsReady: _(),
			hint: c().optional(),
			recovery: E(c()).optional(),
		});
	const Ba = Ua,
		Va = u({
			refId: G().describe("Element reference ID (e.g. e2)"),
			role: c().describe("ARIA role of the element"),
			tag: c().describe("HTML tag name"),
			name: c().optional().describe("Accessible name of the element"),
			text: c().optional().describe("Visible text content of the element"),
			value: c().optional().describe("Element value"),
			checked: _().optional().describe("Checked state"),
			disabled: _().optional().describe("Whether the element is disabled"),
			readOnly: _().optional().describe("Whether the element is read-only"),
			href: c().optional().describe("Absolute URL for link elements"),
			src: c().optional().describe("Absolute URL for image elements"),
			alt: c().optional().describe("Alternative text for image elements"),
			title: c().optional().describe("Title attribute"),
			parentRefId: G()
				.optional()
				.describe("Reference ID of the parent container element"),
			postId: c()
				.optional()
				.describe("Stable post identifier from data-post-id attribute"),
			permalink: c()
				.optional()
				.describe("Stable permalink URL from anchor element"),
			imageUrls: E(c())
				.optional()
				.describe("Image URLs contained within this element"),
		}),
		rt = u({
			text: c().describe("Plain text representation of the page"),
			nodes: E(Va).describe("Array of interactive nodes"),
			url: c().describe("Current page URL"),
			title: c().describe("Current page title"),
			viewport: u({
				width: p().describe("Viewport width in pixels"),
				height: p().describe("Viewport height in pixels"),
			}).describe("Viewport dimensions"),
			observationId: c()
				.optional()
				.describe(
					"Opaque ID of the observation lease granted by this snapshot. Pass to subsequent actions to prove they act on fresh observations.",
				),
		}),
		lr = u({
			refId: G().optional(),
			tag: c(),
			role: c().optional(),
			name: c().optional(),
			text: c().optional(),
			attributes: y(c()).optional().describe("All HTML attributes (raw)"),
			hidden: _().optional(),
			hiddenReason: $e([
				"display-none",
				"visibility-hidden",
				"aria-hidden",
				"opacity-zero",
				"hidden-attr",
				"inert",
			]).optional(),
			value: c().optional(),
			checked: _().optional(),
			disabled: _().optional(),
			readOnly: _().optional(),
			href: c().optional(),
			src: c().optional(),
			alt: c().optional(),
			accept: c()
				.optional()
				.describe("For input[type=file]: accepted MIME/extensions"),
			filesCount: p()
				.optional()
				.describe("For input[type=file]: selected file count"),
			children: E(On(() => lr))
				.optional()
				.describe("Nested descendants up to `depth`"),
		}),
		Wa = u({ nodes: E(lr), url: c(), title: c() }),
		dr = u({
			id: p().optional().describe("Tab ID"),
			tabId: p().optional().describe("Tab ID (added by runner)"),
			index: p().optional().describe("Tab index in the window"),
			windowId: p().optional().describe("Window ID"),
			url: c().optional().describe("Tab URL"),
			title: c().optional().describe("Tab title"),
			status: c().optional().describe("Tab status (loading or complete)"),
			active: _().optional().describe("Whether the tab is active"),
			pinned: _().optional().describe("Whether the tab is pinned"),
			highlighted: _().optional().describe("Whether the tab is highlighted"),
			incognito: _().optional().describe("Whether the tab is incognito"),
			favIconUrl: c().optional().describe("Favicon URL"),
			audible: _().optional().describe("Whether the tab is audible"),
			groupId: p().optional().describe("Group ID"),
			openerTabId: p().optional().describe("Opener tab ID"),
			discarded: _().optional().describe("Whether the tab is discarded"),
			autoDiscardable: _()
				.optional()
				.describe("Whether the tab is auto-discardable"),
			width: p().optional().describe("Tab width"),
			height: p().optional().describe("Tab height"),
			sessionId: c().optional().describe("Session ID"),
		}).passthrough(),
		Ha = E(dr),
		ur = u({
			id: p().optional().describe("Window ID"),
			focused: _().optional().describe("Whether the window is focused"),
			top: p().optional().describe("Window top position"),
			left: p().optional().describe("Window left position"),
			width: p().optional().describe("Window width"),
			height: p().optional().describe("Window height"),
			tabs: Ha.optional().describe("Array of tabs in the window"),
			incognito: _().optional().describe("Whether the window is incognito"),
			type: c().optional().describe("Window type"),
			state: c().optional().describe("Window state"),
			alwaysOnTop: _()
				.optional()
				.describe("Whether the window is always on top"),
			sessionId: c().optional().describe("Session ID"),
		}).passthrough();
	E(ur);
	const Ka = u({
		name: c().describe("Cookie name"),
		value: c().describe("Cookie value"),
		domain: c().optional().describe("Cookie domain"),
		hostOnly: _().optional().describe("Whether the cookie is host-only"),
		path: c().optional().describe("Cookie path"),
		secure: _().optional().describe("Whether the cookie is secure"),
		httpOnly: _().optional().describe("Whether the cookie is HTTP-only"),
		sameSite: c().optional().describe("SameSite policy"),
		session: _().optional().describe("Whether the cookie is a session cookie"),
		expirationDate: p()
			.optional()
			.describe("Expiration date as Unix timestamp"),
		storeId: c().optional().describe("Store ID"),
	}).nullable();
	E(Ka.nullable().unwrap());
	const za = u({
		id: c().describe("Bookmark ID"),
		parentId: c().optional().describe("Parent folder ID"),
		index: p().optional().describe("Bookmark index"),
		url: c().optional().describe("Bookmark URL"),
		title: c().describe("Bookmark title"),
		dateAdded: p().optional().describe("Date added"),
		dateGroupModified: p().optional().describe("Date group modified"),
		children: E(u({ id: c() }).passthrough())
			.optional()
			.describe("Child bookmarks"),
	}).passthrough();
	E(za);
	const Ga = u({
		id: c().describe("History item ID"),
		url: c().optional().describe("URL"),
		title: c().optional().describe("Title"),
		lastVisitTime: p().optional().describe("Last visit time"),
		visitCount: p().optional().describe("Visit count"),
		typedCount: p().optional().describe("Typed count"),
	}).passthrough();
	E(Ga);
	const Ja = u({
		frameId: p().describe("Frame ID"),
		result: v().optional().describe("Script result"),
	});
	E(Ja), c(), _(), I([c(), p()]), _();
	const Qa = u({
		id: p().optional().describe("Group ID"),
		collapsed: _().optional().describe("Whether the group is collapsed"),
		color: c().optional().describe("Group color"),
		title: c().optional().describe("Group title"),
		windowId: p().optional().describe("Window ID"),
	}).passthrough();
	E(Qa);
	const Xa = u({
			lastModified: p().optional().describe("Last modified time"),
			tab: dr.optional().describe("Tab info"),
			window: ur.optional().describe("Window info"),
		}).passthrough(),
		Ya = E(Xa),
		ei = u({
			deviceName: c().optional().describe("Device name"),
			sessions: Ya.optional().describe("Sessions"),
		}).passthrough();
	E(ei);
	const ti = u({
		id: p().optional().describe("Download ID"),
		url: c().optional().describe("Download URL"),
		filename: c().optional().describe("Filename"),
		startTime: c().optional().describe("Start time"),
		endTime: c().optional().describe("End time"),
		state: c().optional().describe("Download state"),
		danger: c().optional().describe("Danger type"),
		paused: _().optional().describe("Whether the download is paused"),
		error: c().optional().describe("Error message"),
		bytesReceived: p().optional().describe("Bytes received"),
		totalBytes: p().optional().describe("Total bytes"),
		fileSize: p().optional().describe("File size"),
		mime: c().optional().describe("MIME type"),
		incognito: _().optional().describe("Whether the download is incognito"),
		referrer: c().optional().describe("Referrer URL"),
		byExtensionId: c().optional().describe("Extension ID"),
		byExtensionName: c().optional().describe("Extension name"),
	}).passthrough();
	E(ti),
		p(),
		u({
			archName: c().describe("CPU architecture"),
			modelName: c().describe("CPU model"),
			numOfProcessors: p().describe("Number of processors"),
			features: E(c()).describe("CPU features"),
		}),
		u({
			capacity: p().describe("Total memory capacity"),
			availableCapacity: p().describe("Available memory capacity"),
		}),
		E(
			u({
				id: c().describe("Storage ID"),
				name: c().describe("Storage name"),
				type: c().describe("Storage type"),
				capacity: p().describe("Storage capacity"),
			}),
		);
	const V =
			"Returns a Promise; await before reading the result. For a cell's last line, use `page.snapshot()` without a leading await so the cell returns the settled value.",
		ri = [
			{
				action: "page_back",
				namespace: "page",
				name: "back",
				description: "Go back in the active tab",
				params: Kn,
				returns: C,
				paramTypes: [],
				returnDoc: "Navigation result",
				errorCode: "E_NO_TAB",
				example: "page.back()",
				handlerKey: "back",
			},
			{
				action: "page_click",
				namespace: "page",
				name: "click",
				description: "Click an element in the active tab",
				params: Gn,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label to click (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'click', refId? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.click({ refId: "e2" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						V,
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.click"],
				},
				handlerKey: "click",
			},
			{
				action: "page_fill",
				namespace: "page",
				name: "fill",
				description: "Fill an element in the active tab",
				params: Qn,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "value",
						type: "string",
						required: !1,
						description: "Value to fill (literal)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'fill', refId?, value? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.fill({ refId: "e2", value: "hello" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						V,
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.fill"],
				},
				handlerKey: "fill",
			},
			{
				action: "page_set_files",
				namespace: "page",
				name: "setFiles",
				description: "Attach files to a file input in the active tab",
				params: Xn,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "files",
						type: "{ name?: string, url?: string, path?: string, handle?: string, mimeType?: string }[]",
						required: !0,
						description:
							"Each entry uses exactly one of url, path (vfs), or handle (from page.fetch store:true)",
					},
				],
				returnDoc:
					"{ ok: true, action: 'setFiles', refId?, fileCount?, fileNames? }",
				errorCode: "E_MISSING_PARAM",
				example:
					'page.setFiles({ refId: "e3", files: [{ url: "https://example.com/photo.jpg", name: "photo.jpg" }] })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						V,
						"Target must be input[type=file]; prefer url, vfs path, or fetch handle — bytes are not passed through QuickJS",
						"Use page.fetch({ url, store: true }) then setFiles({ files: [{ handle }] }) for downloaded binaries",
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.setFiles", "page.fetch", "fs.writeBase64"],
				},
				handlerKey: "set_files",
			},
			{
				action: "page_type",
				namespace: "page",
				name: "type",
				description: "Type into an element in the active tab",
				params: ea,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "text",
						type: "string",
						required: !1,
						description: "Text to type (literal)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'type', refId?, value? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.type({ refId: "e2", text: "hello" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						V,
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.type"],
				},
				handlerKey: "type",
			},
			{
				action: "page_append",
				namespace: "page",
				name: "append",
				description: "Append text to an element in the active tab",
				params: ta,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "text",
						type: "string",
						required: !1,
						description: "Text to append (literal)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'append', refId?, value? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.append({ refId: "e2", text: " world" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
				},
				handlerKey: "append",
			},
			{
				action: "page_press",
				namespace: "page",
				name: "press",
				description: "Press a key in the active tab",
				params: ra,
				returns: C,
				fields: ["key"],
				paramTypes: [
					{
						name: "key",
						type: "string",
						required: !0,
						description: "Key to press (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'press', key? }",
				errorCode: "E_NO_TAB",
				example: 'page.press("Enter")',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.press"],
				},
				handlerKey: "press",
			},
			{
				action: "page_select",
				namespace: "page",
				name: "select",
				description: "Select an option in the active tab",
				params: na,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "value",
						type: "string",
						required: !1,
						description: "Option value to select (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'select', refId?, value? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.select({ refId: "e2", value: "option1" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.select"],
				},
				handlerKey: "select",
			},
			{
				action: "page_select_option",
				namespace: "page",
				name: "select_option",
				description:
					"Open a combobox (react-select/listbox) and click the option whose text matches value",
				params: aa,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "value",
						type: "string",
						required: !1,
						description:
							"Visible text of the option to select (matched case-insensitively)",
					},
				],
				returnDoc: "{ ok: true, action: 'select_option', refId?, value? }",
				errorCode: "E_NOT_FOUND",
				example: 'page.select_option({ refId: "e2", value: "Canada" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
						"Drives react-select and other ARIA combobox patterns: clicks the control to open, then clicks the matching [role='option']",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.select_option"],
				},
				handlerKey: "select_option",
			},
			{
				action: "page_check",
				namespace: "page",
				name: "check",
				description: "Check/uncheck an element in the active tab",
				params: ia,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "checked",
						type: "boolean",
						required: !1,
						description: "Whether to check or uncheck (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'check', refId?, checked? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.check({ refId: "e2", checked: true })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.check"],
				},
				handlerKey: "check",
			},
			{
				action: "page_hover",
				namespace: "page",
				name: "hover",
				description: "Hover over an element in the active tab",
				params: sa,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'hover', refId? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.hover({ refId: "e2" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.hover"],
				},
				handlerKey: "hover",
			},
			{
				action: "page_unhover",
				namespace: "page",
				name: "unhover",
				description: "Unhover in the active tab",
				params: oa,
				returns: C,
				paramTypes: [],
				returnDoc: "{ ok: true, action: 'unhover' }",
				errorCode: "E_NO_TAB",
				example: "page.unhover()",
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.unhover"],
				},
				handlerKey: "unhover",
			},
			{
				action: "page_scroll",
				namespace: "page",
				name: "scroll",
				description: "Scroll the active tab",
				params: ca,
				returns: C,
				fields: ["direction", "amount"],
				paramTypes: [
					{
						name: "direction",
						type: "string",
						required: !1,
						description: "Scroll direction (up or down) (literal)",
					},
					{
						name: "amount",
						type: "number",
						required: !1,
						description: "Scroll amount in pixels (literal)",
					},
				],
				returnDoc: "Scroll result",
				errorCode: "E_NO_TAB",
				example: 'page.scroll("down", 500)',
				handlerKey: "scroll",
			},
			{
				action: "page_scroll_to",
				namespace: "page",
				name: "scroll_to",
				description: "Scroll to an element in the active tab",
				params: la,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID to scroll to (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label to scroll to (label)",
					},
				],
				returnDoc: "Scroll to result",
				errorCode: "E_MISSING_PARAM",
				example: 'page.scroll_to({ refId: "e2" })',
				handlerKey: "scroll_to",
			},
			{
				action: "page_dblclick",
				namespace: "page",
				name: "dblclick",
				description: "Double-click an element in the active tab",
				params: da,
				returns: C,
				paramTypes: [
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'dblclick', refId? }",
				errorCode: "E_MISSING_PARAM",
				example: 'page.dblclick({ refId: "e2" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab is active and the content script is ready before mutating",
					],
					notes: [
						"Same content-script path as web.tab.*",
						"Always operates on the active tab; use web.tab.* if you need to target a specific tabId",
					],
					tags: ["mutation", "write"],
					relatedApis: ["web.tab.dblclick"],
				},
				handlerKey: "dblclick",
			},
			{
				action: "tab_click",
				namespace: "web.tab",
				name: "click",
				description: "Click in a tab",
				params: ba,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'click', refId? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.click({ tabId: 123, refId: "e2" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.click"],
				},
				handlerKey: "click",
			},
			{
				action: "tab_fill",
				namespace: "web.tab",
				name: "fill",
				description: "Fill in a tab",
				params: ga,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "value",
						type: "string",
						required: !1,
						description: "Value to fill (literal)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'fill', refId?, value? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.fill({ tabId: 123, refId: "e2", value: "hello" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.fill"],
				},
				handlerKey: "fill",
			},
			{
				action: "tab_set_files",
				namespace: "web.tab",
				name: "setFiles",
				description: "Attach files to a file input in a tab",
				params: ya,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "files",
						type: "{ name?: string, url?: string, path?: string, handle?: string, mimeType?: string }[]",
						required: !0,
						description:
							"Each entry uses exactly one of url, path (vfs), or handle",
					},
				],
				returnDoc:
					"{ ok: true, action: 'setFiles', refId?, fileCount?, fileNames? }",
				errorCode: "E_NO_TAB",
				example:
					'web.tab.setFiles({ tabId: 123, refId: "e3", files: [{ url: "https://example.com/photo.jpg" }] })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.setFiles"],
				},
				handlerKey: "set_files",
			},
			{
				action: "tab_scroll_to",
				namespace: "web.tab",
				name: "scroll_to",
				description: "Scroll to position in a tab",
				params: _a,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "x",
						type: "number",
						required: !1,
						description: "X coordinate (literal)",
					},
					{
						name: "y",
						type: "number",
						required: !1,
						description: "Y coordinate (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "Scroll to result",
				errorCode: "E_NO_TAB",
				example: 'web.tab.scroll_to({ tabId: 123, refId: "e2" })',
				handlerKey: "scroll_to",
			},
			{
				action: "tab_type",
				namespace: "web.tab",
				name: "type",
				description: "Type in a tab",
				params: wa,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "text",
						type: "string",
						required: !1,
						description: "Text to type (literal)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'type', refId?, value? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.type({ tabId: 123, refId: "e2", text: "hello" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.type"],
				},
				handlerKey: "type",
			},
			{
				action: "tab_press",
				namespace: "web.tab",
				name: "press",
				description: "Press a key in a tab",
				params: xa,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "key",
						type: "string",
						required: !1,
						description: "Key to press (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'press', key? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.press({ tabId: 123, key: "Enter" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.press"],
				},
				handlerKey: "press",
			},
			{
				action: "tab_select",
				namespace: "web.tab",
				name: "select",
				description: "Select an option in a tab",
				params: ka,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "value",
						type: "string",
						required: !1,
						description: "Option value to select (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'select', refId?, value? }",
				errorCode: "E_NO_TAB",
				example:
					'web.tab.select({ tabId: 123, refId: "e2", value: "option1" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.select"],
				},
				handlerKey: "select",
			},
			{
				action: "tab_select_option",
				namespace: "web.tab",
				name: "select_option",
				description:
					"Open a combobox (react-select/listbox) in a tab and click the option whose text matches value",
				params: Ia,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "value",
						type: "string",
						required: !1,
						description:
							"Visible text of the option to select (matched case-insensitively)",
					},
				],
				returnDoc: "{ ok: true, action: 'select_option', refId?, value? }",
				errorCode: "E_NO_TAB",
				example:
					'web.tab.select_option({ tabId: 123, refId: "e2", value: "Canada" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: [
						"Explicit tabId required; same handlers as page.*",
						"Drives react-select and other ARIA combobox patterns: clicks the control to open, then clicks the matching [role='option']",
					],
					tags: ["mutation", "write"],
					relatedApis: ["page.select_option"],
				},
				handlerKey: "select_option",
			},
			{
				action: "tab_check",
				namespace: "web.tab",
				name: "check",
				description: "Check/uncheck in a tab",
				params: Ta,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
					{
						name: "checked",
						type: "boolean",
						required: !1,
						description: "Whether to check or uncheck (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'check', refId?, checked? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.check({ tabId: 123, refId: "e2", checked: true })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.check"],
				},
				handlerKey: "check",
			},
			{
				action: "tab_hover",
				namespace: "web.tab",
				name: "hover",
				description: "Hover in a tab",
				params: Sa,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'hover', refId? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.hover({ tabId: 123, refId: "e2" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.hover"],
				},
				handlerKey: "hover",
			},
			{
				action: "tab_unhover",
				namespace: "web.tab",
				name: "unhover",
				description: "Unhover in a tab",
				params: Ea,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
				],
				returnDoc: "{ ok: true, action: 'unhover' }",
				errorCode: "E_NO_TAB",
				example: "web.tab.unhover({ tabId: 123 })",
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.unhover"],
				},
				handlerKey: "unhover",
			},
			{
				action: "tab_scroll",
				namespace: "web.tab",
				name: "scroll",
				description: "Scroll in a tab",
				params: Aa,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "direction",
						type: "string",
						required: !1,
						description: "Scroll direction (up or down) (literal)",
					},
					{
						name: "amount",
						type: "number",
						required: !1,
						description: "Scroll amount in pixels (literal)",
					},
				],
				returnDoc: "Scroll result",
				errorCode: "E_NO_TAB",
				example:
					'web.tab.scroll({ tabId: 123, direction: "down", amount: 500 })',
				handlerKey: "scroll",
			},
			{
				action: "tab_dblclick",
				namespace: "web.tab",
				name: "dblclick",
				description: "Double-click in a tab",
				params: Ca,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "refId",
						type: "string",
						required: !1,
						description: "Element reference ID (refId)",
					},
					{
						name: "label",
						type: "string",
						required: !1,
						description: "Element label (label)",
					},
				],
				returnDoc: "{ ok: true, action: 'dblclick', refId? }",
				errorCode: "E_NO_TAB",
				example: 'web.tab.dblclick({ tabId: 123, refId: "e2" })',
				agentMeta: {
					prerequisites: [
						"Ensure the target tab exists and the content script is ready before mutating",
					],
					notes: ["Explicit tabId required; same handlers as page.*"],
					tags: ["mutation", "write"],
					relatedApis: ["page.dblclick"],
				},
				handlerKey: "dblclick",
			},
			{
				action: "tab_back",
				namespace: "web.tab",
				name: "back",
				description: "Go back in a tab",
				params: Oa,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
				],
				returnDoc: "Back result",
				errorCode: "E_NO_TAB",
				example: "web.tab.back({ tabId: 123 })",
				handlerKey: "back",
			},
			{
				action: "page_forward",
				namespace: "page",
				name: "forward",
				description: "Go forward in the active tab",
				params: zn,
				returns: C,
				paramTypes: [],
				returnDoc: "Navigation result",
				errorCode: "E_NO_TAB",
				example: "page.forward()",
				handlerKey: "forward",
			},
			{
				action: "page_snapshot",
				namespace: "page",
				name: "snapshot",
				description: "Capture full DOM snapshot",
				params: La,
				returns: c(),
				paramTypes: [
					{
						name: "max_nodes",
						type: "number",
						required: !1,
						description: "Maximum nodes to include (literal)",
					},
					{
						name: "options",
						type: "{ max_nodes?: number }",
						required: !1,
						description: "Snapshot options (literal)",
					},
				],
				returnDoc: "Snapshot text",
				errorCode: "E_SNAPSHOT",
				example: "page.snapshot()",
				agentMeta: {
					notes: [V, "Content-script path; same refIds as mutations"],
					tags: ["snapshot", "read"],
					relatedApis: ["page.snapshot_data", "web.tab.snapshot"],
				},
				handlerKey: "snapshot_text",
			},
			{
				action: "page_snapshot_text",
				namespace: "page",
				name: "snapshot_text",
				description: "Capture DOM snapshot and return text representation",
				params: $a,
				returns: c(),
				paramTypes: [
					{
						name: "max_nodes",
						type: "number",
						required: !1,
						description: "Maximum nodes to include (literal)",
					},
				],
				returnDoc: "Snapshot text",
				errorCode: "E_SNAPSHOT",
				example: "page.snapshot_text()",
				handlerKey: "snapshot_text",
			},
			{
				action: "page_snapshot_data",
				namespace: "page",
				name: "snapshot_data",
				description: "Get page snapshot data",
				params: ja,
				returns: rt,
				paramTypes: [
					{
						name: "max_nodes",
						type: "number",
						required: !1,
						description: "Maximum nodes to include (literal)",
					},
				],
				returnDoc: "{ text, nodes, url, title, viewport }",
				errorCode: "E_SNAPSHOT",
				example: "page.snapshot_data()",
				agentMeta: {
					notes: [
						V,
						"Content-script path; nodes include refId for targeting",
						"After mutations, call snapshot_data() again to verify state",
					],
					tags: ["snapshot", "read"],
					relatedApis: ["page.click", "web.tab.snapshot_data"],
				},
				handlerKey: "snapshot",
			},
			{
				action: "page_snapshot_query",
				namespace: "page",
				name: "snapshot_query",
				description:
					"Query page snapshot with semantic filtering by role, tag, text, name, etc.",
				params: or,
				returns: rt,
				paramTypes: [
					{
						name: "filter",
						type: "{ role?: string | string[], tag?: string | string[], text?: string, name?: string, interactiveOnly?: boolean, href?: string, src?: string, limit?: number }",
						required: !1,
						description: "Semantic filter criteria (literal)",
					},
					{
						name: "max_nodes",
						type: "number",
						required: !1,
						description: "Maximum nodes to collect before filtering (literal)",
					},
				],
				returnDoc: "{ text, nodes (filtered), url, title, viewport }",
				errorCode: "E_SNAPSHOT",
				example: 'page.snapshot_query({ filter: { role: "button" } })',
				agentMeta: {
					notes: [
						V,
						"Content-script path; filters nodes by role, tag, text, name, interactiveOnly, href, src",
						"More efficient than page.snapshot_data() when only specific elements are needed",
					],
					tags: ["snapshot", "read"],
					relatedApis: ["page.snapshot_data", "page.find"],
				},
				handlerKey: "snapshot_query",
			},
			{
				action: "page_find",
				namespace: "page",
				name: "find",
				description: "Find elements in the active tab using a CSS selector",
				params: ua,
				returns: E(
					u({
						refId: G(),
						role: c(),
						tag: c(),
						name: c().optional(),
						text: c().optional(),
						value: c().optional(),
						checked: _().optional(),
						disabled: _().optional(),
						readOnly: _().optional(),
						href: c().optional(),
						src: c().optional(),
						alt: c().optional(),
						title: c().optional(),
						parentRefId: G().optional(),
					}),
				),
				aliases: [{ namespace: "page", name: "query" }],
				fields: ["selector"],
				paramTypes: [
					{
						name: "selector",
						type: "string",
						required: !0,
						description: "CSS selector to find elements (selector)",
					},
				],
				returnDoc:
					"Array of elements with refId, role, name, href/src, alt, and parentRefId",
				errorCode: "E_NO_TAB",
				example: 'page.find("h1")',
				agentMeta: {
					notes: [
						"Assigns data-ref-id on matched elements when missing so results include actionable refIds",
					],
					tags: ["read"],
				},
				handlerKey: "find",
			},
			{
				action: "page_dom",
				namespace: "page",
				name: "dom",
				description:
					"Introspect raw DOM subtree by CSS selector — bypasses the curated snapshot's visibility filter. Read-only. Use when page.snapshot/find hide the element you need (e.g. hidden file inputs, shadowed widgets, aria-hidden regions).",
				params: fa,
				returns: Wa,
				paramTypes: [
					{
						name: "selector",
						type: "string",
						required: !0,
						description: "CSS selector for root element(s)",
					},
					{
						name: "depth",
						type: "number",
						required: !1,
						description: "Descendant levels (default 2, max 10)",
					},
					{
						name: "includeHidden",
						type: "boolean",
						required: !1,
						description: "Include hidden elements (default true)",
					},
				],
				returnDoc:
					"{ nodes: [{ refId?, tag, role?, name?, attributes?, hidden?, hiddenReason?, accept?, filesCount?, children? }], url, title }",
				errorCode: "E_NO_TAB",
				example: 'page.dom({ selector: "input[type=file]", depth: 0 })',
				agentMeta: {
					prerequisites: ["Active tab with content script ready"],
					notes: [
						V,
						"Read-only: returns DOM structure, never executes code or mutates the page",
						"Bypasses the snapshot visibility filter — use to find hidden/filtered elements the curated snapshot omits",
						"Assigns refIds to returned elements so subsequent page.setFiles/click/fill can target them",
						"Prefer page.snapshot for normal navigation; use page.dom only when the snapshot is insufficient",
					],
					tags: ["read"],
					relatedApis: ["page.find", "page.snapshot_data", "page.setFiles"],
				},
				handlerKey: "dom",
			},
			{
				action: "page_wait_for",
				namespace: "page",
				name: "wait_for",
				description: "Wait for a selector in the active tab",
				params: pa,
				returns: _(),
				fields: ["selector", "timeout"],
				paramTypes: [
					{
						name: "selector",
						type: "string",
						required: !0,
						description: "CSS selector to wait for (selector)",
					},
					{
						name: "timeout",
						type: "number",
						required: !1,
						description: "Timeout in milliseconds (literal)",
					},
				],
				returnDoc: "true",
				errorCode: "E_TIMEOUT",
				errorCategory: "timeout",
				example: 'page.wait_for("#submit", 5000)',
				agentMeta: { notes: [V], tags: ["read"] },
				handlerKey: "wait_for",
			},
			{
				action: "page_extract",
				namespace: "page",
				name: "extract",
				description: "Extract data from the active tab",
				params: ma,
				returns: u({
					title: c().optional(),
					url: c().optional(),
					headings: E(u({ tag: c(), text: c() })).optional(),
					links: E(u({ href: c().nullable(), text: c() })).optional(),
					text: c().optional(),
				}).passthrough(),
				fields: ["fields"],
				paramTypes: [
					{
						name: "fields",
						type: "array",
						required: !0,
						description:
							"Array of fields to extract (title, url, headings, links, text)",
					},
				],
				returnDoc: "Extracted data",
				errorCode: "E_NO_TAB",
				example: 'page.extract(["title", "url"])',
				agentMeta: { notes: [V], tags: ["read"] },
				handlerKey: "extract",
			},
			{
				action: "page_fetch",
				namespace: "page",
				name: "fetch",
				description: "Fetch in the active tab",
				params: Wn,
				returns: cr,
				fields: ["url", "options"],
				paramTypes: [
					{
						name: "url",
						type: "string",
						required: !1,
						description: "URL to fetch (url)",
					},
					{
						name: "options",
						type: "{ method?: string, headers?: { [key: string]: string }, body?: string }",
						required: !1,
						description: "Fetch options (literal)",
					},
				],
				returnDoc: "DTO with `{ body, headers, ok, status }`",
				errorCode: "E_NO_TAB",
				example: 'page.fetch({ url: "https://api.example.com/data" })',
				agentMeta: {
					notes: [
						V,
						"Runtime binary globals available: Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, atob, btoa",
						"For binary responses bodyEncoding is 'base64'; use atob() or fs.writeBase64 to handle bytes",
					],
					tags: ["read"],
				},
				handlerKey: "fetch",
			},
			{
				action: "tab_forward",
				namespace: "web.tab",
				name: "forward",
				description: "Go forward in a tab",
				params: Ra,
				returns: C,
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
				],
				returnDoc: "Forward result",
				errorCode: "E_NO_TAB",
				example: "web.tab.forward({ tabId: 123 })",
				handlerKey: "forward",
			},
			{
				action: "tab_snapshot",
				namespace: "web.tab",
				name: "snapshot",
				description: "Get tab snapshot",
				params: Ma,
				returns: c(),
				fields: ["tabId"],
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "max_nodes",
						type: "number",
						required: !1,
						description: "Maximum nodes to include (literal)",
					},
				],
				returnDoc: "Snapshot text",
				errorCode: "E_SNAPSHOT",
				example: "web.tab.snapshot({ tabId: 123 })",
				handlerKey: "snapshot_text",
			},
			{
				action: "tab_snapshot_text",
				namespace: "web.tab",
				name: "snapshot_text",
				description: "Get tab snapshot text",
				params: qa,
				returns: c(),
				fields: ["tabId"],
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
				],
				returnDoc: "Snapshot text",
				errorCode: "E_SNAPSHOT",
				example: "web.tab.snapshot_text({ tabId: 123 })",
				handlerKey: "snapshot_text",
			},
			{
				action: "tab_snapshot_data",
				namespace: "web.tab",
				name: "snapshot_data",
				description: "Get tab snapshot data",
				params: Pa,
				returns: rt,
				fields: ["tabId"],
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
				],
				returnDoc: "Snapshot data",
				errorCode: "E_SNAPSHOT",
				example: "web.tab.snapshot_data({ tabId: 123 })",
				handlerKey: "snapshot",
			},
			{
				action: "tab_snapshot_query",
				namespace: "web.tab",
				name: "snapshot_query",
				description:
					"Query tab snapshot with semantic filtering by role, tag, text, name, etc.",
				params: Za,
				returns: rt,
				fields: ["tabId"],
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "filter",
						type: "{ role?: string | string[], tag?: string | string[], text?: string, name?: string, interactiveOnly?: boolean, href?: string, src?: string, limit?: number }",
						required: !1,
						description: "Semantic filter criteria (literal)",
					},
					{
						name: "max_nodes",
						type: "number",
						required: !1,
						description: "Maximum nodes to collect before filtering (literal)",
					},
				],
				returnDoc: "{ text, nodes (filtered), url, title, viewport }",
				errorCode: "E_SNAPSHOT",
				example:
					'web.tab.snapshot_query({ tabId: 123, filter: { role: "button" } })',
				agentMeta: {
					notes: [
						"Explicit tabId required; same handler as page.snapshot_query",
						"Filters nodes by role, tag, text, name, interactiveOnly, href, src",
					],
					tags: ["snapshot", "read"],
					relatedApis: ["page.snapshot_query"],
				},
				handlerKey: "snapshot_query",
			},
			{
				action: "tab_fetch",
				namespace: "web.tab",
				name: "fetch",
				description: "Fetch in a tab",
				params: Da,
				returns: cr,
				fields: ["tabId", "url", "options"],
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "url",
						type: "string",
						required: !1,
						description: "URL to fetch",
					},
				],
				returnDoc: "Fetch result DTO",
				errorCode: "E_NO_TAB",
				example:
					'web.tab.fetch({ tabId: 123, url: "https://api.example.com/data" })',
				handlerKey: "fetch",
			},
			{
				action: "tab_evaluate",
				namespace: "web.tab",
				name: "evaluate",
				description: "Evaluate script in a tab (content-script context)",
				params: Na,
				returns: Ba,
				fields: ["tabId", "script"],
				paramTypes: [
					{
						name: "tabId",
						type: "number",
						required: !0,
						description: "Tab ID (literal)",
					},
					{
						name: "script",
						type: "string",
						required: !1,
						description: "Script to evaluate (literal)",
					},
				],
				returnDoc: "Evaluation result",
				errorCode: "E_NO_TAB",
				example: 'web.tab.evaluate({ tabId: 123, script: "document.title" })',
				agentMeta: {
					notes: [
						"Runs in content-script isolated world, not MAIN-world injection",
						"For MAIN-world access use chrome.scripting.executeScript from a cell",
					],
					tags: ["read"],
				},
				handlerKey: "evaluate",
			},
		];
	function ni() {
		return [
			{
				registryAction: "ping",
				handlerKey: "ping",
				params: u({}),
				returns: u({ ok: _() }),
			},
		];
	}
	const ai = new Set(["page_set_files", "tab_set_files"]);
	function ii() {
		return ri.map((t) => ({
			registryAction: t.action,
			handlerKey: t.handlerKey,
			params: ai.has(t.action)
				? t.action === "tab_set_files"
					? va
					: Yn
				: t.params,
			returns: t.returns,
		}));
	}
	if ((gr(), window.__jsNotebookContentScriptInjected))
		throw new Error("Content script already injected");
	(window.__jsNotebookContentScriptInjected = !0), Pn([...ii(), ...ni()]), Zn();
})();
