import type { FunctionalComponent, Ref } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import type { FilesController } from "../../../controllers/files";
import {
	selectChatDragOver,
	selectChatUpload,
	selectTaskDraft,
} from "../../../state/selectors";
import { browsergentStore } from "../../../state/store";
import { buildFileMentionToken } from "../../detect-mention-state";
import { CommandPicker } from "../CommandPicker";
import { ChipInput, type DomSync } from "./ChipInput";
import {
	applyCommand,
	type Draft,
	type EditorCommand,
	emptyDraft,
	parseDraft,
	parseDraftAtOffset,
	serializeDraft,
} from "./draft-model";
import { useInputMode } from "./use-input-mode";

const MAX_INPUT_HEIGHT = 200;

const INPUT_CLASS =
	"w-full bg-bg-base border border-border-strong rounded-md px-md py-sm text-text-primary font-sans text-sm outline-none transition-all min-h-[36px] max-h-[200px] overflow-y-auto leading-normal focus:border-accent focus:ring-[3px] focus:ring-accent-soft disabled:opacity-50 disabled:cursor-not-allowed";

type InputState =
	| { readonly kind: "browser-editing"; readonly draft: Draft }
	| { readonly kind: "needs-dom-reconcile"; readonly draft: Draft };

function domSyncFor(state: InputState): DomSync {
	if (state.kind === "browser-editing") return { kind: "idle" };
	return { kind: "reconcile", draft: state.draft };
}

interface InputBarProps {
	isRunning: boolean;
	onRun: () => void;
	onStop: () => void;
	inputRef?: Ref<HTMLDivElement>;
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

	const [inputState, setInputState] = useState<InputState>({
		kind: "browser-editing",
		draft: emptyDraft(),
	});
	const draft = inputState.draft;
	const domSync = domSyncFor(inputState);

	const draftRef = useRef(draft);
	draftRef.current = inputState.draft;
	const getDraft = useCallback((): Draft => draftRef.current, []);

	useEffect(() => {
		setInputState((prev) => {
			const prevValue = serializeDraft(prev.draft);
			if (prevValue === taskInput) return prev;
			return { kind: "needs-dom-reconcile", draft: parseDraft(taskInput) };
		});
	}, [taskInput]);

	// 打字路径 (A):ChipInput 报告 (value, offset),重建 Draft + 更新 picker mode。
	// design: 用 onReadRef 避免 handleRead 与 mode 之间的声明顺序环(TDZ)。
	// mode 在下面定义,这里先占 ref 位,mode 变化时同步更新 ref。
	const onReadRef = useRef<(value: string, offset: number) => void>(() => {});
	const handleRead = useCallback((value: string, offset: number): void => {
		setInputState({
			kind: "browser-editing",
			draft: parseDraftAtOffset(value, offset),
		});
		onReadRef.current(value, offset);
	}, []);

	const dispatch = useCallback(
		(command: EditorCommand): void => {
			const result = applyCommand(draftRef.current, command);
			if (result.kind === "draft-updated") {
				setInputState({
					kind: "needs-dom-reconcile",
					draft: result.draft,
				});
				browsergentStore.getState().setTaskDraft(serializeDraft(result.draft));
			} else if (result.kind === "submitted") {
				browsergentStore.getState().setTaskDraft(result.value);
				setInputState({
					kind: "needs-dom-reconcile",
					draft: result.nextDraft,
				});
				onRun();
			}
		},
		[onRun],
	);

	const mode = useInputMode({
		filesController,
		isRunning,
		onSubmit: () => dispatch({ kind: "submit" }),
		getDraft,
		dispatch,
	});
	onReadRef.current = mode.onRead;

	const internalRef = useRef<HTMLDivElement | null>(null);
	const setInputRef = useCallback(
		(node: HTMLDivElement | null): void => {
			internalRef.current = node;
			if (!inputRef) return;
			if (typeof inputRef === "object") {
				inputRef.current = node;
			} else {
				inputRef(node);
			}
		},
		[inputRef],
	);

	// Auto-grow the contentEditable to fit content, capped at MAX_INPUT_HEIGHT.
	const draftValue = serializeDraft(draft);
	useEffect(() => {
		const el = internalRef.current;
		if (!el) return;
		if (!draftValue) {
			el.style.height = "";
			return;
		}
		el.style.height = "auto";
		const next = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
		el.style.height = `${next}px`;
	}, [draftValue]);

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
			browsergentStore.getState().setChatUploadStatus({ kind: "uploading" });
			try {
				const nodes = await filesController.uploadFiles(files);
				for (const node of nodes) {
					browsergentStore.getState().addFileNode(node);
				}
				onFilesChanged?.();
				for (const node of nodes) {
					const token = buildFileMentionToken(node.id, node.name);
					dispatch({
						kind: "insert-chip",
						inline: {
							kind: "chip",
							chipKind: "file",
							raw: token,
							label: node.name,
							title: node.name,
						},
					});
				}
				requestAnimationFrame(() => {
					internalRef.current?.focus();
				});
				browsergentStore.getState().setChatUploadStatus({ kind: "idle" });
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "File upload failed";
				browsergentStore
					.getState()
					.setChatUploadStatus({ kind: "error", message });
			}
		},
		[filesController, sessionId, dispatch, onFilesChanged],
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
					{mode.isPickerOpen ? (
						<CommandPicker
							items={mode.pickerItems}
							activeIndex={mode.activeIndex}
							onSelect={mode.applySelection}
							onActiveIndexChange={(i) => mode.setActiveIndex(i)}
							emptyMessage={mode.emptyMessage}
						/>
					) : null}
					<ChipInput
						inputRef={setInputRef}
						draft={draft}
						domSync={domSync}
						onRead={handleRead}
						onKeyDown={mode.onKeyDown}
						onFocus={() => mode.loadSkills()}
						onBlur={mode.onBlur}
						onPaste={handlePaste}
						placeholder="Type a task... (/ for skills, @ for files or tabs, Shift+Enter for newline)"
						disabled={isRunning || isUploading}
						class={INPUT_CLASS}
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
						onClick={() => dispatch({ kind: "submit" })}
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
