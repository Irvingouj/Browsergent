import type { PanelToWorker } from "../types/messages";

/** Panel-side proxy: posts agent commands to the offscreen worker host. */
export class OffscreenProxyBridge {
	constructor(
		private readonly sessionId: string,
		private readonly getWindowId: () => number | null,
	) {}

	start(): void {
		// Offscreen host creates workers on first command.
	}

	stop(): void {
		// Runs survive panel teardown; explicit agentStop handles termination.
	}

	restart(): void {
		// No local worker to restart.
	}

	post(message: PanelToWorker): void {
		const windowId = this.getWindowId();
		if (windowId === null || typeof chrome === "undefined") return;
		chrome.runtime
			?.sendMessage?.({
				type: "offscreenRunCommand",
				sessionId: this.sessionId,
				windowId,
				message,
			})
			?.catch?.(() => {});
	}
}
