import type { FsClient } from "../../skills/skill-types";
import { newPathForRename } from "./paths";

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) return 0;
	let count = 0;
	let i = haystack.indexOf(needle);
	while (i !== -1) {
		count++;
		i = haystack.indexOf(needle, i + needle.length);
	}
	return count;
}

export interface EditFileResult {
	occurrences: number;
	bytes: number;
}

/** Edit a file by replacing old_string with new_string, with match-count guards. */
export async function editFile(
	fs: FsClient,
	path: string,
	oldString: string,
	newString: string,
	replaceAll: boolean,
): Promise<EditFileResult> {
	if (oldString === newString) {
		throw new Error("old_string and new_string must differ");
	}
	if (oldString.length === 0) {
		throw new Error("old_string must not be empty");
	}

	const { data: original } = await fs.readText(path);
	const occurrences = countOccurrences(original, oldString);
	if (occurrences === 0) {
		throw new Error("old_string not found in file");
	}
	if (occurrences > 1 && !replaceAll) {
		throw new Error(
			`old_string matches ${occurrences} times; provide more context or set replace_all=true`,
		);
	}

	const updated = replaceAll
		? original.split(oldString).join(newString)
		: original.replace(oldString, newString);

	await fs.writeText(path, updated);
	return { occurrences: replaceAll ? occurrences : 1, bytes: updated.length };
}

export { newPathForRename };
