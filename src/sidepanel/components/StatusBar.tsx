import type { FunctionalComponent } from "preact";
import { useStore } from "zustand/react";
import {
	selectAgentStatus,
	selectAgentStatusReason,
} from "../../state/selectors";
import { browsergentStore } from "../../state/store";

export const StatusBar: FunctionalComponent = () => {
	const status = useStore(browsergentStore, selectAgentStatus);
	const statusReason = useStore(browsergentStore, selectAgentStatusReason);

	return (
		<div
			style={{
				padding: "4px 12px",
				borderTop: "1px solid #e0e0e0",
				fontSize: "11px",
				color: "#666",
			}}
		>
			Status: {status}
			{statusReason ? ` — ${statusReason}` : ""}
		</div>
	);
};
