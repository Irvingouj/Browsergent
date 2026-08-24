import type {
	BridgeRequest,
	BridgeResponse,
	BridgeWireRequest,
} from "../src/protocol/bridge.ts";

export type BridgeForwarder = (
	request: BridgeWireRequest,
) => Promise<BridgeResponse>;

type CliRequest = BridgeRequest & { token: string; sessionId?: string };

export class BridgeDaemon {
	private forwarder: BridgeForwarder | null = null;

	attach(forwarder: BridgeForwarder): void {
		this.forwarder = forwarder;
	}

	detach(): void {
		this.forwarder = null;
	}

	async handleCli(request: CliRequest): Promise<BridgeResponse> {
		if (!this.forwarder) {
			if (request.method === "status") {
				return {
					id: request.id,
					ok: true,
					method: "status",
					result: { connected: false, enrolled: false },
				};
			}
			return {
				id: request.id,
				ok: false,
				error: {
					code: "E_EXTENSION_DISCONNECTED",
					message: "Browsergent extension is not connected",
				},
			};
		}
		return this.forwarder(request);
	}
}
