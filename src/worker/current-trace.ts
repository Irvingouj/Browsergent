/**
 * Shared module for traceId state.
 *
 * The worker's relayExtjsExecution mints a traceId and sets it here;
 * agent-loop.ts and agent-tools.ts read it to stamp trace entries and results.
 * This avoids circular imports between index.ts ↔ agent-loop.ts.
 */

let currentTraceId: string | null = null;

export function setCurrentTraceId(id: string | null): void {
	currentTraceId = id;
}

export function getCurrentTraceId(): string | null {
	return currentTraceId;
}
