import type { FileNode } from "../state/slices/files-slice";
import type { FilesController } from "../controllers/files-controller";
import { browsergentStore } from "../state/store";

export async function hydrateAndSyncFiles(
	sessionId: string,
	filesIndex: FileNode[] | undefined,
	filesController: FilesController | null,
): Promise<void> {
	browsergentStore.getState().hydrateFiles(filesIndex ?? [], sessionId);
	try {
		await filesController?.syncIndexFromSnapshot(sessionId, filesIndex ?? []);
	} catch (err: unknown) {
		console.warn("Files index sync failed:", err);
	}
}
