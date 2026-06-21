import { useRef } from "preact/hooks";
import { useStore } from "zustand";
import { browsergentStore } from "../../../state/store";
import { selectCreatingKind, selectCreatingName } from "../../../state/selectors";
import type { CreatingKind } from "../../../state/slices/files-slice";
import { sanitizeFileName } from "../../../controllers/files-utils";
import type { FilesController } from "../../../controllers/files-controller";

interface FilesToolbarProps {
	filesController: FilesController;
	onFilesChanged?: () => void;
	onUpload: (fileList: FileList | null) => Promise<void>;
	onError: (message: string) => void;
}

function resolveParentPath(selectedFileId: string | null): string {
	if (!selectedFileId) return "";
	const state = browsergentStore.getState();
	const node = state.files.nodes[selectedFileId];
	if (node && node.kind === "directory") return node.path;
	return "";
}
export const FilesToolbar = ({
	filesController,
	onFilesChanged,
	onUpload,
	onError,
}: FilesToolbarProps) => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const createInputRef = useRef<HTMLInputElement>(null);
	const creatingKind = useStore(browsergentStore, selectCreatingKind);
	const creatingName = useStore(browsergentStore, selectCreatingName);

	const handleCreate = async (): Promise<void> => {
		const state = browsergentStore.getState();
		const kind = state.files.creatingKind;
		if (!kind) return;
		const name = sanitizeFileName(state.files.creatingName);
		if (name.length === 0) return;
		const parent = state.files.creatingParentPath;
		const path = parent === "" ? `/${name}` : `${parent}/${name}`;
		try {
			if (kind === "folder") {
				await filesController.createFolder(path);
			} else {
				await filesController.createFile(path);
			}
			browsergentStore.getState().incrementFilesVersion();
			onFilesChanged?.();
		} catch (err) {
			onError(err instanceof Error ? err.message : "Create failed");
		}
		browsergentStore.getState().cancelCreating();
	};


	const beginCreate = (kind: CreatingKind): void => {
		const parentPath = resolveParentPath(
			browsergentStore.getState().files.selectedFileId,
		);
		browsergentStore.getState().startCreating(kind, parentPath);
		setTimeout(() => createInputRef.current?.focus(), 0);
	};

	return (
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
			<button
				type="button"
				data-testid="new-folder-button"
				onClick={() => beginCreate("folder")}
				class="flex items-center gap-xs px-sm py-[3px] text-xs font-medium rounded-md bg-bg-muted border border-border text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-bg-hover transition-all cursor-pointer"
			>
				New Folder
			</button>
			<button
				type="button"
				data-testid="new-file-button"
				onClick={() => beginCreate("file")}
				class="flex items-center gap-xs px-sm py-[3px] text-xs font-medium rounded-md bg-bg-muted border border-border text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-bg-hover transition-all cursor-pointer"
			>
				New File
			</button>
			{creatingKind && (
				<input
					ref={createInputRef}
					type="text"
					value={creatingName}
					onInput={(e) =>
						browsergentStore.getState().setCreatingName(e.currentTarget.value)
					}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void handleCreate();
						} else if (e.key === "Escape") {
							browsergentStore.getState().cancelCreating();
						}
					}}
					onBlur={() => browsergentStore.getState().cancelCreating()}
					placeholder={creatingKind === "folder" ? "folder name…" : "file name…"}
					data-testid="creating-input"
					class="px-sm py-[3px] text-xs bg-bg-surface border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent min-w-[120px]"
				/>
			)}
			<input
				ref={fileInputRef}
				type="file"
				multiple
				class="hidden"
				onChange={(e) => {
					void onUpload(e.currentTarget.files);
					e.currentTarget.value = "";
				}}
				data-testid="file-upload"
			/>
		</div>
	);
};
