import { describe, expect, test } from "vitest";
import {
	appendStreamingDelta,
	finalizeAllStreamingSignals,
	finalizeStreamingSignal,
	getStreamingSignal,
	initStreamingSignal,
} from "../../src/state/streaming-signals";

describe("streaming-signals", () => {
	test.afterEach(() => {
		finalizeAllStreamingSignals();
	});

	test("initStreamingSignal creates an empty signal", () => {
		initStreamingSignal("test-1");
		const sig = getStreamingSignal("test-1");
		expect(sig).toBeDefined();
		expect(sig!.value).toBe("");
	});

	test("initStreamingSignal is idempotent", () => {
		initStreamingSignal("test-2");
		appendStreamingDelta("test-2", "hello");
		initStreamingSignal("test-2");
		expect(getStreamingSignal("test-2")!.value).toBe("hello");
	});

	test("appendStreamingDelta auto-creates signal if missing", () => {
		appendStreamingDelta("test-3", "world");
		expect(getStreamingSignal("test-3")!.value).toBe("world");
	});

	test("appendStreamingDelta concatenates to existing signal", () => {
		appendStreamingDelta("test-4", "hello");
		appendStreamingDelta("test-4", " ");
		appendStreamingDelta("test-4", "world");
		expect(getStreamingSignal("test-4")!.value).toBe("hello world");
	});

	test("getStreamingSignal returns undefined for unknown id", () => {
		expect(getStreamingSignal("nonexistent")).toBeUndefined();
	});

	test("finalizeStreamingSignal returns text and deletes signal", () => {
		appendStreamingDelta("test-5", "content");
		const text = finalizeStreamingSignal("test-5");
		expect(text).toBe("content");
		expect(getStreamingSignal("test-5")).toBeUndefined();
	});

	test("finalizeStreamingSignal returns empty string for unknown id", () => {
		const text = finalizeStreamingSignal("never-existed");
		expect(text).toBe("");
	});
});

describe("finalizeAllStreamingSignals", () => {
	test("returns all active signals and clears map", () => {
		appendStreamingDelta("a1", "alpha");
		appendStreamingDelta("b2", "beta");
		const results = finalizeAllStreamingSignals();
		expect(results).toHaveLength(2);
		expect(results.find((r) => r.messageId === "a1")!.text).toBe("alpha");
		expect(results.find((r) => r.messageId === "b2")!.text).toBe("beta");
		expect(getStreamingSignal("a1")).toBeUndefined();
		expect(getStreamingSignal("b2")).toBeUndefined();
	});

	test("returns empty array when no active signals", () => {
		expect(finalizeAllStreamingSignals()).toEqual([]);
	});
});
