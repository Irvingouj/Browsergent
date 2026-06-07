import { describe, expect, test, vi } from "vitest";
import type { AgentTraceEntry, ChatMessage } from "../../src/types/messages";

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
			messages,
			trace,
		});

		expect(createElementSpy).toHaveBeenCalledWith("a");
		expect(urlSpy).toHaveBeenCalledOnce();
		expect(clickSpy).toHaveBeenCalledOnce();

		const blob = urlSpy.mock.calls[0][0] as Blob;
		const text = await blob.text();
		const parsed = JSON.parse(text);
		expect(parsed.messages).toEqual(messages);
		expect(parsed.trace).toEqual(trace);
		expect(parsed.exportedAt).toBe("2026-06-06T00:00:00Z");

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

		exportConversation({ exportedAt: "2026-06-06T00:00:00Z", messages: [], trace: [] });

		expect(anchor.download).toMatch(/^browsergent-conversation-\d+\.json$/);

		vi.unstubAllGlobals();
	});
});
