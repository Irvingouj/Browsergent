interface Pending<T> {
	resolve: (result: T) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * In-flight request/response pairing shared by the file and bash relays.
 * The caller owns the request id and what gets posted.
 */
export class PendingRelay<T> {
	private readonly pending = new Map<string, Pending<T>>();

	constructor(
		private readonly timeoutMs: number,
		private readonly timeoutError: (timeoutMs: number) => Error,
	) {}

	wait(id: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pending.delete(id);
				reject(this.timeoutError(this.timeoutMs));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timeoutId });
		});
	}

	resolve(id: string, result: T): void {
		const entry = this.take(id);
		if (!entry) return;
		entry.resolve(result);
	}

	reject(id: string, error: Error): void {
		const entry = this.take(id);
		if (!entry) return;
		entry.reject(error);
	}

	rejectAll(reason: string, toError: (reason: string) => Error): void {
		for (const id of this.pending.keys()) {
			this.reject(id, toError(reason));
		}
	}

	private take(id: string): Pending<T> | undefined {
		const entry = this.pending.get(id);
		if (!entry) return undefined;
		clearTimeout(entry.timeoutId);
		this.pending.delete(id);
		return entry;
	}
}
