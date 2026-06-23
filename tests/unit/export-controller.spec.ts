import { describe, expect, test, vi } from "vitest";
import type { AgentTraceEntry, ChatMessage } from "../../src/types/messages";

vi.mock("../../package.json", () => ({
	default: {
		version: "0.1.0",
		dependencies: {
			"@pi-oxide/pi-host-web": "0.9.3",
			"@pi-oxide/extension-js": "0.10.2",
		},
	},
}));

describe("exportConversation", () => {
	test("exports valid JSON with messages and trace", async () => {
		const { exportConversation } = await import(
			"../../src/controllers/export-controller"
		);

		const messages: ChatMessage[] = [
			{ kind: "user", id: "u1", text: "fill form", timestamp: 1 },
			{ kind: "assistant", id: "a1", text: "Done", timestamp: 2 },
		];
		const trace: AgentTraceEntry[] = [
			{ id: "t1", step: 1, status: "done", toolName: "run_js", timestamp: 3 },
		];

		const createElementSpy = vi.fn();
		const clickSpy = vi.fn();
		createElementSpy.mockReturnValue({
			href: "",
			download: "",
			click: clickSpy,
		});
		vi.stubGlobal("document", { createElement: createElementSpy });

		const urlSpy = vi.fn();
		vi.stubGlobal("URL", {
			createObjectURL: urlSpy.mockReturnValue("blob:url"),
			revokeObjectURL: vi.fn(),
		});

		exportConversation({
			exportedAt: "2026-06-06T00:00:00Z",
			packages: {
				browsergent: "0.1.0",
				"pi-host-web": "0.9.3",
				"extension-js": "0.10.2",
			},
			messages,
			trace,
			diagnostics: [],
		});

		expect(createElementSpy).toHaveBeenCalledWith("a");
		expect(urlSpy).toHaveBeenCalledOnce();
		expect(clickSpy).toHaveBeenCalledOnce();

		const blob = urlSpy.mock.calls[0][0] as Blob;
		const text = await blob.text();
		const parsed = JSON.parse(text);
		expect(parsed.messages).toEqual(messages);
		expect(parsed.trace).toEqual(trace);
		expect(parsed.diagnostics).toEqual([]);
		expect(parsed.exportedAt).toBe("2026-06-06T00:00:00Z");
		expect(parsed.packages).toEqual({
			browsergent: "0.1.0",
			"pi-host-web": "0.9.3",
			"extension-js": "0.10.2",
		});

		vi.unstubAllGlobals();
	});

	test("exports complete diagnostic context without truncation", async () => {
		const { exportConversation } = await import(
			"../../src/controllers/export-controller"
		);
		const longText = "x".repeat(100_000);
		const diagnostics = [
			{
				kind: "model_request" as const,
				timestamp: 1,
				instructions: longText,
				messages: [
					{
						id: "tool-result",
						role: "tool_result" as const,
						content: [{ type: "text" as const, text: longText }],
						toolCallId: "tool-1",
					},
				],
				tools: [],
			},
		];

		const anchor = { href: "", download: "", click: vi.fn() };
		vi.stubGlobal("document", {
			createElement: vi.fn().mockReturnValue(anchor),
		});
		const createObjectURL = vi.fn().mockReturnValue("blob:url");
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });

		exportConversation({
			exportedAt: "2026-06-06T00:00:00Z",
			packages: {
				browsergent: "0.1.0",
				"pi-host-web": "0.9.3",
				"extension-js": "0.10.2",
			},
			messages: [],
			trace: [],
			diagnostics,
		});

		const blob = createObjectURL.mock.calls[0][0] as Blob;
		const parsed = JSON.parse(await blob.text());
		expect(parsed.diagnostics).toEqual(diagnostics);

		vi.unstubAllGlobals();
	});

	test("download name includes timestamp", async () => {
		const { exportConversation } = await import(
			"../../src/controllers/export-controller"
		);

		const anchor = { href: "", download: "", click: vi.fn() };
		vi.stubGlobal("document", {
			createElement: vi.fn().mockReturnValue(anchor),
		});
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn().mockReturnValue("blob:url"),
			revokeObjectURL: vi.fn(),
		});

		exportConversation({
			exportedAt: "2026-06-06T00:00:00Z",
			packages: {
				browsergent: "0.1.0",
				"pi-host-web": "0.9.3",
				"extension-js": "0.10.2",
			},
			messages: [],
			trace: [],
			diagnostics: [],
		});

		expect(anchor.download).toMatch(/^browsergent-conversation-\d+\.json$/);

		vi.unstubAllGlobals();
	});

	test("buildExportSnapshot includes package versions", async () => {
		const { buildExportSnapshot } = await import(
			"../../src/controllers/export-controller"
		);

		const snapshot = buildExportSnapshot([], [], []);
		expect(snapshot.packages.browsergent).toBe("0.1.0");
		expect(snapshot.packages["pi-host-web"]).toBe("0.9.3");
		expect(snapshot.packages["extension-js"]).toBe("0.10.2");
		expect(snapshot.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});
