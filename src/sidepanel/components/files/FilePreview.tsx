import { useEffect, useState } from "preact/hooks";
import { useStore } from "zustand";
import { browsergentStore } from "../../../state/store";
import { selectSelectedFileId } from "../../../state/selectors";
import type { FilesController } from "../../../controllers/files-controller";
import { isTextFile } from "../../../controllers/files-utils";
import type { FileNode } from "../../../state/slices/files-slice";

interface FilePreviewProps {
	node: FileNode;
	filesController: FilesController;
}

export const FilePreview = ({ node, filesController }: FilePreviewProps) => {
	const selectedFileId = useStore(browsergentStore, selectSelectedFileId);
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!selectedFileId || !isTextFile(node.name)) {
			setContent(null);
			setError(null);
			return;
		}
		let cancelled = false;
		filesController
			.readFileText(node.path)
			.then((text: string) => {
				if (!cancelled) {
					setContent(text);
					setError(null);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setContent(null);
					setError(
						err instanceof Error ? err.message : "Failed to load preview",
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [selectedFileId, node, filesController]);

	return (
		<div
			data-testid="file-preview"
			class="border-t border-border bg-bg-surface/50"
		>
			<div class="px-sm py-xs border-b border-border flex items-center justify-between">
				<span class="text-xs font-medium text-text-secondary truncate">
					{node.name}
				</span>
				<span class="text-[10px] text-text-muted flex-shrink-0">
					{node.size ?? 0} bytes
				</span>
			</div>
			<div class="p-sm overflow-auto max-h-[200px]">
				{!isTextFile(node.name) ? (
					<p class="text-sm text-text-muted">
						{node.name} — {node.size ?? 0} bytes (preview not available)
					</p>
				) : error ? (
					<p class="text-sm text-danger">{error}</p>
				) : content !== null ? (
					<pre class="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
						{content}
					</pre>
				) : (
					<div class="flex items-center gap-xs text-xs text-text-muted">
						<svg
							width="12"
							height="12"
							viewBox="0 0 16 16"
							class="animate-spin"
						>
							<circle
								cx="8"
								cy="8"
								r="6"
								stroke="currentColor"
								stroke-width="1.5"
								fill="none"
								stroke-dasharray="24"
								stroke-dashoffset="8"
								stroke-linecap="round"
							/>
						</svg>
						Loading preview…
					</div>
				)}
			</div>
		</div>
	);
};
