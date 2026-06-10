import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import { isTextFile } from "../../controllers/files-utils";
import type { FilesController } from "../../controllers/files-controller";
import {
	selectFilesState,
	selectSelectedFileId,
} from "../../state/selectors";
import { browsergentStore } from "../../state/store";
import type { FileNode } from "../../state/slices/files-slice";

interface FilesPanelProps {
	sessionId: string;
	filesController: FilesController;
	onFilesChanged?: () => void;
}

export const FilesPanel: FunctionalComponent<FilesPanelProps> = ({
	sessionId,
	filesController,
	onFilesChanged,
}) => {
	const filesState = useStore(browsergentStore, selectFilesState);
	const selectedFileId = useStore(browsergentStore, selectSelectedFileId);

	const [previewContent, setPreviewContent] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const fileNodes = useMemo(
		() =>
			Object.values(filesState.nodes).filter(
				(node): node is FileNode => node !== undefined && node.kind === "file",
			),
		[filesState.nodes],
	);

	const loadFiles = useCallback(async () => {
		if (!sessionId) return;
		const currentFiles = browsergentStore.getState().files;
		if (currentFiles.filesSessionId === sessionId) {
			return;
		}
		try {
			const nodes = await filesController.listSessionFiles(sessionId);
			browsergentStore.getState().hydrateFiles(nodes, sessionId);
		} catch (err) {
			console.warn("Failed to load files:", err);
		}
	}, [sessionId, filesController]);

	useEffect(() => {
		loadFiles();
	}, [loadFiles]);

	useEffect(() => {
		if (!selectedFileId || !sessionId) {
			setPreviewContent(null);
			setPreviewError(null);
			return;
		}

		const node = filesState.nodes[selectedFileId];
		if (!node || node.kind !== "file") {
			setPreviewContent(null);
			setPreviewError(null);
			return;
		}

		if (!isTextFile(node.name)) {
			setPreviewContent(null);
			setPreviewError(null);
			return;
		}

		let cancelled = false;
		filesController
			.readFileText(sessionId, selectedFileId)
			.then((text) => {
				if (!cancelled) {
					setPreviewContent(text);
					setPreviewError(null);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setPreviewContent(null);
					setPreviewError(
						err instanceof Error ? err.message : "Failed to load preview",
					);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [selectedFileId, sessionId, filesState.nodes, filesController]);

	const handleUpload = useCallback(
		async (fileList: FileList | null) => {
			if (!fileList || fileList.length === 0 || !sessionId) return;
			const files = Array.from(fileList);
			try {
				const nodes = await filesController.uploadFiles(
					sessionId,
					files,
				);
				for (const node of nodes) {
					browsergentStore.getState().addFileNode(node);
				}
				onFilesChanged?.();
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Upload failed");
			}
		},
		[sessionId, filesController, onFilesChanged],
	);

	const handleDelete = useCallback(
		async (fileId: string, event: Event) => {
			event.stopPropagation();
			if (!sessionId) return;
			try {
				await filesController.deleteFile(sessionId, fileId);
				browsergentStore.getState().removeFileNode(fileId);
				onFilesChanged?.();
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Delete failed");
			}
		},
		[sessionId, filesController, onFilesChanged],
	);

	const handleFileClick = useCallback((fileId: string) => {
		browsergentStore.getState().setSelectedFileId(fileId);
	}, []);

	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), 5000);
		return () => clearTimeout(timer);
	}, [error]);

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			void handleUpload(e.dataTransfer?.files ?? null);
		},
		[handleUpload],
	);

	const selectedNode: FileNode | undefined = selectedFileId
		? filesState.nodes[selectedFileId]
		: undefined;

	function renderFile(node: FileNode) {
		const isSelected = selectedFileId === node.id;
		return (
			<div
				key={node.id}
				onClick={() => handleFileClick(node.id)}
				class={[
					"cursor-pointer py-[3px] px-sm flex items-center gap-xs text-sm transition-colors select-none group",
					isSelected
						? "bg-accent-soft text-accent"
						: "text-text-primary hover:bg-bg-hover",
				].join(" ")}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 16 16"
					fill="none"
					class={[
						"flex-shrink-0",
						isSelected ? "text-accent" : "text-text-muted",
					].join(" ")}
				>
					<path
						d="M9 1H3v14h10V5L9 1z"
						stroke="currentColor"
						stroke-width="1.2"
						fill="none"
					/>
					<path d="M9 1v4h4" stroke="currentColor" stroke-width="1.2" fill="none" />
				</svg>
				<span class="truncate flex-1">{node.name}</span>
				<button
					type="button"
					onClick={(e) => handleDelete(node.id, e)}
					class={[
						"opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger-soft transition-all cursor-pointer flex-shrink-0",
						isSelected ? "opacity-100" : "",
					].join(" ")}
					title="Delete file"
				>
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
						<path
							d="M3 4h10M6 4V2.5a1 1 0 011-1h2a1 1 0 011 1V4m2 0v9.5a1 1 0 01-1 1H5a1 1 0 01-1-1V4h8z"
							stroke="currentColor"
							stroke-width="1.2"
						/>
					</svg>
				</button>
			</div>
		);
	}

	const hasFiles = fileNodes.length > 0;

	return (
		<div
			data-testid="files-panel"
			class="flex flex-col h-full"
		>
			<div class="flex items-center gap-sm p-sm border-b border-border">
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					class="flex items-center gap-xs px-sm py-[3px] text-xs font-medium rounded-md bg-bg-muted border border-border text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-bg-hover transition-all cursor-pointer"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
						<path
							d="M8 2v8M5 5l3-3 3 3M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3"
							stroke="currentColor"
							stroke-width="1.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Upload
				</button>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					class="hidden"
					onChange={(e) => {
						void handleUpload(e.currentTarget.files);
						e.currentTarget.value = "";
					}}
					data-testid="file-upload"
				/>
				<span class="text-xs text-text-muted">
					{hasFiles
						? `${fileNodes.length} file${fileNodes.length === 1 ? "" : "s"}`
						: "Drop files here"}
				</span>
			</div>

			{error && (
				<div class="mx-md mb-sm px-sm py-xs text-xs text-danger bg-danger/10 border border-danger/20 rounded">
					{error}
				</div>
			)}
			<div
				data-testid="file-tree"
				class={[
					"flex-1 overflow-auto py-xs transition-colors",
					isDragOver ? "bg-accent-soft" : "",
				].join(" ")}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{hasFiles ? (
					<div>{fileNodes.map((node) => renderFile(node))}</div>
				) : (
					<div class="flex flex-col items-center justify-center h-full gap-sm text-text-muted">
						<svg
							width="32"
							height="32"
							viewBox="0 0 16 16"
							fill="none"
							class="opacity-40"
						>
							<path
								d="M9 1H3v14h10V5L9 1z"
								stroke="currentColor"
								stroke-width="1"
								fill="none"
							/>
							<path
								d="M9 1v4h4"
								stroke="currentColor"
								stroke-width="1"
								fill="none"
							/>
						</svg>
						<p class="text-sm">No files yet</p>
						<p class="text-xs opacity-60">
							Drag and drop or click Upload
						</p>
					</div>
				)}
			</div>

			{selectedNode && selectedNode.kind === "file" && (
				<div
					data-testid="file-preview"
					class="border-t border-border bg-bg-surface/50"
				>
					<div class="px-sm py-xs border-b border-border flex items-center justify-between">
						<span class="text-xs font-medium text-text-secondary truncate">
							{selectedNode.name}
						</span>
						<span class="text-[10px] text-text-muted flex-shrink-0">
							{selectedNode.size ?? 0} bytes
						</span>
					</div>
					<div class="p-sm overflow-auto max-h-[200px]">
						{isTextFile(selectedNode.name) ? (
							previewError ? (
								<p class="text-sm text-danger">{previewError}</p>
							) : previewContent !== null ? (
								<pre class="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
									{previewContent}
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
							)
						) : (
							<p class="text-sm text-text-muted">
								{selectedNode.name} — {selectedNode.size ?? 0}{" "}
								bytes (preview not available)
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
