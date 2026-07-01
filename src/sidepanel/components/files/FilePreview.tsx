import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "zustand";
import type { FilesController } from "../../../controllers/files";
import type { MediaKind } from "../../../controllers/media-types";
import {
	classifyMedia,
	defaultPreviewHeightPx,
	resolveMime,
} from "../../../controllers/media-types";
import { selectSelectedFileId } from "../../../state/selectors";
import type { FileNode } from "../../../state/slices/files-slice";
import { browsergentStore } from "../../../state/store";
import { renderMarkdownFile } from "../../../utils/markdown-stream";
import { highlightCode } from "../../../utils/syntax-highlight";

interface FilePreviewProps {
	node: FileNode;
	filesController: FilesController;
}

const MIN_H = 80;

const CODE_EXTS: Record<string, true> = {
	".js": true,
	".jsx": true,
	".ts": true,
	".tsx": true,
	".mjs": true,
	".cjs": true,
};
function codeLang(name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "ts";
	return "js";
}

function isMarkdown(name: string): boolean {
	return /\.md$/i.test(name) || /\.markdown$/i.test(name);
}

export const FilePreview = ({ node, filesController }: FilePreviewProps) => {
	const selectedFileId = useStore(browsergentStore, selectSelectedFileId);
	const [content, setContent] = useState<string | null>(null);
	const [mediaUrl, setMediaUrl] = useState<string | null>(null);
	const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
	const [error, setError] = useState<string | null>(null);

	const kind = classifyMedia(node.name, node.mime);
	const [height, setHeight] = useState(defaultPreviewHeightPx(kind));

	const draggingRef = useRef(false);
	const dragHandlersRef = useRef<{
		move: ((e: PointerEvent) => void) | null;
		up: ((e: PointerEvent) => void) | null;
		pointerId: number | null;
	}>({ move: null, up: null, pointerId: null });

	// Reset height to the per-type default whenever the selected file changes.
	useEffect(() => {
		const nextKind = classifyMedia(node.name, node.mime);
		setHeight(defaultPreviewHeightPx(nextKind));
	}, [node.path]);

	// Detach any in-flight drag listeners on unmount (mid-drag file switch /
	// unmount) so they cannot mutate a stale or unmounted instance.
	useEffect(
		() => () => {
			const h = dragHandlersRef.current;
			if (h.move && h.up) {
				window.removeEventListener("pointermove", h.move);
				window.removeEventListener("pointerup", h.up);
			}
			draggingRef.current = false;
		},
		[],
	);

	// Load content by kind.
	useEffect(() => {
		const loadKind = classifyMedia(node.name, node.mime);
		if (!selectedFileId || loadKind === "binary") {
			setContent(null);
			setMediaUrl(null);
			setMediaKind(null);
			setError(null);
			return;
		}
		let cancelled = false;
		if (loadKind === "text") {
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
							setContent(null);
							setMediaUrl(null);
							setMediaKind(null);
							return;
						}
						setMediaUrl(`data:${mime};base64,${b64}`);
						setMediaKind(loadKind);
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

	const maxH = typeof window !== "undefined" ? window.innerHeight * 0.8 : 600;

	const onHandlePointerDown = (e: PointerEvent) => {
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		draggingRef.current = true;
		const startY = e.clientY;
		const startHeight = height;
		const onMove = (ev: PointerEvent) => {
			if (!draggingRef.current) return;
			const next = startHeight + (startY - ev.clientY);
			setHeight(Math.max(MIN_H, Math.min(next, maxH)));
		};
		const onUp = (ev: PointerEvent) => {
			draggingRef.current = false;
			(ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			dragHandlersRef.current = { move: null, up: null, pointerId: null };
		};
		dragHandlersRef.current = {
			move: onMove,
			up: onUp,
			pointerId: e.pointerId,
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	const lowerName = node.name.toLowerCase();
	const renderTextBody = () => {
		if (content === null) return null;
		if (isMarkdown(lowerName)) {
			return (
				<div
					class="file-preview-body message-bubble prose-preview"
					dangerouslySetInnerHTML={{ __html: renderMarkdownFile(content) }}
				/>
			);
		}
		const ext = lowerName.slice(lowerName.lastIndexOf("."));
		if (CODE_EXTS[ext]) {
			return (
				<pre class="file-preview-body message-bubble text-xs font-mono whitespace-pre-wrap break-all">
					<code
						dangerouslySetInnerHTML={{
							__html: highlightCode(content, codeLang(node.name)),
						}}
					/>
				</pre>
			);
		}
		return (
			<pre class="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
				{content}
			</pre>
		);
	};

	return (
		<div
			data-testid="file-preview"
			class="flex flex-col overflow-hidden border-t border-border bg-bg-surface/50 flex-shrink-0"
			style={{ height: `${height}px` }}
		>
			<div class="flex-shrink-0 px-sm py-xs border-b border-border flex items-center justify-between gap-xs">
				<div
					data-testid="preview-drag-handle"
					class="preview-drag-handle flex items-center gap-xs flex-1 min-w-0"
					onPointerDown={onHandlePointerDown}
				>
					<svg
						width="10"
						height="14"
						viewBox="0 0 10 14"
						class="text-text-muted flex-shrink-0"
						aria-hidden="true"
					>
						<circle cx="3" cy="3" r="1" fill="currentColor" />
						<circle cx="7" cy="3" r="1" fill="currentColor" />
						<circle cx="3" cy="7" r="1" fill="currentColor" />
						<circle cx="7" cy="7" r="1" fill="currentColor" />
						<circle cx="3" cy="11" r="1" fill="currentColor" />
						<circle cx="7" cy="11" r="1" fill="currentColor" />
					</svg>
					<span class="text-xs font-medium text-text-secondary truncate">
						{node.name}
					</span>
				</div>
				<span class="text-[10px] text-text-muted flex-shrink-0">
					{node.size ?? 0} bytes
				</span>
				<button
					type="button"
					onClick={() => browsergentStore.getState().setSelectedFileId(null)}
					class="flex-shrink-0 text-text-muted hover:text-text-primary"
					aria-label="Close preview"
					title="Close preview"
				>
					<svg width="12" height="12" viewBox="0 0 12 12">
						<path
							d="M3 3l6 6M9 3l-6 6"
							stroke="currentColor"
							stroke-width="1.5"
							fill="none"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
			<div class="flex-1 overflow-auto p-sm">
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
							class="max-w-full max-h-full object-contain mx-auto"
						/>
					) : mediaKind === "video" ? (
						<video
							src={mediaUrl}
							controls
							class="max-w-full max-h-full mx-auto"
						/>
					) : mediaKind === "audio" ? (
						<audio src={mediaUrl} controls class="w-full" />
					) : (
						<iframe
							src={mediaUrl}
							title={node.name}
							class="w-full h-full border border-border"
						/>
					)
				) : content !== null ? (
					renderTextBody()
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
