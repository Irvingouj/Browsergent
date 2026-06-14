export const FILE_OP_RELAY_TIMEOUT_MS = 30_000;

export interface FileOpListEntry {
	id: string;
	name: string;
	size: number;
	mime: string;
	isText: boolean;
}

export type FileOp =
	| { op: "list"; prefix?: string }
	| { op: "read"; path: string }
	| {
			op: "edit";
			path: string;
			oldString: string;
			newString: string;
			replaceAll?: boolean;
	  }
	| { op: "delete"; path: string }
	| { op: "write"; path: string; content: string };

export type FileOpResult =
	| { op: "list"; files: FileOpListEntry[] }
	| { op: "read"; content: string; bytes: number; truncated: boolean }
	| { op: "edit"; occurrences: number; bytes: number }
	| { op: "delete" }
	| { op: "write"; bytes: number };

export interface FileOpRelayRequest {
	id: string;
	sessionId: string;
	op: FileOp;
}

interface PendingEntry {
	resolve: (result: FileOpResult) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

export class FileOpRelay {
	private readonly pending = new Map<string, PendingEntry>();
	private counter = 0;

	constructor(
		private readonly postRequest: (request: FileOpRelayRequest) => void,
		private readonly timeoutMs: number = FILE_OP_RELAY_TIMEOUT_MS,
	) {}

	relay(sessionId: string, op: FileOp): Promise<FileOpResult> {
		const relayId = `file-op-${++this.counter}`;

		const promise = new Promise<FileOpResult>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pending.delete(relayId);
				reject(
					new Error(
						`File op relay timed out after ${this.timeoutMs}ms`,
					),
				);
			}, this.timeoutMs);

			this.pending.set(relayId, { resolve, reject, timeoutId });
		});

		this.postRequest({ id: relayId, sessionId, op });
		return promise;
	}

	resolve(id: string, result: FileOpResult): void {
		const entry = this.pending.get(id);
		if (!entry) return;
		clearTimeout(entry.timeoutId);
		this.pending.delete(id);
		entry.resolve(result);
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
