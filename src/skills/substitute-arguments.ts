import { parseArgumentNames } from "./parse-skill-md";

export function parseArguments(args: string): string[] {
	if (!args?.trim()) return [];
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < args.length; i++) {
		const ch = args[i] ?? "";
		if (quote) {
			if (ch === quote) {
				quote = null;
			} else {
				current += ch;
			}
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}
	if (current) tokens.push(current);
	return tokens;
}

export function substituteArguments(
	content: string,
	args: string | undefined,
	appendIfNoPlaceholder = true,
	argumentNames: string[] = [],
): string {
	if (args === undefined || args === null) return content;

	const parsedArgs = parseArguments(args);
	let result = content;
	const original = content;

	for (let i = 0; i < argumentNames.length; i++) {
		const name = argumentNames[i];
		if (!name) continue;
		result = result.replace(
			new RegExp(`\\$${name}(?![\\[\\w])`, "g"),
			parsedArgs[i] ?? "",
		);
	}

	result = result.replace(/\$ARGUMENTS\[(\d+)\]/g, (_match, index: string) => {
		const idx = Number.parseInt(index, 10);
		return parsedArgs[idx] ?? "";
	});

	result = result.replace(/\$(\d+)(?![[\w])/g, (_match, index: string) => {
		const idx = Number.parseInt(index, 10);
		return parsedArgs[idx] ?? "";
	});

	result = result.replace(/\$ARGUMENTS/g, args);

	const hadPlaceholder =
		original !== result || /\$ARGUMENTS|\$\d+|\$[a-zA-Z_]/.test(original);

	if (!hadPlaceholder && appendIfNoPlaceholder && args.trim()) {
		return `${result}\n\nUser arguments: ${args}`;
	}

	return result;
}

export { parseArgumentNames };
