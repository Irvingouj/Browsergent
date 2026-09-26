import { PendingRelay } from "./pending-relay";

export const FILE_OP_RELAY_TIMEOUT_MS = 30_000;

export interface FileOpListEntry {
	id: string;
	name: string;
	path: string;
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

export class FileOpRelay {
	private readonly pending: PendingRelay<FileOpResult>;
	private counter = 0;

	constructor(
		private readonly postRequest: (request: FileOpRelayRequest) => void,
		timeoutMs: number = FILE_OP_RELAY_TIMEOUT_MS,
	) {
		this.pending = new PendingRelay(
			timeoutMs,
			(ms) => new Error(`File op relay timed out after ${ms}ms`),
		);
	}

	relay(sessionId: string, op: FileOp): Promise<FileOpResult> {
		const relayId = `file-op-${++this.counter}`;
		const promise = this.pending.wait(relayId);
		this.postRequest({ id: relayId, sessionId, op });
		return promise;
	}

	resolve(id: string, result: FileOpResult): void {
		this.pending.resolve(id, result);
	}

	reject(id: string, error: string): void {
		this.pending.reject(id, new Error(error));
	}

	rejectAll(reason: string): void {
		this.pending.rejectAll(reason, (message) => new Error(message));
	}
}
