import type { FunctionalComponent } from "preact";
import { useEffect, useState } from "preact/hooks";

interface EditablePreviewShellProps {
	/** Current serialized content to save / copy. */
	getContent: () => string;
	/** Whether the editor has unsaved edits. */
	dirty: boolean;
	/** Persist the content to the FS. Resolves on success, throws on failure. */
	onSave: (content: string) => Promise<void>;
	/** Optional ARIA label for the content region. */
	ariaLabel?: string;
}

/**
 * Shared chrome for editable file previews: a relative content container
 * with a fixed bottom-right Save + Copy cluster. Each editor renders its
 * own body as children; the shell owns save/copy state and feedback.
 *
 * No revert button — the editor keeps its own draft state and Save is the
 * only commit. Copy writes the current content to the clipboard.
 */
export const EditablePreviewShell: FunctionalComponent<EditablePreviewShellProps> = ({
	getContent,
	dirty,
	onSave,
	ariaLabel,
	children,
}) => {
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Clear "Saved" / "Copied" feedback after a beat so it doesn't linger.
	useEffect(() => {
		if (savedAt === null) return;
		const t = setTimeout(() => setSavedAt(null), 1500);
		return () => clearTimeout(t);
	}, [savedAt]);
	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(t);
	}, [copied]);

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			await onSave(getContent());
			setSavedAt(Date.now());
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const copy = async () => {
		setError(null);
		try {
			await navigator.clipboard.writeText(getContent());
			setCopied(true);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to copy");
		}
	};

	return (
		<div
			class="relative flex flex-col h-full"
			aria-label={ariaLabel}
			data-testid="editable-preview-shell"
		>
			<div class="flex-1 overflow-auto min-h-0">{children}</div>
			<div class="flex items-center justify-end gap-xs px-sm py-xs flex-shrink-0">
				{dirty && (
					<span class="text-[10px] text-warning flex-shrink-0">Unsaved</span>
				)}
				{!dirty && savedAt !== null && (
					<span class="text-[10px] text-text-muted flex-shrink-0">Saved</span>
				)}
				{copied && (
					<span class="text-[10px] text-text-muted flex-shrink-0">Copied</span>
				)}
				{error && (
					<span class="text-[10px] text-danger truncate flex-1 text-right">
						{error}
					</span>
				)}
				<button
					type="button"
					data-testid="preview-copy"
					onClick={() => void copy()}
					class="px-sm py-[3px] text-xs font-medium rounded-md bg-bg-muted border border-border text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-bg-hover cursor-pointer transition-all"
				>
					Copy
				</button>
				<button
					type="button"
					data-testid="preview-save"
					disabled={!dirty || saving}
					onClick={() => void save()}
					class="px-sm py-[3px] text-xs font-medium rounded-md bg-accent text-bg-base border border-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity"
				>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
		</div>
	);
};