import { describe, expect, test, vi } from "vitest";
import { FilesController } from "../../src/controllers/files";
import { BridgeHost } from "../../src/controllers/bridge-host";
import { handleFileOp } from "../../src/sidepanel/file-op-handler";
import type { FsClient } from "../../src/skills/skill-types";
import { createAgentTools } from "../../src/worker/agent-tools";
import type { FileOp, FileOpResult } from "../../src/worker/file-op-relay";

function createMemoryFs(): FsClient {
	const storage = new Map<string, string>();
	return {
		async exists(path: string): Promise<{ exists: boolean }> {
			if (storage.has(path)) return { exists: true };
			const prefix = path === "/" ? "/" : `${path}/`;
			for (const key of storage.keys()) {
				if (key.startsWith(prefix)) return { exists: true };
			}
			return { exists: false };
		},
		async list(
			path: string,
		): Promise<{ entries: { name: string; kind: string }[] }> {
			const prefix = path === "/" ? "/" : `${path}/`;
			const seen = new Set<string>();
			const entries: { name: string; kind: string }[] = [];
			for (const key of storage.keys()) {
				if (!key.startsWith(prefix)) continue;
				const rest = key.slice(prefix.length);
				if (rest.length === 0) continue;
				const firstSeg = rest.split("/")[0] ?? "";
				if (rest.includes("/")) {
					if (!seen.has(firstSeg)) {
						seen.add(firstSeg);
						entries.push({ name: firstSeg, kind: "directory" });
					}
				} else {
					entries.push({ name: firstSeg, kind: "file" });
				}
			}
			return { entries };
		},
		async readText(path: string): Promise<{ data: string }> {
			const data = storage.get(path);
			if (data === undefined) throw new Error(`Not found: ${path}`);
			return { data };
		},
		async writeText(
			path: string,
			data: string,
		): Promise<{ path: string; bytes_written: number }> {
			storage.set(path, data);
			return { path, bytes_written: data.length };
		},
		async writeBase64(
			path: string,
			base64: string,
		): Promise<{ path: string; bytes_written: number }> {
			storage.set(path, base64);
			return { path, bytes_written: base64.length };
		},
		async readBase64(path: string): Promise<{ data: string }> {
			const data = storage.get(path);
			if (data === undefined) throw new Error(`Not found: ${path}`);
			return { data };
		},
		async mkdir(_path: string): Promise<{ ok: true }> {
			return { ok: true };
		},
		async delete(path: string): Promise<{ ok: true }> {
			storage.delete(path);
			return { ok: true };
		},
		async stat(path: string): Promise<{
			path: string;
			name: string;
			kind: string;
			size: number;
			mime: string | null;
			created_at: number | null;
			modified_at: number | null;
		}> {
			return {
				path,
				name: path.substring(path.lastIndexOf("/") + 1),
				kind: "file",
				size: (storage.get(path) ?? "").length,
				mime: null,
				created_at: null,
				modified_at: null,
			};
		},
		async move(from: string, to: string): Promise<{ ok: true }> {
			const data = storage.get(from);
			if (data === undefined) throw new Error(`Not found: ${from}`);
			storage.delete(from);
			storage.set(to, data);
			return { ok: true };
		},
		async copy(from: string, to: string): Promise<{ ok: true }> {
			const data = storage.get(from);
			if (data === undefined) throw new Error(`Not found: ${from}`);
			storage.set(to, data);
			return { ok: true };
		},
	};
}

describe("BridgeHost file tools", () => {
	test("CLI file_write is readable by Chat file_read from the same OPFS", async () => {
		const files = new FilesController(createMemoryFs());
		const fileOp = (op: FileOp): Promise<FileOpResult> =>
			handleFileOp({ id: "file-op", op }, files);
		const tools = createAgentTools(
			vi.fn(),
			vi.fn(),
			vi.fn(),
			fileOp,
		);
		const host = new BridgeHost({ tools });

		const written = await host.handle({
			id: "req-write",
			method: "file_write",
			params: { path: "/forms/x.json", content: '{"ok":true}' },
		});
		expect(written.ok).toBe(true);
		if (!written.ok || written.method !== "file_write") {
			throw new Error("expected file_write success");
		}

		const chatRead = tools.getHandler("file_read");
		if (!chatRead) throw new Error("file_read handler not found");
		const content = await chatRead({ path: "/forms/x.json" });
		expect(content).toBe('{"ok":true}');
	});
});
