import type { FunctionalComponent } from "preact";
import { useCallback } from "preact/hooks";
import { useStore } from "zustand/react";
import {
	selectExtjsStatus,
	selectJsCodeDraft,
	selectTraceEntries,
} from "../../state/selectors";
import { browsergentStore } from "../../state/store";
import { formatError, formatJsRunResult } from "../../types/extjs-utils";
import { ExtensionJsClient } from "../extension-js-client";
import { TraceEntryCompact } from "./TraceEntryCompact";

export const JsPlaybookPanel: FunctionalComponent = () => {
	const jsCode = useStore(browsergentStore, selectJsCodeDraft);
	const trace = useStore(browsergentStore, selectTraceEntries);
	const extjsStatus = useStore(browsergentStore, selectExtjsStatus);

	const handleRun = useCallback(() => {
		const code = jsCode.trim();
		if (!code) return;

		const runId = crypto.randomUUID();
		const step = browsergentStore.getState().trace.entries.length + 1;

		browsergentStore.getState().extjsRunning();
		browsergentStore.getState().traceUpdated({
			id: runId,
			step,
			status: "running",
			toolName: "js",
			toolInput: code,
			timestamp: Date.now(),
		});

		ExtensionJsClient.getInstance()
			.runJs(code)
			.then((result) => {
				const output =
					result.status === "err"
						? formatError(result.error)
						: formatJsRunResult(result);
				browsergentStore.getState().traceUpdated({
					id: runId,
					step,
					status: result.status === "err" ? "error" : "done",
					toolName: "js",
					result: output,
					timestamp: Date.now(),
				});
				browsergentStore.getState().extjsReady();
			})
			.catch((err) => {
				browsergentStore.getState().traceUpdated({
					id: runId,
					step,
					status: "error",
					toolName: "js",
					result: err instanceof Error ? err.message : String(err),
					timestamp: Date.now(),
				});
				browsergentStore.getState().extjsFailed({
					code: "E_JS_RUNTIME",
					message: err instanceof Error ? err.message : String(err),
					source: "js",
				});
			});
	}, [jsCode]);

	const handleStop = useCallback(() => {
		ExtensionJsClient.getInstance()
			.stop()
			.catch((err: unknown) => {
				console.warn("JS stop failed:", err);
			});
	}, []);

	const isRunning = extjsStatus === "running";

	return (
		<div class="flex flex-col gap-sm flex-1 h-full">
			<div class="flex gap-sm items-center">
				{isRunning ? (
					<button
						type="button"
						onClick={handleStop}
						class="px-md py-sm rounded-md font-sans text-sm font-semibold cursor-pointer transition-all flex items-center gap-xs whitespace-nowrap min-h-[36px] bg-danger-soft text-danger border border-danger hover:bg-danger-soft hover:"
					>
						<span class="w-1.5 h-1.5 rounded-full bg-danger" />
						Stop
					</button>
				) : (
					<button
						type="button"
						onClick={handleRun}
						class="px-md py-sm rounded-full font-sans text-sm font-semibold cursor-pointer transition-all whitespace-nowrap min-h-[36px] bg-text-primary text-bg-base hover:bg-text-secondary active:bg-text-muted"
					>
						Run
					</button>
				)}
			</div>
			<textarea
				value={jsCode}
				onInput={(e) =>
					browsergentStore
						.getState()
						.setJsCodeDraft((e.target as HTMLTextAreaElement).value)
				}
				placeholder="Type JS code..."
				class="flex-1 bg-bg-base border border-border-strong rounded-md px-md py-sm text-text-primary font-mono text-sm outline-none transition-all min-h-[200px] focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim resize-none"
			/>
			<div class="flex flex-col gap-sm">
				{trace.map((entry) => (
					<TraceEntryCompact key={entry.id} entry={entry} />
				))}
			</div>
		</div>
	);
};
