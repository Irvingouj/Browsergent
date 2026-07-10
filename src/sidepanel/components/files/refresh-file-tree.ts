import type { FilesController } from "../../../controllers/files";
import { ROOT_DIR_PATH } from "../../../state/slices/files-slice";
import { browsergentStore } from "../../../state/store";

/**
 * Shallow-refresh the OPFS tree: root children, then currently expanded
 * directories (shortest path first so parents load before nested dirs).
 * Never walks the full tree recursively.
 */
export async function refreshShallowFileTree(
	ctrl: FilesController,
): Promise<void> {
	const rootChildren = await ctrl.listDirectChildren(ROOT_DIR_PATH);
	browsergentStore.getState().setDirectoryChildren(null, rootChildren);

	const expanded = [
		...browsergentStore.getState().files.expandedFolderIds,
	].sort((a, b) => a.split("/").length - b.split("/").length);

	for (const dirId of expanded) {
		if (dirId === ROOT_DIR_PATH) continue;
		const node = browsergentStore.getState().files.nodes[dirId];
		if (!node || node.kind !== "directory") continue;
		const children = await ctrl.listDirectChildren(dirId);
		browsergentStore.getState().setDirectoryChildren(dirId, children);
	}
}
