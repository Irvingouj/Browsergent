export interface ParsedTraceInput {
	kind: "js" | "raw";
	text: string;
	preview: string;
}

export function parseTraceInput(
	toolName: string,
	toolInput?: string,
): ParsedTraceInput {
	if (toolName === "run_js" && toolInput) {
		try {
			const parsed = JSON.parse(toolInput);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				typeof parsed.code !== "string"
			) {
				throw new Error("missing code");
			}
			return {
				kind: "js",
				text: parsed.code,
				preview: firstMeaningfulLine(parsed.code),
			};
		} catch {
			// fallthrough to raw
		}
	}
	return {
		kind: "raw",
		text: toolInput ?? "",
		preview: (toolInput ?? "").slice(0, 60),
	};
}

function truncate(s: string, n = 60): string {
	return s.length > n ? `${s.slice(0, n)}…` : s;
}

function firstMeaningfulLine(code: string): string {
	const lines = code.split("\n");
	let inBlockComment = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		if (inBlockComment) {
			const endIndex = trimmed.indexOf("*/");
			if (endIndex !== -1) {
				inBlockComment = false;
				const after = trimmed.slice(endIndex + 2).trim();
				if (after) return truncate(after);
			}
			continue;
		}

		if (trimmed.startsWith("//")) continue;

		if (trimmed.startsWith("/*")) {
			const endIndex = trimmed.indexOf("*/");
			if (endIndex !== -1) {
				const after = trimmed.slice(endIndex + 2).trim();
				if (after) return truncate(after);
			} else {
				inBlockComment = true;
			}
			continue;
		}

		return truncate(trimmed);
	}
	return "(empty)";
}
