import { useEffect, useState } from "preact/hooks";
import type { FilesController } from "../../../controllers/files";
import { EditablePreviewShell } from "./EditablePreviewShell";

interface TextPreviewProps {
	/** Raw text loaded from the file. */
	content: string;
	/** File path, used to persist edits. */
	path: string;
	filesController: FilesController;
}

/**
 * Editable plain-text preview. A textarea bound to local draft state; Save
 * (in the shared shell) commits to FS, Copy writes the text to the clipboard.
 */
export const TextPreview = ({
	content,
	path,
	filesController,
}: TextPreviewProps) => {
	const [draft, setDraft] = useState(content);
	const [dirty, setDirty] = useState(false);

	// Re-seed when the underlying file content changes (e.g. file switch).
	useEffect(() => {
		setDraft(content);
		setDirty(false);
	}, [content]);

	return (
		<EditablePreviewShell
			ariaLabel="Text preview"
			getContent={() => draft}
			dirty={dirty}
			onSave={(c) => filesController.writeFile(path, c)}
		>
			<textarea
				value={draft}
				data-testid="text-preview-textarea"
				aria-label="Editable text content"
				spellcheck={false}
				onInput={(e) => {
					setDraft((e.target as HTMLTextAreaElement).value);
					setDirty(true);
				}}
				class="w-full h-full resize-none bg-transparent text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed outline-none border-0 p-sm m-0"
			/>
		</EditablePreviewShell>
	);
};