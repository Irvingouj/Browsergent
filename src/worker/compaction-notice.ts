export function formatCompactionNotice(input: {
	summary: string;
	messageCount: number;
	extractive: boolean;
	compactionNumber: number;
}): string {
	const lines = [
		`Context compacted · ${input.messageCount} messages summarized`,
	];
	if (input.extractive) {
		lines.push("summary model unavailable — local extract used");
	}
	lines.push("", input.summary);
	if (input.compactionNumber >= 3) {
		lines.push(
			"",
			"Long sessions with repeated compaction reduce accuracy. Consider starting a new session.",
		);
	}
	return lines.join("\n");
}
