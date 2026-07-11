import type { WindowLifecycleMessage } from "../protocol/window-lifecycle";

export type LifecycleDecision =
	| { action: "split"; sourceWindowId: number; newWindowId: number }
	| { action: "merge"; removedWindowId: number; survivorWindowId: number }
	| { action: "close"; removedWindowId: number }
	| {
			action: "none";
			mergePending?: { removedWindowId: number; survivorWindowId: number };
	  };

/**
 * Pure Chrome window/tab lifecycle correlation (unit-tested without Chrome APIs).
 *
 * Split: tab detached from source, attached to a newly created window.
 * Merge: tab detached from removed window, attached to an existing survivor window.
 * Close: window removed without a recorded merge target (sessions keep windowId).
 */
export class WindowLifecycleTracker {
	private readonly pendingDetach = new Map<number, number>();
	private readonly recentlyCreatedWindows = new Set<number>();
	/** removedWindowId → survivorWindowId when tabs moved into an existing window */
	private readonly mergeTargets = new Map<number, number>();
	/** Await onWindowCreated before classifying cross-window attach as merge vs split */
	private deferredAttach: {
		tabId: number;
		oldWindowId: number;
		newWindowId: number;
	} | null = null;

	onTabDetached(tabId: number, oldWindowId: number): void {
		this.pendingDetach.set(tabId, oldWindowId);
	}

	onTabRemoved(tabId: number): void {
		this.pendingDetach.delete(tabId);
	}

	onWindowCreated(windowId: number): LifecycleDecision {
		this.recentlyCreatedWindows.add(windowId);
		return this.resolveDeferredSplit(windowId);
	}

	onTabAttached(tabId: number, newWindowId: number): LifecycleDecision {
		const oldWindowId = this.pendingDetach.get(tabId);
		this.pendingDetach.delete(tabId);
		if (oldWindowId === undefined || oldWindowId === newWindowId) {
			return { action: "none" };
		}

		if (this.recentlyCreatedWindows.has(newWindowId)) {
			this.recentlyCreatedWindows.delete(newWindowId);
			return {
				action: "split",
				sourceWindowId: oldWindowId,
				newWindowId,
			};
		}

		this.deferredAttach = { tabId, oldWindowId, newWindowId };
		return { action: "none" };
	}

	/** Finalize a deferred attach once onWindowCreated has had a chance to run. */
	finalizeDeferredAttach(): LifecycleDecision {
		if (!this.deferredAttach) {
			return { action: "none" };
		}
		const { oldWindowId, newWindowId } = this.deferredAttach;
		this.deferredAttach = null;

		if (this.recentlyCreatedWindows.has(newWindowId)) {
			this.recentlyCreatedWindows.delete(newWindowId);
			return {
				action: "split",
				sourceWindowId: oldWindowId,
				newWindowId,
			};
		}

		this.mergeTargets.set(oldWindowId, newWindowId);
		return {
			action: "none",
			mergePending: {
				removedWindowId: oldWindowId,
				survivorWindowId: newWindowId,
			},
		};
	}

	private resolveDeferredSplit(newWindowId: number): LifecycleDecision {
		if (
			!this.deferredAttach ||
			this.deferredAttach.newWindowId !== newWindowId
		) {
			return { action: "none" };
		}
		const { oldWindowId } = this.deferredAttach;
		this.deferredAttach = null;
		this.recentlyCreatedWindows.delete(newWindowId);
		return {
			action: "split",
			sourceWindowId: oldWindowId,
			newWindowId,
		};
	}

	hasMergeTarget(removedWindowId: number): boolean {
		return this.mergeTargets.has(removedWindowId);
	}

	consumeMerge(removedWindowId: number): LifecycleDecision {
		const survivorWindowId = this.mergeTargets.get(removedWindowId);
		this.mergeTargets.delete(removedWindowId);
		if (survivorWindowId === undefined) {
			return { action: "close", removedWindowId };
		}
		return { action: "merge", removedWindowId, survivorWindowId };
	}

	onWindowRemoved(removedWindowId: number): LifecycleDecision {
		return this.consumeMerge(removedWindowId);
	}
}

export function decisionToLifecycleMessage(
	decision: LifecycleDecision,
	reboundRunningSessionIds: string[] = [],
): WindowLifecycleMessage | null {
	switch (decision.action) {
		case "split":
			return {
				type: "windowLifecycle",
				kind: "split",
				sourceWindowId: decision.sourceWindowId,
				newWindowId: decision.newWindowId,
			};
		case "merge":
			return {
				type: "windowLifecycle",
				kind: "merge",
				removedWindowId: decision.removedWindowId,
				survivorWindowId: decision.survivorWindowId,
				reboundRunningSessionIds:
					reboundRunningSessionIds.length > 0
						? reboundRunningSessionIds
						: undefined,
			};
		case "close":
			return {
				type: "windowLifecycle",
				kind: "close",
				removedWindowId: decision.removedWindowId,
			};
		default:
			return null;
	}
}
