import { describe, expect, test } from "vitest";
import { BashShells } from "../../src/bash/shell";
import type { FsClient } from "../../src/skills/skill-types";

interface Node {
	kind: "file" | "directory";
	text: string;
}

function createMemoryFs(): FsClient {
	const nodes = new Map<string, Node>();
	nodes.set("/", { kind: "directory", text: "" });

	function requireNode(path: string): Node {
		const node = nodes.get(path);
		if (!node) throw new Error(`Not found: ${path}`);
		return node;
	}

	return {
		async exists(path: string): Promise<{ exists: boolean }> {
			return { exists: nodes.has(path) };
		},
		async stat(path: string) {
			const node = requireNode(path);
			const name = path === "/" ? "" : path.slice(path.lastIndexOf("/") + 1);
			return {
				path,
				name,
				kind: node.kind,
				size: node.kind === "file" ? node.text.length : 0,
				mime: null,
				created_at: 0,
				modified_at: 0,
			};
		},
		async list(path: string) {
			const node = requireNode(path);
			if (node.kind !== "directory")
				throw new Error(`Not a directory: ${path}`);
			const prefix = path === "/" ? "/" : `${path}/`;
			const entries: { name: string; kind: string }[] = [];
			for (const [key, child] of nodes) {
				if (key === path || !key.startsWith(prefix)) continue;
				const rest = key.slice(prefix.length);
				if (rest.includes("/")) continue;
				entries.push({ name: rest, kind: child.kind });
			}
			return { entries };
		},
		async readText(path: string) {
			const node = requireNode(path);
			if (node.kind !== "file") throw new Error(`Not a file: ${path}`);
			return { data: node.text };
		},
		async readBase64(path: string) {
			const node = requireNode(path);
			if (node.kind !== "file") throw new Error(`Not a file: ${path}`);
			return { data: Buffer.from(node.text, "utf8").toString("base64") };
		},
		async writeText(path: string, data: string) {
			nodes.set(path, { kind: "file", text: data });
			return { path, bytes_written: data.length };
		},
		async writeBase64(path: string, base64: string) {
			const text = Buffer.from(base64, "base64").toString("utf8");
			nodes.set(path, { kind: "file", text });
			return { path, bytes_written: text.length };
		},
		async mkdir(path: string) {
			if (nodes.has(path)) return { ok: false };
			nodes.set(path, { kind: "directory", text: "" });
			return { ok: true };
		},
		async delete(path: string) {
			if (!nodes.has(path)) return { ok: false };
			nodes.delete(path);
			return { ok: true };
		},
		async move(from: string, to: string) {
			if (!nodes.has(from)) return { ok: false };
			const prefix = `${from}/`;
			const snapshot = [...nodes.entries()];
			for (const [key] of snapshot) {
				if (key === from || key.startsWith(prefix)) nodes.delete(key);
			}
			for (const [key, value] of snapshot) {
				if (key === from) nodes.set(to, value);
				else if (key.startsWith(prefix)) {
					nodes.set(to + key.slice(from.length), value);
				}
			}
			return { ok: true };
		},
		async copy(from: string, to: string) {
			const node = nodes.get(from);
			if (!node || node.kind !== "file") return { ok: false };
			nodes.set(to, { kind: "file", text: node.text });
			return { ok: true };
		},
	};
}

describe("bash over the shared filesystem", () => {
	test("reads and writes the same files the panel filesystem stores", async () => {
		const fs = createMemoryFs();
		await fs.writeText("/notes.md", "from panel");
		const shells = new BashShells(fs);

		const read = await shells.exec("session-a", "cat /notes.md");
		expect(read.exitCode).toBe(0);
		expect(read.stdout).toBe("from panel");

		const write = await shells.exec("session-a", "echo from-bash > /out.txt");
		expect(write.exitCode).toBe(0);
		expect((await fs.readText("/out.txt")).data).toBe("from-bash\n");
	});

	test("keeps the current directory per session", async () => {
		const shells = new BashShells(createMemoryFs());
		const moved = await shells.exec("session-a", "mkdir -p /work && cd /work");
		expect(moved.exitCode).toBe(0);

		const here = await shells.exec("session-a", "pwd");
		expect(here.stdout.trim()).toBe("/work");

		const other = await shells.exec("session-b", "pwd");
		expect(other.stdout.trim()).toBe("/");

		const wrote = await shells.exec(
			"session-a",
			"echo hi > a.txt && cat a.txt",
		);
		expect(wrote.exitCode).toBe(0);
		expect(wrote.stdout).toBe("hi\n");
	});

	test("globs and grep see files created in the same command", async () => {
		const shells = new BashShells(createMemoryFs());
		const result = await shells.exec(
			"session-a",
			"mkdir -p /work && cd /work && printf 'alpha\\nbeta\\n' > names.txt && echo x > a.md && echo y > b.md && grep beta names.txt && cat *.md",
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("beta");
		expect(result.stdout).toContain("x");
		expect(result.stdout).toContain("y");
	});

	test("overwrite mv and cp succeed and a directory copy lands once, not dest/name/name", async () => {
		const shells = new BashShells(createMemoryFs());
		const replaced = await shells.exec(
			"session-a",
			"echo old > /b.txt && echo new > /a.txt && mv /a.txt /b.txt && cat /b.txt",
		);
		expect(replaced.exitCode).toBe(0);
		expect(replaced.stdout).toBe("new\n");

		const copied = await shells.exec(
			"session-a",
			"echo from-a > /a.txt && cp /a.txt /b.txt && cat /b.txt",
		);
		expect(copied.exitCode).toBe(0);
		expect(copied.stdout).toBe("from-a\n");

		const nested = await shells.exec(
			"session-a",
			"mkdir -p /src/sub /dst && echo x > /src/sub/f.txt && cp -r /src/sub /dst && cat /dst/sub/f.txt && mv /dst/sub/f.txt /dst && cat /dst/f.txt",
		);
		expect(nested.exitCode).toBe(0);
		expect(nested.stdout).toContain("x");
		expect(nested.stderr).not.toContain("cannot safely determine");
	});

	test("readlink stderr contains symlinks are not available", async () => {
		const shells = new BashShells(createMemoryFs());
		const result = await shells.exec(
			"session-a",
			"echo hi > /a && readlink /a",
		);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"symlinks are not available on this filesystem",
		);
	});

	test("a filesystem failure throws disk failed instead of an exit transcript", async () => {
		const fs = createMemoryFs();
		fs.list = () => Promise.reject(new Error("disk failed"));
		const shells = new BashShells(fs);
		await expect(shells.exec("session-a", "pwd")).rejects.toThrow(
			"disk failed",
		);
	});

	test("a slow directory walk returns exit 124 with timed out", async () => {
		const fs = createMemoryFs();
		fs.list = () => new Promise(() => {});
		const shells = new BashShells(fs, { timeoutMs: 30 });
		const result = await shells.exec("session-a", "pwd");
		expect(result.exitCode).toBe(124);
		expect(result.stderr).toContain("timed out");
	});

	test("reports a missing file without leaving the directory", async () => {
		const shells = new BashShells(createMemoryFs());
		await shells.exec("session-a", "mkdir -p /work && cd /work");
		const missing = await shells.exec("session-a", "cat nope.txt");
		expect(missing.exitCode).not.toBe(0);
		expect(missing.stderr.length).toBeGreaterThan(0);
		const here = await shells.exec("session-a", "pwd");
		expect(here.stdout.trim()).toBe("/work");
	});
});
