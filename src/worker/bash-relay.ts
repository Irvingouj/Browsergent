import {
	type BashCommandResult,
	BashErrorCode,
	BashRelayError,
} from "../bash/types";
import { PendingRelay } from "./pending-relay";

/** Longer than the shell timeout so a command can return its own timeout transcript. */
export const BASH_RELAY_TIMEOUT_MS = 45_000;

export interface BashRelayRequest {
	id: string;
	sessionId: string;
	command: string;
}

export class BashRelay {
	private readonly pending: PendingRelay<BashCommandResult>;
	private counter = 0;

	constructor(
		private readonly postRequest: (request: BashRelayRequest) => void,
		timeoutMs: number = BASH_RELAY_TIMEOUT_MS,
	) {
		this.pending = new PendingRelay(
			timeoutMs,
			(ms) =>
				new BashRelayError(
					BashErrorCode.Timeout,
					`Bash relay timed out after ${ms}ms`,
				),
		);
	}

	relay(sessionId: string, command: string): Promise<BashCommandResult> {
		const relayId = `bash-${++this.counter}`;
		const promise = this.pending.wait(relayId);
		this.postRequest({ id: relayId, sessionId, command });
		return promise;
	}

	resolve(id: string, result: BashCommandResult): void {
		this.pending.resolve(id, result);
	}

	reject(id: string, error: BashRelayError): void {
		this.pending.reject(id, error);
	}

	rejectAll(reason: string): void {
		this.pending.rejectAll(
			reason,
			(message) => new BashRelayError(BashErrorCode.Failed, message),
		);
	}
}
