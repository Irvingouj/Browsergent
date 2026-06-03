import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

const streamingSignals = new Map<string, Signal<string>>();

export function getStreamingSignal(
	messageId: string,
): Signal<string> | undefined {
	return streamingSignals.get(messageId);
}

export function appendStreamingDelta(
	messageId: string,
	delta: string,
): void {
	let sig = streamingSignals.get(messageId);
	if (!sig) {
		sig = signal("");
		streamingSignals.set(messageId, sig);
	}
	sig.value = sig.value + delta;
}

export function finalizeStreamingSignal(messageId: string): string {
	const sig = streamingSignals.get(messageId);
	if (!sig) return "";
	const text = sig.value;
	streamingSignals.delete(messageId);
	return text;
}

export function initStreamingSignal(messageId: string): void {
	if (!streamingSignals.has(messageId)) {
		streamingSignals.set(messageId, signal(""));
	}
}

export function finalizeAllStreamingSignals(): Array<{ messageId: string; text: string }> {
	const results: Array<{ messageId: string; text: string }> = [];
	for (const [messageId, sig] of streamingSignals) {
		results.push({ messageId, text: sig.value });
	}
	streamingSignals.clear();
	return results;
}
