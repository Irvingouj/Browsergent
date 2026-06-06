import type { FunctionalComponent } from "preact";
import { useState } from "preact/hooks";
import type { AgentTraceEntry } from "../../types/messages";

export const TraceEntryCompact: FunctionalComponent<{
	entry: AgentTraceEntry;
}> = ({ entry }) => {
	const [expanded, setExpanded] = useState(false);
	const icon =
		entry.status === "done" ? "✓" : entry.status === "error" ? "✗" : "…";
	const color =
		entry.status === "done"
			? "#22c55e"
			: entry.status === "error"
				? "#ef4444"
				: "#f59e0b";

	return (
		<div
			style={{
				fontSize: "12px",
				borderRadius: "4px",
				border: "1px solid #e0e0e0",
				background: "#fafafa",
				overflow: "hidden",
			}}
		>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				style={{
					padding: "6px 10px",
					display: "flex",
					alignItems: "center",
					gap: "6px",
					cursor: "pointer",
					fontFamily: "monospace",
					width: "100%",
					border: "none",
					background: "transparent",
					textAlign: "left",
				}}
			>
				<span style={{ color }}>{icon}</span>
				<span style={{ color: "#666" }}>#{entry.step}</span>
				<span style={{ fontWeight: "bold" }}>{entry.toolName}</span>
				{!expanded && entry.toolInput && (
					<span
						style={{
							color: "#999",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: 1,
						}}
					>
						{entry.toolInput.slice(0, 60)}
					</span>
				)}
			</button>
			{expanded && (
				<div
					style={{
						padding: "8px 10px",
						borderTop: "1px solid #e0e0e0",
						fontFamily: "monospace",
						fontSize: "11px",
					}}
				>
					{entry.toolInput && (
						<div style={{ marginBottom: "6px" }}>
							<div style={{ color: "#666", marginBottom: "2px" }}>Input:</div>
							<div
								style={{
									whiteSpace: "pre-wrap",
									color: "#333",
									background: "#f0f0f0",
									padding: "4px 6px",
									borderRadius: "3px",
								}}
							>
								{entry.toolInput}
							</div>
						</div>
					)}
					{entry.result && (
						<div>
							<div style={{ color: "#666", marginBottom: "2px" }}>Result:</div>
							<div
								style={{
									whiteSpace: "pre-wrap",
									color: "#333",
									background: "#f0f0f0",
									padding: "4px 6px",
									borderRadius: "3px",
								}}
							>
								{entry.result}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
