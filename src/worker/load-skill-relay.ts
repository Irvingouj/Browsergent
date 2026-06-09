export const LOAD_SKILL_RELAY_TIMEOUT_MS = 30_000;

export interface LoadSkillRelayRequest {
	id: string;
	skill: string;
	path?: string;
}

interface PendingEntry {
	resolve: (content: string) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

export class LoadSkillRelay {
	private readonly pending = new Map<string, PendingEntry>();
	private counter = 0;

	constructor(
		private readonly postRequest: (request: LoadSkillRelayRequest) => void,
		private readonly timeoutMs: number = LOAD_SKILL_RELAY_TIMEOUT_MS,
	) {}

	relay(skill: string, resourcePath?: string): Promise<string> {
		const relayId = `load-skill-${++this.counter}`;

		const promise = new Promise<string>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pending.delete(relayId);
				reject(
					new Error(
						`Load skill relay timed out after ${this.timeoutMs}ms`,
					),
				);
			}, this.timeoutMs);

			this.pending.set(relayId, { resolve, reject, timeoutId });
		});

		this.postRequest({ id: relayId, skill, path: resourcePath });
		return promise;
	}

	resolve(id: string, content: string): void {
		const entry = this.pending.get(id);
		if (!entry) return;
		clearTimeout(entry.timeoutId);
		this.pending.delete(id);
		entry.resolve(content);
	}

	reject(id: string, error: string): void {
		const entry = this.pending.get(id);
		if (!entry) return;
		clearTimeout(entry.timeoutId);
		this.pending.delete(id);
		entry.reject(new Error(error));
	}

	rejectAll(reason: string): void {
		for (const [id, entry] of this.pending) {
			clearTimeout(entry.timeoutId);
			entry.reject(new Error(reason));
			this.pending.delete(id);
		}
	}
}
