import type { AgentTools } from "@pi-oxide/pi-host-web";
import type { CellResult } from "../../types/extjs-utils";
import type { FileOp, FileOpResult } from "../file-op-relay";
import { createFileTools } from "./file-tools";
import { createGetDocTool } from "./get-doc-tool";
import { createLoadSkillTool } from "./load-skill-tool";
import { createRunJsTool } from "./run-js-tool";

export function createAgentTools(
	runJs: (code: string) => Promise<CellResult>,
	getDocs: (format: "json" | "markdown") => Promise<string>,
	loadSkill: (skill: string, path?: string) => Promise<string>,
	fileOp: (op: FileOp) => Promise<FileOpResult>,
): AgentTools {
	const definitions = [
		createRunJsTool(runJs, fileOp),
		createGetDocTool(getDocs),
		createLoadSkillTool(loadSkill),
		...createFileTools(fileOp),
	];

	return {
		definitions,
		getHandler(name: string) {
			const def = definitions.find((d) => d.name === name);
			return def?.run ?? null;
		},
	};
}