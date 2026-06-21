import { useEffect, useState } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import type {
	FileNode,
	FileNodeId,
} from "../../../state/slices/files-slice";

interface FileTreeProps {
	nodes: Record<FileNodeId, FileNode>;
	rootIds: FileNodeId[];
	expandedIds: Set<string>;
	selectedFileId: string | null;
	renamingNodeId: FileNodeId | null;
	childrenByParent: Map<FileNodeId, FileNode[]>;
	onToggle: (id: string) => void;
	onSelectFile: (id: string) => void;
	onDelete: (id: FileNodeId) => void;
	onContextMenu: (nodeId: FileNodeId, x: number, y: number) => void;
	onRename: (id: FileNodeId, newName: string) => Promise<void>;
	onRenameStart: (id: FileNodeId) => void;
	onRenameCancel: () => void;
	onMove: (id: FileNodeId, targetDir: string) => Promise<void>;
}

export const FileTree = (props: FileTreeProps) => (
	<div data-testid="file-tree">
		<div>
			{props.rootIds.map((id) => {
				const node = props.nodes[id];
				if (!node) return null;
				return (
					<TreeNode key={node.id} node={node} depth={0} {...props} />
				);
			})}
		</div>
	</div>
);

interface TreeNodeProps extends Omit<FileTreeProps, "nodes" | "rootIds"> {
	node: FileNode;
	depth: number;
}

const TreeNode: FunctionalComponent<TreeNodeProps> = ({
	node,
	depth,
	expandedIds,
	childrenByParent,
	selectedFileId,
	renamingNodeId,
	onToggle,
	onSelectFile,
	onDelete,
	onContextMenu,
	onRename,
	onRenameStart,
	onRenameCancel,
	onMove,
}) => {
	const isDirectory = node.kind === "directory";
	const isExpanded = expandedIds.has(node.id);
	const isSelected = selectedFileId === node.id;
	const children = isDirectory ? (childrenByParent.get(node.id) ?? []) : [];
	const isRenaming = renamingNodeId === node.id;
	const [renameValue, setRenameValue] = useState(node.name);

	useEffect(() => {
		if (isRenaming) setRenameValue(node.name);
	}, [isRenaming, node.name]);

	const handleClick = (): void => {
		if (isRenaming) return;
		if (isDirectory) onToggle(node.id);
		else onSelectFile(node.id);
	};

	const handleDragStart = (e: DragEvent): void => {
		e.dataTransfer?.setData("application/x-bg-node", node.id);
		e.dataTransfer?.setData("text/plain", node.path);
		e.stopPropagation();
	};

	const handleDragOver = (e: DragEvent): void => {
		if (!isDirectory) return;
		const types = e.dataTransfer?.types;
		if (!types || !Array.from(types).includes("application/x-bg-node")) return;
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: DragEvent): void => {
		if (!isDirectory) return;
		e.preventDefault();
		e.stopPropagation();
		const draggedPath = e.dataTransfer?.getData("text/plain");
		const draggedId = e.dataTransfer?.getData("application/x-bg-node");
		if (!draggedId || !draggedPath) return;
		if (draggedPath === node.path || draggedPath.startsWith(node.path + "/")) return;
		void onMove(draggedId, node.path);
	};

	const handleRenameSubmit = (): void => {
		const trimmed = renameValue.trim();
		if (trimmed.length === 0 || trimmed === node.name) {
			onRenameCancel();
			return;
		}
		void onRename(node.id, trimmed);
	};

	return (
		<div>
			<div
				data-testid={isDirectory ? "tree-directory" : "tree-file"}
				onClick={handleClick}
				onContextMenu={(e) => {
					e.preventDefault();
					onContextMenu(node.id, e.clientX, e.clientY);
				}}
				draggable={true}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
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
							style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
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
						<path d="M9 1H3v14h10V5L9 1z" stroke="currentColor" stroke-width="1.2" fill="none" />
						<path d="M9 1v4h4" stroke="currentColor" stroke-width="1.2" fill="none" />
					</svg>
				)}
				{isRenaming ? (
					<input
						data-testid="tree-node-rename-input"
						type="text"
						value={renameValue}
						onInput={(e) => setRenameValue(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleRenameSubmit();
							} else if (e.key === "Escape") {
								onRenameCancel();
							}
						}}
						onBlur={handleRenameSubmit}
						onClick={(e) => e.stopPropagation()}
						class="flex-1 px-xs py-[1px] text-xs bg-bg-surface border border-accent rounded text-text-primary focus:outline-none"
					/>
				) : (
					<span class="truncate flex-1" onDblClick={() => onRenameStart(node.id)}>
						{node.name}
					</span>
				)}
				<button
					type="button"
					onClick={() => onDelete(node.id)}
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
							renamingNodeId={renamingNodeId}
							onToggle={onToggle}
							onSelectFile={onSelectFile}
							onDelete={onDelete}
							onContextMenu={onContextMenu}
							onRename={onRename}
							onRenameStart={onRenameStart}
							onRenameCancel={onRenameCancel}
							onMove={onMove}
						/>
					))}
				</div>
			)}
		</div>
	);
};
