import { reportWarn } from "../errors/report";
import type { PanelToWorker } from "../types/messages";
import { type BashCommandResult, BashErrorCode, BashRelayError } from "./types";

type BashReply = Extract<PanelToWorker, { type: "bashResult" | "bashError" }>;

/** Run a shell command and deliver the transcript or a coded failure. */
export function deliverBashResult(
	run: Promise<BashCommandResult>,
	id: string,
	deliver: (message: BashReply) => void,
): void {
	run
		.then((result) => {
			deliver({ type: "bashResult", id, result });
		})
		.catch((err: unknown) => {
			// Dynamic import or shell execution failed before a transcript existed.
			const message = err instanceof Error ? err.message : String(err);
			const code =
				err instanceof BashRelayError ? err.code : BashErrorCode.Failed;
			reportWarn({
				code: "E_HOST_UNKNOWN",
				source: "panel",
				message: `bash failed: ${message}`,
				details: { requestId: id },
				cause: err,
			});
			deliver({ type: "bashError", id, code, error: message });
		});
}
