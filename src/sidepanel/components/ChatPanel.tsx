import type { FunctionalComponent } from "preact";
import { useMemo } from "preact/hooks";
import { useStore } from "zustand/react";
import {
	selectMessageIds,
	selectMessagesById,
	selectTraceEntries,
} from "../../state/selectors";
import { browsergentStore } from "../../state/store";
import { MessageBubble } from "./MessageBubble";
import { TraceEntryCompact } from "./TraceEntryCompact";

export const ChatPanel: FunctionalComponent = () => {
	const messageIds = useStore(browsergentStore, selectMessageIds);
	const messagesById = useStore(browsergentStore, selectMessagesById);
	const trace = useStore(browsergentStore, selectTraceEntries);

	const timeline = useMemo(() => {
		const items = [
			...messageIds.map((id) => ({
				type: "message" as const,
				id,
				ts: messagesById[id]?.timestamp ?? 0,
			})),
			...trace.map((t) => ({
				type: "trace" as const,
				id: t.id,
				ts: t.timestamp,
			})),
		];
		items.sort((a, b) => a.ts - b.ts);
		return items;
	}, [messageIds, messagesById, trace]);

	return (
		<div class="flex flex-col gap-sm">
			{timeline.map((item) =>
				item.type === "message" ? (
					<MessageBubble key={item.id} messageId={item.id} />
				) : (
					(() => {
						const entry = trace.find((t) => t.id === item.id);
						return entry ? (
							<TraceEntryCompact key={item.id} entry={entry} />
						) : null;
					})()
				),
			)}
		</div>
	);
};
