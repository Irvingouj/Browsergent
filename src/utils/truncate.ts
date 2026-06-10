export function truncateWithMarker(
	content: string,
	maxChars: number,
	marker: string,
): string {
	if (content.length <= maxChars) return content;
	const available = maxChars - marker.length;
	const head = Math.floor(available / 2);
	const tail = available - head;
	return `${content.slice(0, head)}${marker}${content.slice(-tail)}`;
}
