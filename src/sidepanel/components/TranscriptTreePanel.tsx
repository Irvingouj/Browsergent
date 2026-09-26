import type { FunctionalComponent } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { SessionController } from "../../controllers/session-controller";
import type {
	SessionTranscript,
	SessionTranscriptEntry,
} from "../../types/session-transcript";
import { transcriptPath } from "../../types/session-transcript";
import { visibleAssistantText } from "../../worker/openai-responses-wire";

interface TranscriptTreePanelProps {
	sessionController: SessionController;
	sessionId: string;
	running: boolean;
	onClose: () => void;
	onSelect: (leafId: string | null, draftText: string | null) => void;
	onFork: (leafId: string | null) => void;
}

interface TreeRow {
	entry: SessionTranscriptEntry;
	depth: number;
}

function rowsInTree(transcript: SessionTranscript): TreeRow[] {
	const childrenByParent = new Map<string | null, SessionTranscriptEntry[]>();
	for (const entry of Object.values(transcript.entries)) {
		const siblings = childrenByParent.get(entry.parentId) ?? [];
		siblings.push(entry);
		childrenByParent.set(entry.parentId, siblings);
	}
	for (const siblings of childrenByParent.values()) {
		siblings.sort((left, right) => {
			const timestampDifference =
				left.message.timestamp - right.message.timestamp;
			return timestampDifference || left.entryId.localeCompare(right.entryId);
		});
	}

	const rows: TreeRow[] = [];
	const visited = new Set<string>();
	const visit = (parentId: string | null, depth: number): void => {
		for (const entry of childrenByParent.get(parentId) ?? []) {
			if (visited.has(entry.entryId)) continue;
			visited.add(entry.entryId);
			rows.push({ entry, depth });
			visit(entry.entryId, depth + 1);
		}
	};
	visit(null, 0);
	return rows;
}

function entryText(entry: SessionTranscriptEntry): string {
	if (entry.displayText) return entry.displayText;
	if (entry.message.role === "tool_result") {
		const text = visibleAssistantText(entry.message.content);
		return text
			? `${entry.message.tool_name}: ${text}`
			: entry.message.tool_name;
	}
	return visibleAssistantText(entry.message.content);
}

function roleLabel(entry: SessionTranscriptEntry): string {
	switch (entry.message.role) {
		case "user":
			return "You";
		case "assistant":
			return "Agent";
		case "tool_result":
			return entry.message.tool_name;
	}
}

export const TranscriptTreePanel: FunctionalComponent<
	TranscriptTreePanelProps
> = ({ sessionController, sessionId, running, onClose, onSelect, onFork }) => {
	const [transcript, setTranscript] = useState<SessionTranscript | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setTranscript(null);
		setError(null);
		void sessionController
			.loadForSession(sessionId)
			.then((session) => {
				if (!cancelled) setTranscript(session?.transcript ?? null);
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setError(
						loadError instanceof Error ? loadError.message : String(loadError),
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [sessionController, sessionId]);

	const rows = useMemo(
		() => (transcript ? rowsInTree(transcript) : []),
		[transcript],
	);
	const activePathIds = useMemo(
		() =>
			new Set(
				transcript
					? transcriptPath(transcript).map((entry) => entry.entryId)
					: [],
			),
		[transcript],
	);

	return (
		<>
			<div
				class="fixed inset-0 z-[120] bg-black/35 backdrop-blur-sm"
				data-testid="transcript-tree-backdrop"
				onClick={onClose}
			/>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="transcript-tree-title"
				aria-describedby="transcript-tree-description"
				data-testid="transcript-tree-panel"
				class="fixed inset-y-0 right-0 z-[121] flex w-[min(440px,100vw)] flex-col border-l border-border bg-bg-surface-solid shadow-xl"
			>
				<header class="flex items-start gap-md border-b border-border p-md">
					<div class="min-w-0 flex-1">
						<h2
							id="transcript-tree-title"
							class="text-sm font-semibold text-text-primary"
						>
							Conversation history
						</h2>
						<p
							id="transcript-tree-description"
							class="mt-xs text-xs text-text-muted"
						>
							Choose where to continue. Earlier branches and browser actions are
							kept.
						</p>
					</div>
					<button
						type="button"
						autoFocus
						aria-label="Close conversation history"
						class="h-7 w-7 shrink-0 rounded-md text-text-secondary hover:bg-bg-hover"
						onClick={onClose}
					>
						×
					</button>
				</header>

				<div class="border-b border-border p-md">
					<button
						type="button"
						data-testid="tree-fork-current"
						disabled={running || transcript === null}
						class="w-full rounded-md border border-accent/50 bg-accent-soft px-sm py-xs text-left text-xs font-medium text-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
						onClick={() => transcript && onFork(transcript.leafId)}
					>
						Fork current branch
					</button>
					{running && (
						<p class="mt-xs text-xs text-text-muted">
							Stop the agent before changing or forking its history.
						</p>
					)}
				</div>

				<div class="flex-1 overflow-auto p-sm">
					{error ? (
						<p role="alert" class="p-sm text-xs text-danger">
							Could not load conversation history: {error}
						</p>
					) : transcript === null ? (
						<p class="p-sm text-xs text-text-muted">Loading history…</p>
					) : rows.length === 0 ? (
						<p class="p-sm text-xs text-text-muted">
							No messages in this conversation yet.
						</p>
					) : (
						<ol class="flex flex-col gap-xs">
							{rows.map(({ entry, depth }) => {
								const text = entryText(entry) || "(no visible text)";
								const userEntry = entry.message.role === "user";
								const selectedLeaf = userEntry ? entry.parentId : entry.entryId;
								return (
									<li
										key={entry.entryId}
										data-testid="transcript-tree-entry"
										data-entry-id={entry.entryId}
										class="rounded-md border border-border bg-bg-base p-sm"
										style={{ marginLeft: `${Math.min(depth, 6) * 12}px` }}
									>
										<div class="mb-xs flex items-center gap-xs text-[10px] uppercase tracking-wide text-text-muted">
											<span>{roleLabel(entry)}</span>
											{activePathIds.has(entry.entryId) && (
												<span class="text-accent">Current path</span>
											)}
										</div>
										<p class="max-h-20 overflow-hidden whitespace-pre-wrap break-words text-xs text-text-primary">
											{text.slice(0, 500)}
										</p>
										<div class="mt-sm flex flex-wrap gap-xs">
											<button
												type="button"
												data-testid={`tree-select-${entry.entryId}`}
												disabled={running}
												class="rounded border border-border px-xs py-[3px] text-xs text-text-secondary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
												onClick={() =>
													onSelect(
														selectedLeaf,
														userEntry ? entry.displayText : null,
													)
												}
											>
												{userEntry ? "Edit & rewind" : "Continue here"}
											</button>
											<button
												type="button"
												data-testid={`tree-fork-${entry.entryId}`}
												disabled={running}
												class="rounded border border-border px-xs py-[3px] text-xs text-text-secondary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
												onClick={() => onFork(entry.entryId)}
											>
												Fork here
											</button>
										</div>
									</li>
								);
							})}
						</ol>
					)}
				</div>
			</section>
		</>
	);
};
