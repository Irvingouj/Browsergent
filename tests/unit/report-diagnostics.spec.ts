import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	clearMemoryDiagRing,
	getMemoryDiagRing,
	reportError,
	reportWarn,
	safeListener,
	type DiagnosticReport,
} from "../../src/errors/report";

describe("report diagnostics", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		clearMemoryDiagRing();
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		warnSpy.mockRestore();
		clearMemoryDiagRing();
	});

	test("reportError writes fixed prefix and ring entry", () => {
		const report = reportError({
			code: "E_SW_LISTENER",
			source: "sw",
			message: "boom",
			details: { listener: "test" },
		});

		expect(report.level).toBe("error");
		expect(report.code).toBe("E_SW_LISTENER");
		expect(errorSpy).toHaveBeenCalled();
		const line = String(errorSpy.mock.calls[0]?.[0] ?? "");
		expect(line).toContain("[browsergent][error]");
		expect(line).toContain("code=E_SW_LISTENER");
		expect(line).toContain("source=sw");
		expect(getMemoryDiagRing()).toHaveLength(1);
		expect(getMemoryDiagRing()[0]?.message).toBe("boom");
	});

	test("reportWarn uses console.warn", () => {
		reportWarn({
			code: "E_RELAY_SEND",
			source: "relay",
			message: "no receiver",
		});
		expect(warnSpy).toHaveBeenCalled();
		const line = String(warnSpy.mock.calls[0]?.[0] ?? "");
		expect(line).toContain("[browsergent][warn]");
	});

	test("ring truncates at 50 entries", () => {
		for (let i = 0; i < 60; i++) {
			reportError({
				code: "E_HOST_UNKNOWN",
				source: "panel",
				message: `msg-${i}`,
			});
		}
		const ring = getMemoryDiagRing();
		expect(ring).toHaveLength(50);
		expect(ring[0]?.message).toBe("msg-10");
		expect(ring[49]?.message).toBe("msg-59");
	});

	test("safeListener swallows sync throw and reports", () => {
		const wrapped = safeListener("unit-throw", () => {
			throw new Error("sync fail");
		}, "sw");

		expect(() => wrapped()).not.toThrow();
		expect(errorSpy).toHaveBeenCalled();
		const line = String(errorSpy.mock.calls[0]?.[0] ?? "");
		expect(line).toContain("E_SW_LISTENER");
		expect(line).toContain("unit-throw");
	});

	test("safeListener swallows async rejection and reports", async () => {
		const wrapped = safeListener(
			"unit-async",
			async () => {
				throw new Error("async fail");
			},
			"sw",
		);

		wrapped();
		// flush microtasks
		await Promise.resolve();
		await Promise.resolve();

		expect(errorSpy).toHaveBeenCalled();
		const joined = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(joined).toContain("unit-async");
	});

	test("message is truncated to 500 chars", () => {
		const long = "x".repeat(600);
		const report: DiagnosticReport = reportError({
			code: "E_HOST_UNKNOWN",
			source: "panel",
			message: long,
		});
		expect(report.message.length).toBeLessThanOrEqual(501);
		expect(report.message.endsWith("…")).toBe(true);
	});
});
