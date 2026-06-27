import { useEffect, useState } from "preact/hooks";
import { useStore } from "zustand";
import type { FilesController } from "../../../controllers/files-controller";
import { classifyMedia, resolveMime } from "../../../controllers/media-types";
import type { MediaKind } from "../../../controllers/media-types";
import { selectSelectedFileId } from "../../../state/selectors";
import type { FileNode } from "../../../state/slices/files-slice";
import { browsergentStore } from "../../../state/store";

interface FilePreviewProps {
	node: FileNode;
	filesController: FilesController;
}

export const FilePreview = ({ node, filesController }: FilePreviewProps) => {
	const selectedFileId = useStore(browsergentStore, selectSelectedFileId);
	const [content, setContent] = useState<string | null>(null);
	const [mediaUrl, setMediaUrl] = useState<string | null>(null);
	const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const kind = classifyMedia(node.name, node.mime);
		if (!selectedFileId || kind === "binary") {
			setContent(null);
			setMediaUrl(null);
			setMediaKind(null);
			setError(null);
			return;
		}
		let cancelled = false;
		if (kind === "text") {
			filesController
				.readFileText(node.path)
				.then((text: string) => {
					if (!cancelled) {
						setContent(text);
						setMediaUrl(null);
						setMediaKind(null);
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
		} else {
			const mime = resolveMime(node.name, node.mime);
			filesController
				.readFileBase64(node.path)
				.then((b64: string) => {
					if (!cancelled) {
						if (mime === undefined) {
							// Should not happen post-classify, but guard against surprises.
							setContent(null);
							setMediaUrl(null);
							setMediaKind(null);
							return;
						}
						setMediaUrl(`data:${mime};base64,${b64}`);
						setMediaKind(kind);
						setContent(null);
						setError(null);
					}
				})
				.catch((err: unknown) => {
					if (!cancelled) {
						setMediaUrl(null);
						setMediaKind(null);
						setError(
							err instanceof Error ? err.message : "Failed to load preview",
						);
					}
				});
		}
		return () => {
			cancelled = true;
		};
	}, [selectedFileId, node, filesController]);

	const kind = classifyMedia(node.name, node.mime);

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
			<div
				class={`p-sm overflow-auto ${
					kind === "text" ? "max-h-[200px]" : "max-h-[400px]"
				}`}
			>
				{kind === "binary" ? (
					<p class="text-sm text-text-muted">
						{node.name} — {node.size ?? 0} bytes (preview not available)
					</p>
				) : error ? (
					<p class="text-sm text-danger">{error}</p>
				) : mediaUrl !== null && mediaKind !== null ? (
					mediaKind === "image" ? (
						<img
							src={mediaUrl}
							alt={node.name}
							class="max-w-full max-h-[380px] object-contain mx-auto"
						/>
					) : mediaKind === "video" ? (
						<video
							src={mediaUrl}
							controls
							class="max-w-full max-h-[380px] mx-auto"
						/>
					) : mediaKind === "audio" ? (
						<audio src={mediaUrl} controls class="w-full" />
					) : (
						<iframe
							src={mediaUrl}
							title={node.name}
							class="w-full h-[380px] border border-border"
						/>
					)
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
