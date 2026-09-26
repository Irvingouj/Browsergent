import type { WorkerToPanel } from "../types/messages";
import {
	applyRunEvent,
	createSessionSnapshot,
	type SessionSnapshot,
} from "./apply-run-event";
import type { SessionController } from "./session-controller";

export class SessionRunSink {
	private readonly buffers = new Map<string, SessionSnapshot>();
	private readonly bufferLoads = new Map<string, Promise<SessionSnapshot>>();
	private readonly eventQueues = new Map<string, Promise<void>>();
	private readonly saveTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

	constructor(private readonly sessionController: SessionController) {}

	invalidate(sessionId: string): void {
		this.buffers.delete(sessionId);
		this.bufferLoads.delete(sessionId);
		this.eventQueues.delete(sessionId);
		const timer = this.saveTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			this.saveTimers.delete(sessionId);
		}
	}

	async applyEvent(sessionId: string, event: WorkerToPanel): Promise<void> {
		const previous = this.eventQueues.get(sessionId) ?? Promise.resolve();
		const record = () => this.recordEvent(sessionId, event);
		// A rejected event must not cancel events already queued behind it.
		const current = previous.then(record, record);
		this.eventQueues.set(sessionId, current);
		try {
			await current;
		} finally {
			if (this.eventQueues.get(sessionId) === current) {
				this.eventQueues.delete(sessionId);
			}
		}
	}

	private async recordEvent(
		sessionId: string,
		event: WorkerToPanel,
	): Promise<void> {
		const snapshot = await this.ensureBuffer(sessionId);
		applyRunEvent(snapshot, event);
		this.scheduleSave(sessionId, snapshot);
	}

	private async ensureBuffer(sessionId: string): Promise<SessionSnapshot> {
		const cached = this.buffers.get(sessionId);
		if (cached) return cached;

		const inflight = this.bufferLoads.get(sessionId);
		if (inflight) return inflight;

		const loadPromise = (async () => {
			try {
				const loaded = await this.sessionController.loadForSession(sessionId);
				const snapshot = createSessionSnapshot(
					loaded?.messages ?? [],
					loaded?.trace ?? [],
					loaded?.diagnostics ?? [],
					loaded?.transcript,
				);
				this.buffers.set(sessionId, snapshot);
				return snapshot;
			} finally {
				this.bufferLoads.delete(sessionId);
			}
		})();
		this.bufferLoads.set(sessionId, loadPromise);
		return loadPromise;
	}

	private scheduleSave(sessionId: string, snapshot: SessionSnapshot): void {
		const existing = this.saveTimers.get(sessionId);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.saveTimers.delete(sessionId);
			void this.sessionController.saveForSession(
				sessionId,
				snapshot.messages,
				snapshot.trace,
				snapshot.diagnostics,
				snapshot.transcript,
			);
		}, 300);
		this.saveTimers.set(sessionId, timer);
	}

	async flush(sessionId: string): Promise<void> {
		await this.eventQueues.get(sessionId);
		const timer = this.saveTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			this.saveTimers.delete(sessionId);
		}
		const snapshot = this.buffers.get(sessionId);
		if (!snapshot) return;
		await this.sessionController.saveForSession(
			sessionId,
			snapshot.messages,
			snapshot.trace,
			snapshot.diagnostics,
			snapshot.transcript,
		);
	}
}
