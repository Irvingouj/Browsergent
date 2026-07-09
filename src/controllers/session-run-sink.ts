import type { SessionController } from "./session-controller";
import {
	applyRunEvent,
	createSessionSnapshot,
	type SessionSnapshot,
} from "./apply-run-event";
import type { WorkerToPanel } from "../types/messages";

export class SessionRunSink {
	private readonly buffers = new Map<string, SessionSnapshot>();
	private readonly bufferLoads = new Map<string, Promise<SessionSnapshot>>();
	private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(private readonly sessionController: SessionController) {}

	invalidate(sessionId: string): void {
		this.buffers.delete(sessionId);
		this.bufferLoads.delete(sessionId);
		const timer = this.saveTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			this.saveTimers.delete(sessionId);
		}
	}

	async applyEvent(sessionId: string, event: WorkerToPanel): Promise<void> {
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
			const loaded = await this.sessionController.loadForSession(sessionId);
			const snapshot = createSessionSnapshot(
				loaded?.messages ?? [],
				loaded?.trace ?? [],
				loaded?.diagnostics ?? [],
			);
			this.buffers.set(sessionId, snapshot);
			this.bufferLoads.delete(sessionId);
			return snapshot;
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
			);
		}, 300);
		this.saveTimers.set(sessionId, timer);
	}

	async flush(sessionId: string): Promise<void> {
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
		);
	}
}