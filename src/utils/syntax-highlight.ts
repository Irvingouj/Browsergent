interface Token {
	start: number;
	end: number;
	type: string;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

const JS_PATTERNS: Array<[RegExp, string]> = [
	[
		/\b(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|new|this|typeof|instanceof|try|catch|throw|yield|break|continue|switch|case|default|of|in|void|delete|extends|super|static|get|set|with|debugger)\b/g,
		"keyword",
	],
	[
		/\b(true|false|null|undefined|NaN|Infinity|globalThis|window|document|console|Math|JSON|Date|Array|Object|String|Number|Boolean|Promise|Set|Map|Symbol|RegExp)\b/g,
		"builtin",
	],
	[/\b(function\s+)([a-zA-Z_]\w*)\b/g, "function-def"],
	[/\b([a-zA-Z_]\w*)\s*(?=\()/g, "function"],
	[
		/\b0[xX][0-9a-fA-F]+\b|\b0[oO]?[0-7]+\b|\b0[bB][01]+\b|\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g,
		"number",
	],
	[
		/\b(class|function|const|let|var|async|await|get|set|static)\s+([a-zA-Z_]\w*)\b/g,
		"identifier-def",
	],
];

const JS_COMMENT_PATTERNS: Array<[RegExp, string]> = [
	[/(\/\/.*$)/gm, "comment"],
	[/(\/\*[\s\S]*?\*\/)/g, "comment"],
];

const JS_STRING_PATTERNS: Array<[RegExp, string]> = [
	[/(`(?:\\.|[^`\\])*`)/g, "string"],
	[/("(?:\\.|[^"\\])*")/g, "string"],
	[/('(?:\\.|[^'\\])*')/g, "string"],
];

const LUA_PATTERNS: Array<[RegExp, string]> = [
	[
		/\b(local|function|return|if|then|else|elseif|end|for|while|do|repeat|until|and|or|not|nil|true|false|in|break|goto|require|module|package)\b/g,
		"keyword",
	],
	[/\b([a-zA-Z_]\w*)\s*(?=[(:])/g, "function"],
	[/\b\d+(\.\d+)?\b/g, "number"],
];

const LUA_COMMENT_PATTERNS: Array<[RegExp, string]> = [
	[/(--\[\[[\s\S]*?\]\])/g, "comment"],
	[/(--.*$)/gm, "comment"],
];

const LUA_STRING_PATTERNS: Array<[RegExp, string]> = [
	[/("(?:\\.|[^"\\])*")/g, "string"],
	[/('(?:\\.|[^'\\])*')/g, "string"],
	[/(\[\[(?:[\s\S]*?)\]\])/g, "string"],
];

function getPatterns(lang: string): Array<[RegExp, string]> {
	const lower = lang.toLowerCase();
	if (
		lower === "javascript" ||
		lower === "js" ||
		lower === "ts" ||
		lower === "typescript"
	) {
		return [...JS_COMMENT_PATTERNS, ...JS_STRING_PATTERNS, ...JS_PATTERNS];
	}
	if (lower === "lua") {
		return [...LUA_COMMENT_PATTERNS, ...LUA_STRING_PATTERNS, ...LUA_PATTERNS];
	}
	return [];
}

function collectTokens(
	code: string,
	patterns: Array<[RegExp, string]>,
): Token[] {
	const tokens: Token[] = [];
	for (const [regex, type] of patterns) {
		regex.lastIndex = 0;
		let match: RegExpExecArray | null = regex.exec(code);
		while (match !== null) {
			tokens.push({
				start: match.index,
				end: match.index + match[0].length,
				type,
			});
			match = regex.exec(code);
		}
	}
	return tokens;
}

function resolveOverlaps(tokens: Token[]): Token[] {
	tokens.sort((a, b) => a.start - b.start || b.end - a.end);
	const resolved: Token[] = [];
	for (const t of tokens) {
		const last = resolved[resolved.length - 1];
		if (!last || t.start >= last.end) {
			resolved.push(t);
		}
	}
	return resolved;
}

export function highlightCode(code: string, lang: string): string {
	const patterns = getPatterns(lang);
	if (patterns.length === 0) return escapeHtml(code);

	const tokens = resolveOverlaps(collectTokens(code, patterns));

	let html = "";
	let pos = 0;
	for (const t of tokens) {
		if (pos < t.start) {
			html += escapeHtml(code.slice(pos, t.start));
		}
		html += `<span class="token-${t.type}">${escapeHtml(code.slice(t.start, t.end))}</span>`;
		pos = t.end;
	}
	if (pos < code.length) {
		html += escapeHtml(code.slice(pos));
	}
	return html;
}

export function formatLangLabel(lang: string): string {
	const map: Record<string, string> = {
		js: "javascript",
		ts: "typescript",
		py: "python",
		sh: "bash",
		shell: "bash",
		md: "markdown",
		html: "html",
		css: "css",
		json: "json",
		yaml: "yaml",
		yml: "yaml",
		lua: "lua",
		rust: "rust",
		go: "go",
		c: "c",
		cpp: "c++",
		cxx: "c++",
	};
	return map[lang.toLowerCase()] || lang;
}
