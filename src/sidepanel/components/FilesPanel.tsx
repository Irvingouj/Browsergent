import type { FunctionalComponent } from "preact";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";
import { useStore } from "zustand/react";
import type { FilesController } from "../../controllers/files-controller";
import { findSkillManifest, isTextFile } from "../../controllers/files-utils";
import { getSkillService } from "../../skills/skill-service";
import {
	selectExpandedFolderIds,
	selectFilesState,
	selectFilesVersion,
	selectSelectedFileId,
} from "../../state/selectors";
import type { FileNode, FileNodeId } from "../../state/slices/files-slice";
import { browsergentStore } from "../../state/store";

interface FilesPanelProps {
	filesController: FilesController;
	onFilesChanged?: () => void;
}

export const FilesPanel: FunctionalComponent<FilesPanelProps> = ({
	filesController,
	onFilesChanged,
}) => {
	const filesState = useStore(browsergentStore, selectFilesState);
	const selectedFileId = useStore(browsergentStore, selectSelectedFileId);
	const filesVersion = useStore(browsergentStore, selectFilesVersion);
	const expandedFolderIds = useStore(browsergentStore, selectExpandedFolderIds);

	const [previewContent, setPreviewContent] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [skillImportToast, setSkillImportToast] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const fileCount = useMemo(
		() =>
			Object.values(filesState.nodes).filter(
				(node): node is FileNode => node !== undefined && node.kind === "file",
			).length,
		[filesState.nodes],
	);

	const childrenByParent = useMemo(() => {
		const map = new Map<FileNodeId, FileNode[]>();
		for (const node of Object.values(filesState.nodes)) {
			if (!node) continue;
			const parent = node.parentId;
			if (parent === undefined) continue;
			const arr = map.get(parent);
			if (arr) arr.push(node);
			else map.set(parent, [node]);
		}
		return map;
	}, [filesState.nodes]);

	const expandedIds = useMemo(
		() => new Set<string>(expandedFolderIds),
		[expandedFolderIds],
	);

	const loadFiles = useCallback(async () => {
		try {
			const nodes = await filesController.listAllFiles();
			browsergentStore.getState().setFileNodes(nodes);
		} catch (err) {
			console.warn("Failed to load files:", err);
		}
	}, [filesController]);

	useEffect(() => {
		const timer = setTimeout(() => {
			void loadFiles();
		}, 0);
		return () => clearTimeout(timer);
	}, [loadFiles, filesVersion]);

	const toggleExpand = useCallback((id: string) => {
		browsergentStore.getState().toggleFolderExpanded(id);
	}, []);

	useEffect(() => {
		if (!selectedFileId) {
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
			.readFileText(node.path)
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
	}, [selectedFileId, filesState.nodes, filesController]);

	const handleUpload = useCallback(
		async (fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return;
			const files = Array.from(fileList);
			const skillMdFile = findSkillManifest(files);
			try {
				if (skillMdFile) {
					const skillService = getSkillService();
					const result = await skillService.importUserSkill(files);
					setError(null);
					setSkillImportToast(
						`Imported skill: ${result.name} (${result.fileCount} files)`,
					);
				} else {
					const nodes = await filesController.uploadFiles(files);
					for (const node of nodes) {
						browsergentStore.getState().addFileNode(node);
					}
					onFilesChanged?.();
					setError(null);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Upload failed");
			}
		},
		[filesController, onFilesChanged],
	);

	const handleDelete = useCallback(
		async (fileId: string, event: Event) => {
			event.stopPropagation();
			try {
				await filesController.deleteFile(fileId);
				browsergentStore.getState().removeFileNode(fileId);
				browsergentStore.getState().incrementFilesVersion();
				onFilesChanged?.();
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Delete failed");
			}
		},
		[filesController, onFilesChanged],
	);

	const handleFileClick = useCallback((fileId: string) => {
		browsergentStore.getState().setSelectedFileId(fileId);
	}, []);

	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), 5000);
		return () => clearTimeout(timer);
	}, [error]);

	useEffect(() => {
		if (!skillImportToast) return;
		const timer = setTimeout(() => setSkillImportToast(null), 5000);
		return () => clearTimeout(timer);
	}, [skillImportToast]);

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

	const hasFiles = filesState.rootIds.length > 0;

	return (
		<div data-testid="files-panel" class="flex flex-col h-full">
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
						? `${fileCount} file${fileCount === 1 ? "" : "s"}`
						: "Drop files here"}
				</span>
			</div>

			{error && (
				<div class="mx-md mb-sm px-sm py-xs text-xs text-danger bg-danger/10 border border-danger/20 rounded">
					{error}
				</div>
			)}
			{skillImportToast && (
				<div class="mx-md mb-sm px-sm py-xs text-xs text-success bg-success-soft/40 border border-success/20 rounded">
					{skillImportToast}
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
					<div>
						{filesState.rootIds.map((id) => {
							const node = filesState.nodes[id];
							if (!node) return null;
							return (
								<TreeNode
									key={node.id}
									node={node}
									depth={0}
									expandedIds={expandedIds}
									childrenByParent={childrenByParent}
									selectedFileId={selectedFileId}
									onToggle={toggleExpand}
									onSelectFile={handleFileClick}
									onDelete={handleDelete}
								/>
							);
						})}
					</div>
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
						<p class="text-xs opacity-60">Drag and drop or click Upload</p>
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
								{selectedNode.name} — {selectedNode.size ?? 0} bytes (preview
								not available)
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

interface TreeNodeProps {
	node: FileNode;
	depth: number;
	expandedIds: Set<string>;
	childrenByParent: Map<FileNodeId, FileNode[]>;
	selectedFileId: string | null;
	onToggle: (id: string) => void;
	onSelectFile: (id: string) => void;
	onDelete: (id: string, event: Event) => void;
}

const TreeNode: FunctionalComponent<TreeNodeProps> = ({
	node,
	depth,
	expandedIds,
	childrenByParent,
	selectedFileId,
	onToggle,
	onSelectFile,
	onDelete,
}) => {
	const isDirectory = node.kind === "directory";
	const isExpanded = expandedIds.has(node.id);
	const isSelected = selectedFileId === node.id;
	const children = isDirectory ? (childrenByParent.get(node.id) ?? []) : [];

	const handleClick = () => {
		if (isDirectory) onToggle(node.id);
		else onSelectFile(node.id);
	};

	return (
		<div>
			<div
				data-testid={isDirectory ? "tree-directory" : "tree-file"}
				onClick={handleClick}
				class={[
					"cursor-pointer py-[3px] pr-sm flex items-center gap-xs text-sm transition-colors select-none group",
					!isDirectory && isSelected
						? "bg-accent-soft text-accent"
						: "text-text-primary hover:bg-bg-hover",
				].join(" ")}
				style={{ paddingLeft: `${depth * 12 + 8}px` }}
			>
				{isDirectory ? (
					<>
						<svg
							width="10"
							height="10"
							viewBox="0 0 16 16"
							fill="none"
							class="flex-shrink-0 text-text-muted transition-transform"
							style={{
								transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
							}}
						>
							<path
								d="M5 3l6 5-6 5"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<svg
							width="14"
							height="14"
							viewBox="0 0 16 16"
							fill="none"
							class="flex-shrink-0 text-text-muted"
						>
							<path
								d="M1.5 4.5h4l1.5 2h7v8h-13V4.5z"
								stroke="currentColor"
								stroke-width="1.2"
								fill={isExpanded ? "currentColor" : "none"}
								stroke-linejoin="round"
							/>
						</svg>
					</>
				) : (
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
						<path
							d="M9 1v4h4"
							stroke="currentColor"
							stroke-width="1.2"
							fill="none"
						/>
					</svg>
				)}
				<span class="truncate flex-1">{node.name}</span>
				<button
					type="button"
					onClick={(e) => onDelete(node.id, e)}
					class={[
						"opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger-soft transition-all cursor-pointer flex-shrink-0",
						isSelected ? "opacity-100" : "",
					].join(" ")}
					title={isDirectory ? "Delete directory" : "Delete file"}
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
			{isDirectory && isExpanded && children.length > 0 && (
				<div>
					{children.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							depth={depth + 1}
							expandedIds={expandedIds}
							childrenByParent={childrenByParent}
							selectedFileId={selectedFileId}
							onToggle={onToggle}
							onSelectFile={onSelectFile}
							onDelete={onDelete}
						/>
					))}
				</div>
			)}
		</div>
	);
};
