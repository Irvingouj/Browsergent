import type { FilesController } from "../../../controllers/files";
import { reportWarn } from "../../../errors/report";
import { ROOT_DIR_PATH } from "../../../state/slices/files-slice";
import { browsergentStore } from "../../../state/store";

const REFRESH_DEBOUNCE_MS = 120;

let boundController: FilesController | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let pendingAfterInFlight = false;

/**
 * Bind the live FilesController so mutation hooks (run_js / panel FS writes)
 * can refresh the tree without importing the controller from every call site.
 */
export function bindFileTreeController(ctrl: FilesController | null): void {
	boundController = ctrl;
}

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

/**
 * Debounced best-effort tree refresh for FS mutations.
 * Bumps filesVersion immediately (mention picker / input mode) and re-lists
 * the shallow tree after a short quiet period so bursty agent moves coalesce.
 */
export function scheduleFileTreeRefresh(): void {
	browsergentStore.getState().incrementFilesVersion();
	if (!boundController) return;

	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		void runScheduledRefresh();
	}, REFRESH_DEBOUNCE_MS);
}

async function runScheduledRefresh(): Promise<void> {
	const ctrl = boundController;
	if (!ctrl) return;

	if (inFlight) {
		pendingAfterInFlight = true;
		return;
	}

	inFlight = refreshShallowFileTree(ctrl)
		.catch((err: unknown) => {
			reportWarn({
				code: "E_HOST_UNKNOWN",
				source: "panel",
				message: "Files tree refresh failed",
				cause: err,
			});
		})
		.finally(() => {
			inFlight = null;
			if (pendingAfterInFlight) {
				pendingAfterInFlight = false;
				void runScheduledRefresh();
			}
		});
	await inFlight;
}

/** Test helper: flush pending debounced refresh timers. */
export function _resetFileTreeRefreshForTests(): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = null;
	inFlight = null;
	pendingAfterInFlight = false;
	boundController = null;
}
