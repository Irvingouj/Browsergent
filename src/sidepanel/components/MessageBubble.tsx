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

	const baseClasses = [
		"relative rounded-md p-sm px-md animate-message-in max-w-full message-bubble",
		"[overflow-wrap:break-word]",
	];

	const kindClasses =
		message.kind === "user"
			? [
					"self-end ml-6 bg-accent-amber-dim border border-accent-amber-dim",
					"msg-label msg-label--user",
				]
			: message.kind === "assistant"
				? [
						"self-start mr-6 bg-bg-elevated border border-white/10",
						"msg-label msg-label--assistant",
					]
				: [
						"self-center text-xs bg-accent-purple/8 border border-accent-purple/20",
						"msg-label msg-label--system",
					];

	return (
		<div
			data-testid={`chat-message-${message.kind}`}
			class={[
				...baseClasses,
				...kindClasses,
				isStreaming ? "streaming-cursor" : "",
			].join(" ")}
		>
			<div dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	);
};
