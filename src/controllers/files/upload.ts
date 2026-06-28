import type { FsClient } from "../../skills/skill-types";
import type { FileNode } from "../../state/slices/files-slice";
import { buildFileNode } from "./node-builders";
import { fileToBase64, isTextFile, sanitizeFileName } from "./node-builders";

type UploadPlan =
	| { kind: "text"; file: File; path: string; name: string; parentId?: string }
	| {
			kind: "binary";
			file: File;
			path: string;
			name: string;
			parentId?: string;
	  };

/** Resolve a File into an upload plan: validate segments, ensure parent dirs, classify text/binary. */
async function planUpload(fs: FsClient, file: File): Promise<UploadPlan> {
	const segments: string[] = [];
	for (const raw of file.name.split("/")) {
		const seg = sanitizeFileName(raw);
		if (seg.length === 0) continue;
		if (seg === "." || seg === "..") {
			throw new Error(`Invalid file name: ${file.name}`);
		}
		segments.push(seg);
	}
	const name = segments.at(-1);
	if (name === undefined) {
		throw new Error(`Invalid file name: ${file.name}`);
	}

	const dirSegments = segments.slice(0, -1);
	let dirPath = "";
	for (const seg of dirSegments) {
		dirPath = dirPath === "" ? `/${seg}` : `${dirPath}/${seg}`;
		const { exists } = await fs.exists(dirPath);
		if (!exists) {
			await fs.mkdir(dirPath);
		}
	}

	const path = `/${segments.join("/")}`;
	const parentId =
		dirSegments.length > 0 ? `/${dirSegments.join("/")}` : undefined;

	return isTextFile(name)
		? { kind: "text", file, path, name, ...(parentId !== undefined ? { parentId } : {}) }
		: { kind: "binary", file, path, name, ...(parentId !== undefined ? { parentId } : {}) };
}

async function writeTextNode(
	fs: FsClient,
	plan: Extract<UploadPlan, { kind: "text" }>,
): Promise<FileNode> {
	const text = await plan.file.text();
	await fs.writeText(plan.path, text);
	return buildFileNode({
		name: plan.name,
		path: plan.path,
		size: text.length,
		...(plan.parentId !== undefined ? { parentId: plan.parentId } : {}),
		...(plan.file.type ? { mime: plan.file.type } : {}),
	});
}

async function writeBinaryNode(
	fs: FsClient,
	plan: Extract<UploadPlan, { kind: "binary" }>,
): Promise<FileNode> {
	const base64 = await fileToBase64(plan.file);
	await fs.writeBase64(plan.path, base64);
	return buildFileNode({
		name: plan.name,
		path: plan.path,
		size: plan.file.size,
		...(plan.parentId !== undefined ? { parentId: plan.parentId } : {}),
		...(plan.file.type ? { mime: plan.file.type } : {}),
	});
}

/** Upload files serially, returning the created nodes in order. */
export async function uploadFiles(
	fs: FsClient,
	files: File[],
): Promise<FileNode[]> {
	const nodes: FileNode[] = [];
	for (const file of files) {
		const plan = await planUpload(fs, file);
		switch (plan.kind) {
			case "text":
				nodes.push(await writeTextNode(fs, plan));
				break;
			case "binary":
				nodes.push(await writeBinaryNode(fs, plan));
				break;
		}
	}
	return nodes;
}
