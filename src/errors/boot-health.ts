/** Panel boot subsystem health — independent of UI shell `initialized`. */

export type BootComponentStatus =
	| "pending"
	| "ok"
	| "degraded"
	| "fail"
	| "unknown"
	| "dead";

export interface BootHealth {
	idb: BootComponentStatus;
	extjs: BootComponentStatus;
	worker: BootComponentStatus;
	sw: BootComponentStatus;
	windowId: number | null;
	lastHostError: {
		code: string;
		message: string;
		source: string;
		ts: number;
	} | null;
}

export function initialBootHealth(): BootHealth {
	return {
		idb: "pending",
		extjs: "pending",
		worker: "pending",
		sw: "unknown",
		windowId: null,
		lastHostError: null,
	};
}
