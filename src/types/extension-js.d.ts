/**
 * Type declarations for @pi-oxide/extension-js 0.4.0.
 * The upstream package.json points to index.d.ts which does not declare
 * the exported ExtensionSession, CellResult, or setLogLevel. This file
 * bridges the gap so TypeScript sees the runtime exports correctly.
 */

declare module "@pi-oxide/extension-js" {
	export type WasmCellError =
		| {
				kind: "compile";
				name: string | null;
				message: string;
				line: number | null;
		  }
		| {
				kind: "runtime";
				name: string | null;
				message: string;
				line: number | null;
				action: string | null;
				code: string | null;
		  }
		| { kind: "fuel_exhausted" }
		| { kind: "internal"; message: string };

	export type CellResult =
		| {
				status: "ok";
				stdout: string[];
				stderr: string[];
				result: string | null;
				execution_count: number;
		  }
		| {
				status: "err";
				stdout: string[];
				stderr: string[];
				error: WasmCellError;
				execution_count: number;
		  };

	export class ExtensionSession {
		static init(): Promise<[ExtensionSession, Promise<void>]>;
		apiDocs(format: string): Promise<unknown>;
		runCellAsync(code: string, stdin?: string): Promise<CellResult>;
		setFuelLimit(limit: number): void;
		stopWith(runnerPromise?: Promise<void>): Promise<void>;
		reset(): void;
		free(): void;
	}

	export function setLogLevel(level: string): void;
}
