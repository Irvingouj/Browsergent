/** Result of one simulated bash command. Shared by the worker tool and the panel shell. */
export interface BashCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Machine-readable codes for bash failures that never become a command transcript. */
export enum BashErrorCode {
	Failed = "E_BASH_FAILED",
	Timeout = "E_BASH_TIMEOUT",
	Protocol = "E_PROTOCOL",
	NoSession = "E_BASH_NO_SESSION",
}

export class BashRelayError extends Error {
	readonly code: BashErrorCode;

	constructor(code: BashErrorCode, message: string) {
		super(message);
		this.name = "BashRelayError";
		this.code = code;
	}
}

export class BashTimeoutError extends Error {
	readonly code = BashErrorCode.Timeout;

	constructor() {
		super("bash: timed out");
		this.name = "BashTimeoutError";
	}
}

/** Cwd bucket for bridge CLI commands. Agent sessions use their session id. */
export const CLI_BASH_KEY = "cli";
