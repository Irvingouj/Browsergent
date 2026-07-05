#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
// scripts/replay-llm.mjs
//
// SSE cassette replay server. Streams recorded Anthropic-format responses
// from a cassette directory, one .sse file per turn, in order.
//
// Matching: strict by default. Each incoming POST /v1/messages is validated
// against the recorded NN-request.json for the current turn. Fields listed in
// manifest.json `volatileFields` are ignored (e.g. timestamps). A mismatch
// returns 400 with a diff so CI fails loudly.
//
// Usage:
//   node scripts/replay-llm.mjs tests/fixtures/llm-cassettes/steer-basic
//   PORT=8787 node scripts/replay-llm.mjs tests/fixtures/llm-cassettes/steer-basic
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const cassetteDir = resolve(process.argv[2] ?? ".");
const LOOSE = process.argv.includes("--loose");
const PORT = Number(process.env.PORT ?? 8787);

const manifest = JSON.parse(
	readFileSync(join(cassetteDir, "manifest.json"), "utf8"),
);
const volatileFields = new Set(manifest.volatileFields ?? []);

// Collect turn files: 01-request.json + 01-response.sse, 02-..., in order.
const turns = readdirSync(cassetteDir)
	.filter((f) => f.endsWith("-request.json"))
	.sort()
	.map((reqFile) => {
		const prefix = reqFile.replace(/-request\.json$/, "");
		const sseFile = `${prefix}-response.sse`;
		return {
			prefix,
			request: JSON.parse(readFileSync(join(cassetteDir, reqFile), "utf8")),
			sse: readFileSync(join(cassetteDir, sseFile), "utf8"),
		};
	});

if (turns.length === 0) {
	console.error(`No turns found in ${cassetteDir}`);
	process.exit(1);
}

let turnIndex = 0;
const accessedTurns = new Set();

function pickVolatile(obj) {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(pickVolatile);
	const out = {};
	for (const [k, v] of Object.entries(obj)) {
		if (volatileFields.has(k)) continue;
		out[k] = pickVolatile(v);
	}
	return out;
}

function diffKeys(expected, actual, path = "") {
	const diffs = [];
	const eKeys = new Set(Object.keys(expected ?? {}));
	const aKeys = new Set(Object.keys(actual ?? {}));
	for (const k of eKeys) {
		if (!aKeys.has(k)) {
			diffs.push(`${path}.${k}: missing in actual`);
			continue;
		}
		const ev = expected[k];
		const av = actual[k];
		if (ev === null || typeof ev !== "object") {
			if (ev !== av)
				diffs.push(
					`${path}.${k}: expected ${JSON.stringify(ev)} got ${JSON.stringify(av)}`,
				);
		} else if (Array.isArray(ev) || Array.isArray(av)) {
			if (JSON.stringify(ev) !== JSON.stringify(av)) {
				diffs.push(`${path}.${k}: array mismatch`);
			}
		} else {
			diffs.push(...diffKeys(ev, av, `${path}.${k}`));
		}
	}
	for (const k of aKeys) {
		if (!eKeys.has(k)) diffs.push(`${path}.${k}: unexpected in actual`);
	}
	return diffs;
}

const server = createServer((req, res) => {
	if (req.method === "GET" && req.url === "/health") {
		res.writeHead(200).end("ok");
		return;
	}
	if (req.method !== "POST" || !req.url.includes("/v1/messages")) {
		res.writeHead(404).end("not found");
		return;
	}
	const chunks = [];
	req.on("data", (c) => chunks.push(c));
	req.on("end", () => {
		const turn = turns[turnIndex];
		if (!turn) {
			res.writeHead(410).end(`cassette exhausted: no turn ${turnIndex + 1}`);
			return;
		}
		accessedTurns.add(turnIndex);
		turnIndex++;
		const actualBody = Buffer.concat(chunks).toString("utf8");
		if (!LOOSE) {
			let actualParsed;
			try {
				actualParsed = JSON.parse(actualBody);
			} catch {
				res.writeHead(400).end("request body is not JSON");
				return;
			}
			const diffs = diffKeys(
				pickVolatile(turn.request),
				pickVolatile(actualParsed),
				"",
			);
			if (diffs.length > 0) {
				res.writeHead(400, { "Content-Type": "text/plain" });
				res.end(
					`turn ${turn.prefix} request mismatch (${diffs.length} diffs):\n${diffs.slice(0, 20).join("\n")}`,
				);
				return;
			}
		}
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		// Stream the recorded SSE bytes verbatim, then end the response.
		res.end(turn.sse);
		console.log(
			`[replay] served turn ${turn.prefix} (${turn.sse.length} bytes)`,
		);
	});
});

server.listen(PORT, () => {
	console.log(
		`[replay] serving cassette ${manifest.name} on :${PORT} (${turns.length} turns, ${LOOSE ? "loose" : "strict"})`,
	);
});

const shutdown = () => {
	const allAccessed = accessedTurns.size === turns.length;
	server.close(() => {
		if (!allAccessed) {
			console.error(
				`[replay] WARNING: only ${accessedTurns.size}/${turns.length} turns accessed`,
			);
			process.exit(1);
		}
		process.exit(0);
	});
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
