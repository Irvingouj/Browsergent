import type { FunctionalComponent } from "preact";
import { useState } from "preact/hooks";
import type { AgentTraceEntry } from "../../types/messages";
import { highlightCode } from "../../utils/syntax-highlight";
import { parseTraceInput } from "../../utils/parse-trace-input";
import { parseToolErrorEnvelope } from "../../worker/tool-error-result";

function SpinnerIcon() {
	return (
		<svg
			class="animate-spin"
			width="12"
			height="12"
			viewBox="0 0 16 16"
			fill="none"
		>
			<circle
				cx="8"
				cy="8"
				r="6"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray="10 6"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function ResultBody({ text }: { text: string }) {
	const envelope = parseToolErrorEnvelope(text);
	if (!envelope) {
		return (
			<div class="bg-bg-surface border border-border rounded-md px-sm py-xs font-mono text-text-secondary text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
				{text}
			</div>
		);
	}
	return (
		<div class="bg-danger-soft border border-danger/30 rounded-md px-sm py-xs font-mono text-[10px] leading-relaxed">
			<div class="text-danger font-semibold">[{envelope.code}] {envelope.message}</div>
			{envelope.hint && (
				<div class="text-text-secondary mt-xs">
					<span class="text-text-dim">Recovery:</span> {envelope.hint}
				</div>
			)}
			{envelope.stack && (
				<details class="mt-xs">
					<summary class="text-text-dim cursor-pointer select-none">Stack</summary>
					<pre class="mt-xs text-text-dim whitespace-pre-wrap break-words max-h-[160px] overflow-auto">{envelope.stack}</pre>
				</details>
			)}
		</div>
	);
}

export const TraceEntryCompact: FunctionalComponent<{
	entry: AgentTraceEntry;
}> = ({ entry }) => {
	const [expanded, setExpanded] = useState(false);
	const parsed = parseTraceInput(entry.toolName, entry.toolInput);
	const highlighted =
		parsed.kind === "js" ? highlightCode(parsed.text, "js") : null;

	const statusClass =
		entry.status === "done"
			? "bg-success-soft text-success"
			: entry.status === "error"
				? "bg-danger-soft text-danger"
				: "bg-warning-soft text-warning";

	const statusIcon =
		entry.status === "done" ? (
			"✓"
		) : entry.status === "error" ? (
			"✗"
		) : (
			<SpinnerIcon />
		);

	return (
		<div class="rounded-md border border-border bg-bg-surface overflow-hidden animate-message-in font-mono text-[11px]">
			<button
				type="button"
				data-testid="trace-entry"
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
						{parsed.preview}
					</span>
				)}
			</button>
			{expanded && (
				<div class="px-sm py-sm border-t border-border bg-bg-base">
					{entry.toolInput && (
						<div class="mb-sm">
							<div class="text-[10px] uppercase tracking-wider text-text-dim mb-xs">
								Input
							</div>
							{parsed.kind === "js" ? (
								<div class="trace-code-block">
									<div class="trace-code-block__header">
										<span class="trace-code-block__lang">JS</span>
									</div>
									<pre dangerouslySetInnerHTML={{ __html: highlighted ?? "" }} />
								</div>
							) : (
								<div class="bg-bg-surface border border-border rounded-md px-sm py-xs text-text-secondary text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
									{parsed.text}
								</div>
							)}
						</div>
					)}
					{entry.result && (
						<div>
							<div class="text-[10px] uppercase tracking-wider text-text-dim mb-xs">
								Result
							</div>
							<ResultBody text={entry.result} />
						</div>
					)}
				</div>
			)}
		</div>
	);
};
