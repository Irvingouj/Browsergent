import type { FunctionalComponent, Ref } from "preact";
import { useCallback, useEffect } from "preact/hooks";
import { useStore } from "zustand/react";
import type { FilesController } from "../../../controllers/files-controller";
import {
	selectChatDragOver,
	selectChatUpload,
	selectTaskDraft,
} from "../../../state/selectors";
import { browsergentStore } from "../../../state/store";
import { buildFileMentionToken } from "../../detect-mention-state";
import { useInputHistory } from "./use-input-history";
import { CommandPicker } from "../CommandPicker";
import { usePicker } from "./use-picker";
import { useTextAreaCommands } from "./use-textarea-commands";

const MAX_INPUT_HEIGHT = 200;

interface InputBarProps {
	isRunning: boolean;
	onRun: () => void;
	onStop: () => void;
	inputRef?: Ref<HTMLTextAreaElement>;
	filesController: FilesController | null;
	sessionId: string;
	onFilesChanged?: () => void;
}

export const InputBar: FunctionalComponent<InputBarProps> = ({
	isRunning,
	onRun,
	onStop,
	inputRef,
	filesController,
	sessionId,
	onFilesChanged,
}) => {
	const taskInput = useStore(browsergentStore, selectTaskDraft);
	const chatUpload = useStore(browsergentStore, selectChatUpload);
	const isDragOver = useStore(browsergentStore, selectChatDragOver);
	const isUploading = chatUpload.kind === "uploading";
	const uploadError = chatUpload.kind === "error" ? chatUpload.message : null;

	const inputHistory = useInputHistory();
	const picker = usePicker(inputRef, filesController);
	const handleEditCommands = useTextAreaCommands({
		isRunning,
		onSubmit: () => {
			onRun();
			inputHistory.onSubmit();
		},
		onAfterEdit: (nextText, cursor) => {
			picker.refreshPickerState(nextText, cursor);
			inputHistory.onInput();
		},
	});

	useEffect(() => {
		const el = inputRef && "current" in inputRef ? inputRef.current : null;
		if (!el) return;
		el.style.height = "auto";
		const next = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
		el.style.height = `${next}px`;
	}, [taskInput, inputRef]);

	const uploadAndInsertMentions = useCallback(
		async (files: File[]): Promise<void> => {
			if (files.length === 0) return;
			if (!filesController || !sessionId) {
				browsergentStore.getState().setChatUploadStatus({
					kind: "error",
					message: "File upload unavailable — try again in a moment.",
				});
				return;
			}
			const el = inputRef && "current" in inputRef ? inputRef.current : null;
			const cursor = el?.selectionStart ?? taskInput.length;
			browsergentStore.getState().setChatUploadStatus({ kind: "uploading" });
			try {
				const nodes = await filesController.uploadFiles(files);
				for (const node of nodes) {
					browsergentStore.getState().addFileNode(node);
				}
				onFilesChanged?.();
				if (nodes.length > 0) {
					const tokens = nodes.map((n) => buildFileMentionToken(n.id, n.name));
					const needsLeadingSpace =
						cursor > 0 && !/\s/.test(taskInput[cursor - 1] ?? "");
					const insertText = `${needsLeadingSpace ? " " : ""}${tokens.join(" ")} `;
					const nextText =
						taskInput.slice(0, cursor) + insertText + taskInput.slice(cursor);
					const nextCursor = cursor + insertText.length;
					browsergentStore.getState().setTaskDraft(nextText);
					requestAnimationFrame(() => {
						if (!el) return;
						el.focus();
						el.setSelectionRange(nextCursor, nextCursor);
					});
				}
				browsergentStore.getState().setChatUploadStatus({ kind: "idle" });
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "File upload failed";
				browsergentStore
					.getState()
					.setChatUploadStatus({ kind: "error", message });
			}
		},
		[filesController, sessionId, taskInput, inputRef, onFilesChanged],
	);

	const handleDragOver = useCallback((e: DragEvent) => {
		if (e.dataTransfer?.types?.includes("Files")) {
			e.preventDefault();
			browsergentStore.getState().setChatDragOver(true);
		}
	}, []);

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault();
		browsergentStore.getState().setChatDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent) => {
			const fileList = e.dataTransfer?.files;
			if (!fileList || fileList.length === 0) return;
			e.preventDefault();
			browsergentStore.getState().setChatDragOver(false);
			void uploadAndInsertMentions(Array.from(fileList));
		},
		[uploadAndInsertMentions],
	);

	const handlePaste = useCallback(
		(e: ClipboardEvent) => {
			const fileList = e.clipboardData?.files;
			if (!fileList || fileList.length === 0) return;
			e.preventDefault();
			void uploadAndInsertMentions(Array.from(fileList));
		},
		[uploadAndInsertMentions],
	);

	useEffect(() => {
		if (chatUpload.kind !== "error") return;
		const message = chatUpload.message;
		const timer = setTimeout(() => {
			const current = browsergentStore.getState().ui.chatUpload;
			if (current.kind === "error" && current.message === message) {
				browsergentStore.getState().setChatUploadStatus({ kind: "idle" });
			}
		}, 5000);
		return () => clearTimeout(timer);
	}, [chatUpload]);

	return (
		<>
			{(uploadError || isUploading) && (
				<div
					data-testid="input-upload-status"
					class="px-md py-xs bg-bg-surface text-xs flex items-center gap-xs"
				>
					{isUploading ? (
						<>
							<svg
								width="12"
								height="12"
								viewBox="0 0 16 16"
								class="animate-spin text-text-muted"
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
							<span class="text-text-muted">Uploading…</span>
						</>
					) : (
						<span class="text-danger" data-testid="input-upload-error">
							{uploadError}
						</span>
					)}
				</div>
			)}
			<div
				class={[
					"relative z-10 px-md py-sm bg-bg-surface border-t border-border flex gap-sm items-end transition-colors",
					isDragOver ? "bg-accent-soft" : "",
				].join(" ")}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div class="relative flex-1">
					{picker.isPickerOpen ? (
						<CommandPicker
							items={picker.pickerItems}
							activeIndex={picker.activeIndex}
							onSelect={picker.applyPickerSelection}
							onActiveIndexChange={(i) =>
								browsergentStore.getState().setPickerActiveIndex(i)
							}
							onDismiss={picker.dismissPicker}
							emptyMessage={picker.emptyMessage}
						/>
					) : null}
					<textarea
						ref={inputRef}
						rows={1}
						data-testid="task-input"
						value={taskInput}
						onInput={(e) => {
							const el = e.target as HTMLTextAreaElement;
							browsergentStore.getState().setTaskDraft(el.value);
							picker.refreshPickerState(el.value, el.selectionStart);
							inputHistory.onInput();
						}}
						onFocus={() => picker.loadSkills()}
						onClick={(e) => {
							const el = e.target as HTMLTextAreaElement;
							picker.refreshPickerState(el.value, el.selectionStart);
						}}
						onKeyUp={(e) => {
							const el = e.target as HTMLTextAreaElement;
							picker.refreshPickerState(el.value, el.selectionStart);
						}}
						onPaste={handlePaste}
						onKeyDown={(e) => {
							if (picker.handlePickerKeyDown(e)) return;
							if (inputHistory.handleKeyDown(e)) return;
							if (handleEditCommands(e)) return;
						}}
						placeholder="Type a task... (/ for skills, @ for files or tabs, Shift+Enter for newline)"
						disabled={isRunning || isUploading}
						class="w-full bg-bg-base border border-border-strong rounded-md px-md py-sm text-text-primary font-sans text-sm outline-none transition-all min-h-[36px] max-h-[200px] overflow-y-auto resize-none leading-normal focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim disabled:opacity-50 disabled:cursor-not-allowed"
					/>
				</div>
				{isRunning ? (
					<button
						type="button"
						data-testid="stop-button"
						aria-label="Stop agent"
						onClick={onStop}
						class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-danger-soft text-danger border border-danger hover:bg-danger-soft"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
							<rect x="3" y="3" width="10" height="10" rx="1.5" />
						</svg>
					</button>
				) : (
					<button
						type="button"
						data-testid="run-button"
						aria-label="Run task"
						onClick={onRun}
						class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-text-primary text-bg-base hover:bg-text-secondary active:bg-text-muted"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
							<path d="M15.5 8L.5 1.5 2.5 8 .5 14.5 15.5 8z" />
						</svg>
					</button>
				)}
			</div>
		</>
	);
};
