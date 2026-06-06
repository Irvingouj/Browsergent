import type { FunctionalComponent } from "preact";
import { useState } from "preact/hooks";
import type { AgentTraceEntry } from "../../types/messages";

export const TraceEntryCompact: FunctionalComponent<{
	entry: AgentTraceEntry;
}> = ({ entry }) => {
	const [expanded, setExpanded] = useState(false);

	const statusClass =
		entry.status === "done"
			? "bg-accent-green/15 text-accent-green"
			: entry.status === "error"
				? "bg-accent-red/15 text-accent-red"
				: "bg-accent-amber/15 text-accent-amber animate-pulse-glow";
	const statusIcon =
		entry.status === "done" ? "✓" : entry.status === "error" ? "✗" : "…";

	return (
		<div class="rounded-sm border border-white/[0.06] bg-bg-surface overflow-hidden animate-message-in font-mono text-[11px]">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				class="px-sm py-xs flex items-center gap-sm w-full text-left font-mono text-[11px] text-text-secondary bg-transparent border-none cursor-pointer hover:bg-bg-hover transition-colors"
			>
				<span
					class={[
						"w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] flex-shrink-0",
						statusClass,
					].join(" ")}
				>
					{statusIcon}
				</span>
				<span class="text-text-dim text-[10px] min-w-[24px]">
					#{entry.step}
				</span>
				<span class="font-semibold text-text-primary">{entry.toolName}</span>
				{!expanded && entry.toolInput && (
					<span class="text-text-dim truncate text-[10px] flex-1">
						{entry.toolInput.slice(0, 60)}
					</span>
				)}
			</button>
			{expanded && (
				<div class="px-sm py-sm border-t border-white/[0.06] bg-bg-base">
					{entry.toolInput && (
						<div class="mb-sm">
							<div class="text-[10px] uppercase tracking-wider text-text-dim mb-xs">
								Input
							</div>
							<div class="bg-bg-surface border border-white/[0.06] rounded-sm px-sm py-xs text-text-secondary text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
								{entry.toolInput}
							</div>
						</div>
					)}
					{entry.result && (
						<div>
							<div class="text-[10px] uppercase tracking-wider text-text-dim mb-xs">
								Result
							</div>
							<div class="bg-bg-surface border border-white/[0.06] rounded-sm px-sm py-xs text-text-secondary text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
								{entry.result}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
