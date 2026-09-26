import { Bash, defineCommand } from "just-bash";
import type { FsClient } from "../skills/skill-types";
import { normalizeVirtualPath, OpfsFileSystem } from "./opfs-file-system";
import { type BashCommandResult, BashTimeoutError } from "./types";

/** Wall clock for one command. The worker relay waits longer than this. */
export const BASH_TIMEOUT_MS = 30_000;

/**
 * One simulated bash, shared filesystem, current directory per session key.
 *
 * just-bash restores its own cwd when exec() returns. The result environment
 * still carries the script's final PWD, and that is the next command's start.
 */
export class BashShells {
	private readonly filesystem: OpfsFileSystem;
	private readonly bash: Bash;
	private readonly cwdByKey = new Map<string, string>();
	private readonly timeoutMs: number;
	private chain: Promise<void> = Promise.resolve();

	constructor(fs: FsClient, options?: { timeoutMs?: number }) {
		this.timeoutMs = options?.timeoutMs ?? BASH_TIMEOUT_MS;
		this.filesystem = new OpfsFileSystem(fs);
		const readlink = defineCommand("readlink", async () => ({
			stdout: "",
			stderr: "readlink: symlinks are not available on this filesystem\n",
			exitCode: 1,
		}));
		this.bash = new Bash({
			fs: this.filesystem,
			cwd: "/",
			customCommands: [readlink],
			executionLimits: { maxExecutionTimeMs: this.timeoutMs },
		});
	}

	exec(sessionKey: string, command: string): Promise<BashCommandResult> {
		return this.serialize(() => this.execOne(sessionKey, command));
	}

	private serialize<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.chain;
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.chain = previous.then(() => gate);
		return previous
			.then(() => operation())
			.finally(() => {
				release();
			});
	}

	private async execOne(
		sessionKey: string,
		command: string,
	): Promise<BashCommandResult> {
		const cwd = this.cwdByKey.get(sessionKey) ?? "/";
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			await this.filesystem.warm(controller.signal);
			const result = await this.bash.exec(command, {
				cwd,
				signal: controller.signal,
			});
			const nextCwd = result.env.PWD;
			if (typeof nextCwd === "string" && nextCwd.startsWith("/")) {
				this.cwdByKey.set(sessionKey, normalizeVirtualPath(nextCwd));
			}
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			};
		} catch (err: unknown) {
			// Only the deadline is a command transcript. Other failures stay thrown.
			if (!isShellTimeout(err, controller.signal)) throw err;
			return {
				stdout: "",
				stderr: "bash: timed out\n",
				exitCode: 124,
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

function isShellTimeout(
	// Throw from warm() or just-bash. Timeout stays a transcript; the rest rethrows.
	err: unknown,
	signal: AbortSignal,
): boolean {
	if (signal.aborted || err instanceof BashTimeoutError) return true;
	// just-bash reports its own execution limit as a thrown Error, not our type.
	return (
		err instanceof Error && /timed out|maxExecutionTime/i.test(err.message)
	);
}
