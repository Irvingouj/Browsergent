import {
	parseBridgeResponse,
	type BridgeResponse,
	type BridgeWireRequest,
} from "../src/protocol/bridge.ts";

export async function postBridgeRequest(
	url: string,
	request: BridgeWireRequest,
): Promise<BridgeResponse> {
	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		});
	} catch {
		throw new Error(
			"browsergent host is not running — start it with `npm run host`",
		);
	}
	let raw: unknown;
	try {
		// Untrusted JSON from the local daemon HTTP body.
		raw = await response.json();
	} catch {
		throw new Error("browsergent host returned a non-JSON response");
	}
	return parseBridgeResponse(raw, request.id);
}
