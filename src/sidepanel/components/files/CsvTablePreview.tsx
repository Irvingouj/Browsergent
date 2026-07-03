import { useEffect, useMemo, useState } from "preact/hooks";
import type { FilesController } from "../../../controllers/files";
import { applyCsvEdit, parseCsv, serializeCsv } from "../../../utils/csv";
import { hasUrl } from "../../../utils/linkify";
import { EditablePreviewShell } from "./EditablePreviewShell";

interface CsvTablePreviewProps {
	/** Raw CSV text loaded from the file. */
	content: string;
	/** File path, used to persist edits. */
	path: string;
	filesController: FilesController;
}

/**
 * Editable CSV table. Renders the first row as a header; cells are inputs.
 * Edits are staged in local state; Save (in the shared shell) commits to FS,
 * Copy writes the serialized CSV to the clipboard.
 */
export const CsvTablePreview = ({
	content,
	path,
	filesController,
}: CsvTablePreviewProps) => {
	const initial = useMemo(() => parseCsv(content), [content]);
	const [rows, setRows] = useState<string[][]>(() =>
		initial.map((r) => [...r]),
	);
	const [dirty, setDirty] = useState(false);

	// Re-seed when the underlying file content changes (e.g. file switch).
	useEffect(() => {
		setRows(initial.map((r) => [...r]));
		setDirty(false);
	}, [initial]);

	const header = rows[0] ?? [];
	const body = rows.slice(1);

	const setCell = (row: number, col: number, value: string) => {
		setRows((prev) => applyCsvEdit(prev, { row, col, value }));
		setDirty(true);
	};

	// Column count is the max row length so ragged rows don't truncate.
	const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);

	return (
		<EditablePreviewShell
			ariaLabel="CSV preview"
			getContent={() => serializeCsv(rows)}
			dirty={dirty}
			onSave={(c) => filesController.writeFile(path, c)}
		>
			<div class="h-full overflow-auto border border-border rounded-md">
				<table class="w-full text-xs font-mono border-collapse">
					<thead class="sticky top-0 z-10 bg-bg-surface border-b border-border">
						<tr>
							<th
								scope="col"
								class="w-8 px-xs py-[2px] text-text-dim text-right border-r border-border"
							>
								<span class="sr-only">Row</span>#
							</th>
							{Array.from({ length: colCount }, (_, c) => (
								<th
									key={c}
									class="px-xs py-[2px] text-left text-text-muted font-semibold border-r border-border last:border-r-0 min-w-[80px]"
								>
									{header[c] ?? ""}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{body.map((row, ri) => (
							<tr
								key={ri}
								class="odd:bg-bg-base even:bg-bg-surface/40 hover:bg-accent-soft/40"
							>
								<td class="px-xs py-[2px] text-right text-text-dim border-r border-border select-none">
									{ri + 1}
								</td>
								{Array.from({ length: colCount }, (_, c) => (
									<td
										key={c}
										class="border-r border-border last:border-r-0 p-0"
									>
										<CellInput
											value={row[c] ?? ""}
											onChange={(v) => setCell(ri + 1, c, v)}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</EditablePreviewShell>
	);
};

interface CellInputProps {
	value: string;
	onChange: (value: string) => void;
}

const CellInput = ({ value, onChange }: CellInputProps) => {
	// A URL cell is shown as a clickable blue link (open in a new tab).
	// Non-URL cells stay editable inputs. Double-clicking a link cell
	// switches it back to the input so it can be edited.
	const [editing, setEditing] = useState(false);
	// Track focus so we only commit edits when the user leaves the cell,
	// avoiding a re-render storm on every keystroke.
	const [draft, setDraft] = useState(value);
	useEffect(() => {
		setDraft(value);
		setEditing(false);
	}, [value]);
	if (hasUrl(value) && !editing) {
		return (
			<a
				href={value}
				class="linkify block w-full px-xs py-[2px] text-text-primary overflow-hidden text-ellipsis whitespace-nowrap"
				target="_blank"
				rel="noopener noreferrer"
				data-testid="csv-cell-link"
				title={value}
				onDblClick={(e) => {
					e.preventDefault();
					setEditing(true);
				}}
			>
				{value}
			</a>
		);
	}
	return (
		<input
			type="text"
			value={draft}
			data-testid="csv-cell"
			aria-label="CSV cell"
			onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
			onBlur={() => {
				if (draft !== value) onChange(draft);
				setEditing(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					(e.target as HTMLInputElement).blur();
				}
			}}
			class="w-full px-xs py-[2px] bg-transparent text-text-primary outline-none focus:bg-bg-base focus:ring-1 focus:ring-accent border-0 m-0"
		/>
	);
};
