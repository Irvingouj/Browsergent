export interface FzfMatchable {
	id: string;
	label: string;
	description: string;
}

function fzfScore(query: string, target: string): number | null {
	const q = query.toLowerCase();
	const t = target.toLowerCase();
	if (!q) return 0;

	let score = 0;
	let queryIndex = 0;
	let prevMatchIndex = -1;
	let consecutive = 0;

	for (let i = 0; i < t.length && queryIndex < q.length; i++) {
		if (t[i] !== q[queryIndex]) continue;

		const isWordStart = i === 0 || /[\s:/_-]/.test(t[i - 1] ?? "");
		if (prevMatchIndex === i - 1) {
			consecutive++;
			score += 5 + consecutive;
		} else {
			consecutive = 0;
			score += isWordStart ? 8 : 2;
			if (prevMatchIndex >= 0) {
				score -= i - prevMatchIndex - 1;
			}
		}

		prevMatchIndex = i;
		queryIndex++;
	}

	return queryIndex === q.length ? score - t.length * 0.01 : null;
}

export function scoreFzfMatch(
	query: string,
	label: string,
	description: string,
): number | null {
	const trimmed = query.trim();
	if (!trimmed) return 0;

	const labelScore = fzfScore(trimmed, label);
	const descriptionScore = fzfScore(trimmed, description);
	if (labelScore === null && descriptionScore === null) return null;
	if (labelScore === null) return descriptionScore;
	if (descriptionScore === null) return labelScore;
	return Math.max(labelScore + 2, descriptionScore);
}

export function rankFzfItems<T extends FzfMatchable>(
	items: ReadonlyArray<T>,
	query: string,
): T[] {
	const trimmed = query.trim();
	if (!trimmed) {
		return [...items].sort((a, b) => a.label.localeCompare(b.label));
	}

	const ranked: Array<{ item: T; score: number }> = [];
	for (const item of items) {
		const score = scoreFzfMatch(trimmed, item.label, item.description);
		if (score !== null) {
			ranked.push({ item, score });
		}
	}

	return ranked
		.sort(
			(a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label),
		)
		.map((entry) => entry.item);
}
