/**
 * Minimal RFC 4180 CSV parse + serialize.
 *
 * No dependency — the format is small and the repo forbids adding deps when
 * the existing stack can solve it. Handles quoted fields, embedded quotes
 * (doubled), embedded newlines, and CRLF/CR/LF line endings.
 */

/** A CSV document as a 2D array of cells. Row 0 is the header when present. */
export type CsvRows = readonly (readonly string[])[];

/** A cell edit: replace the value at (row, col). */
export interface CsvCellEdit {
	readonly row: number;
	readonly col: number;
	readonly value: string;
}

/**
 * Parse CSV text into rows of cells.
 *
 * Accepts CR, LF, or CRLF line endings. A trailing line break is not an empty
 * trailing row. Fields may be quoted with `"`, doubled `""` = literal `"`.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	let i = 0;

	// Normalize line endings once: CRLF and CR -> LF. Quoted fields preserve
	// their embedded newlines because we read the original below.
	const n = text.length;

	while (i < n) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}

		// Not in quotes.
		if (ch === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (ch === ",") {
			row.push(field);
			field = "";
			i++;
			continue;
		}
		if (ch === "\r") {
			// CRLF or lone CR -> row end.
			row.push(field);
			field = "";
			rows.push(row);
			row = [];
			if (text[i + 1] === "\n") i += 2;
			else i++;
			continue;
		}
		if (ch === "\n") {
			row.push(field);
			field = "";
			rows.push(row);
			row = [];
			i++;
			continue;
		}
		field += ch;
		i++;
	}

	// Flush the last field/row if the text didn't end with a line break.
	if (field.length > 0 || row.length > 0 || inQuotes) {
		row.push(field);
		rows.push(row);
	}
	// Drop a trailing empty row produced by a final line break (already handled
	// above by the break branches) — nothing else to do.

	return rows;
}

/**
 * Quote a single field per RFC 4180: wrap in quotes if it contains a quote,
 * comma, CR, or LF; double embedded quotes.
 */
export function serializeCsvField(value: string): string {
	if (value === "") return "";
	const needsQuote = /["\r\n,]/.test(value);
	if (!needsQuote) return value;
	return `"${value.replace(/"/g, '""')}"`;
}

/** Serialize rows to CSV text with CRLF line endings and a trailing newline. */
export function serializeCsv(rows: CsvRows): string {
	if (rows.length === 0) return "";
	const lines = rows.map((r) => r.map(serializeCsvField).join(","));
	return `${lines.join("\r\n")}\r\n`;
}

/** Apply a single cell edit to a copy of the rows. Bounds are caller's job. */
export function applyCsvEdit(rows: CsvRows, edit: CsvCellEdit): string[][] {
	return rows.map((r, ri) =>
		ri === edit.row
			? r.map((c, ci) => (ci === edit.col ? edit.value : c))
			: [...r],
	);
}
