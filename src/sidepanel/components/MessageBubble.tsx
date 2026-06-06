import { useSignalEffect } from "@preact/signals";
import type { FunctionalComponent } from "preact";
import { useCallback, useRef, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import { type BrowsergentStore, browsergentStore } from "../../state/store";
import { getStreamingSignal } from "../../state/streaming-signals";
import {
	createStreamingMarkdownRenderer,
	renderMarkdown,
} from "../../utils/markdown-stream";

export const MessageBubble: FunctionalComponent<{ messageId: string }> = ({
	messageId,
}) => {
	const message = useStore(
		browsergentStore,
		useCallback(
			(s: BrowsergentStore) => s.chat.messagesById[messageId],
			[messageId],
		),
	);
	const [, forceUpdate] = useState(0);

	const streamingSig = getStreamingSignal(messageId);
	useSignalEffect(() => {
		if (streamingSig) {
			void streamingSig.value;
			forceUpdate((n) => n + 1);
		}
	});

	if (!message) return null;

	const isStreaming = !!streamingSig;
	const text = isStreaming ? streamingSig?.value : message.text;

	const rendererRef = useRef<ReturnType<
		typeof createStreamingMarkdownRenderer
	> | null>(null);
	if (isStreaming && !rendererRef.current) {
		rendererRef.current = createStreamingMarkdownRenderer();
	}
	if (!isStreaming && rendererRef.current) {
		rendererRef.current = null;
	}

	const html =
		isStreaming && rendererRef.current
			? rendererRef.current(text)
			: renderMarkdown(text);

	return (
		<div
			data-testid={`chat-message-${message.kind}`}
			style={{
				marginBottom: "8px",
				padding: "8px 10px",
				borderRadius: "4px",
				background:
					message.kind === "user"
						? "#e3f2fd"
						: message.kind === "system"
							? "#fff3e0"
							: "#f5f5f5",
				lineHeight: "1.5",
			}}
		>
			<div
				style={{
					fontSize: "11px",
					color: "#666",
					marginBottom: "4px",
					textTransform: "capitalize",
				}}
			>
				{message.kind}
			</div>
			<div dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	);
};
