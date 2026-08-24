import { homedir } from "node:os";
import { join } from "node:path";
import { BridgeCli } from "./bridge-cli.ts";
import { postBridgeRequest } from "./bridge-http.ts";

const DEFAULT_URL =
	process.env.BROWSERGENT_BRIDGE_URL ?? "http://127.0.0.1:8787/bridge";

const cli = new BridgeCli({
	configDir: join(homedir(), ".browsergent"),
	send: (request) => postBridgeRequest(DEFAULT_URL, request),
});

const [command, ...args] = process.argv.slice(2);

try {
	if (command === "enroll") {
		const token = args[0];
		if (!token) {
			console.error("usage: browsergent enroll <token>");
			process.exit(1);
		}
		await cli.enroll(token);
		console.log("enrolled");
	} else if (command === "status") {
		const status = await cli.status();
		console.log(
			status.connected
				? status.enrolled
					? "connected · enrolled"
					: "connected · not enrolled"
				: "disconnected",
		);
	} else if (command === "run") {
		const fileFlag = args[0] === "--file" || args[0] === "-f";
		if (fileFlag) {
			const pathArg = args[1];
			if (!pathArg) {
				console.error("usage: browsergent run --file <path>");
				process.exit(1);
			}
			console.log(await cli.runFile(pathArg));
		} else if (args.length === 0 || args[0] === "-") {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(chunk as Buffer);
			}
			const code = Buffer.concat(chunks).toString("utf8").trim();
			if (!code) {
				console.error("usage: browsergent run <js> | run --file <path> | run -");
				process.exit(1);
			}
			console.log(await cli.run(code));
		} else {
			const code = args.join(" ").trim();
			console.log(await cli.run(code));
		}
	} else if (command === "help" || command === "--help" || command === "-h") {
		console.log(`browsergent bridge — local CLI for the Browsergent sidepanel

Start the host first:
  npm run host

Then:
  npm run bridge -- enroll <token>
  npm run bridge -- status
  npm run bridge -- docs              # API index (page, chrome, fs, ...)
  npm run bridge -- docs page         # page.click / snapshot / fill / ...
  npm run bridge -- run 'await page.snapshot()'
  npm run bridge -- run --file cell.js     # prefer this over quoting a novel
  npm run bridge -- run - < cell.js         # stdin
  npm run bridge -- write /notes.md hello
  npm run bridge -- reset | stop

Prefer run --file for multi-line cells. Snapshot before click/fill. Prefer web.tab.*(tabId)
over page.* after new_tab. Call docs (get_doc) before guessing APIs.
`);
	} else if (command === "docs") {
		console.log(await cli.docs(args[0]));
	} else if (command === "reset") {
		console.log(await cli.reset());
	} else if (command === "stop") {
		console.log(await cli.stop());
	} else if (command === "write") {
		const pathArg = args[0];
		const content = args.slice(1).join(" ");
		if (!pathArg || !content) {
			console.error("usage: browsergent write <path> <content>");
			process.exit(1);
		}
		console.log(await cli.writeFile(pathArg, content));
	} else {
		console.error(
			"usage: browsergent enroll <token> | status | run <js> | docs [namespace] | help | reset | stop | write <path> <content>",
		);
		process.exit(1);
	}
} catch (err) {
	const message = err instanceof Error ? err.message : String(err);
	console.error(message);
	process.exit(1);
}
