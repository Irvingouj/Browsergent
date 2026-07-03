import type { FunctionalComponent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import { browsergentStore } from "../../state/store";
import { getStreamingSignal } from "../../state/streaming-signals";

export const ChatContextMenu: FunctionalComponent = () => {
	const menu = useStore(browsergentStore, (s) => s.ui.chatContextMenu);
	const [, forceUpdate] = useState(0);
	const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => () => clearTimeout(copiedTimerRef.current ?? undefined), []);

	if (!menu) return null;

	const message = browsergentStore.getState().chat.messagesById[menu.messageId];
	if (!message) {
		browsergentStore.getState().closeChatContextMenu();
		return null;
	}

	const streamingSig = getStreamingSignal(menu.messageId);
	const text = streamingSig ? streamingSig.value : message.text;

	const copy = (): void => {
		void navigator.clipboard.writeText(text);
		setCopied(true);
		clearTimeout(copiedTimerRef.current ?? undefined);
		copiedTimerRef.current = setTimeout(() => {
			setCopied(false);
			forceUpdate((n) => n + 1);
		}, 1200);
		browsergentStore.getState().closeChatContextMenu();
	};

	return (
		<>
			<div
				class="fixed inset-0 z-40"
				onMouseDown={() => browsergentStore.getState().closeChatContextMenu()}
				onContextMenu={(e) => {
					e.preventDefault();
					browsergentStore.getState().closeChatContextMenu();
				}}
			/>
			<div
				data-testid="chat-context-menu"
				class="fixed z-50 bg-bg-surface-solid border border-border rounded-md shadow-lg py-xs min-w-[140px]"
				style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
				onContextMenu={(e) => e.preventDefault()}
			>
				<button
					type="button"
					class="w-full text-left px-sm py-xs text-xs text-text-secondary hover:bg-bg-hover"
					onClick={copy}
				>
					{copied ? "Copied!" : "Copy"}
				</button>
			</div>
		</>
	);
};
