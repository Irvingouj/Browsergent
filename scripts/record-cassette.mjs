#!/usr/bin/env node
// scripts/record-cassette.mjs
//
// Records a real Anthropic-format SSE cassette against DeepSeek (or any
// Anthropic-compatible endpoint). Produces one NN-request.json + NN-response.sse
// per turn, plus manifest.json. Re-recording overwrites the cassette dir.
//
// The prompt script is a JSON array of "turn scripts":
//   [{ "user": "text" }, { "toolResult": "result text", "toolUseId": "toolu_..." }]
// The recorder sends user turns as real messages; for toolResult turns it
// appends a tool_result message so the model continues after a tool call.
//
// Usage:
//   node scripts/record-cassette.mjs --name=steer-basic --script=scripts/cassette-scripts/steer-basic.json
//   DEEPSEEK_MODEL=deepseek-v4-flash node scripts/record-cassette.mjs --name=steer-basic --script=...
//
// Requires DEEPSEEK_API_KEY in ~/rc.deepseek.rc or env.
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// --- load creds ---
function loadCreds() {
	const rcPath = join(homedir(), "rc.deepseek.rc");
	const env = { ...process.env };
	if (existsSync(rcPath)) {
		for (const line of readFileSync(rcPath, "utf8").split("\n")) {
			const m = line.match(/^\s*export\s+([A-Z_]+)=(.+)$/);
			if (m) {
				env[m[1]] = m[2].replace(/^["']|["']$/g, "");
			}
		}
	}
	if (!env.DEEPSEEK_API_KEY) {
		console.error("DEEPSEEK_API_KEY not set (checked env + ~/rc.deepseek.rc)");
		process.exit(1);
	}
	return {
		apiKey: env.DEEPSEEK_API_KEY,
		baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/anthropic",
		model: env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
	};
}

// --- arg parse ---
const args = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const m = a.match(/^--([^=]+)=(.*)$/);
		return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
	}),
);
const name = args.name;
const scriptPath = args.script;
if (!name || !scriptPath) {
	console.error(
		"usage: record-cassette.mjs --name=<cassette> --script=<path.json>",
	);
	process.exit(1);
}

const creds = loadCreds();
const turnScripts = JSON.parse(readFileSync(resolve(scriptPath), "utf8"));
const outDir = resolve("tests/fixtures/llm-cassettes", name);

// --- reset dir ---
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// --- the system prompt + tools Browsergent's agent uses (minimal, for recording) ---
// We only need the shape the agent loop sends. The real agent builds this; for
// recording we use a faithful subset so the model emits run_js tool calls.
const SYSTEM_PROMPT = [
	"You are Browsergent, a browser automation agent.",
	"You reason step by step and act by emitting JavaScript via the run_js tool.",
	"Your only tool is run_js. Call it to interact with the page.",
].join("\n");

const TOOLS = [
	{
		name: "run_js",
		description:
			"Execute JavaScript in the page context. The code runs in a sandboxed runtime with `page` and `return` available. Use page.goto, page.snapshot, page.click, page.fill, etc.",
		input_schema: {
			type: "object",
			properties: {
				code: { type: "string", description: "The JavaScript code to execute" },
			},
			required: ["code"],
		},
	},
];

// --- conversation accumulator ---
const messages = [];

function pad(n) {
	return String(n).padStart(2, "0");
}

async function callModel(body) {
	const res = await fetch(`${creds.baseUrl}/v1/messages`, {
		method: "POST",
		headers: {
			"x-api-key": creds.apiKey,
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`HTTP ${res.status}: ${text}`);
	}
	return res;
}

function safeWrite(path, content) {
	// Guard: never write the API key to a cassette file. The key only belongs
	// in the outbound x-api-key header; if it appears in request/response
	// bodies we have a leak. Abort loudly so the recording is never committed.
	if (typeof content === "string" && content.includes(creds.apiKey)) {
		console.error(
			`[record] ABORT: API key found in output for ${path} — not writing`,
		);
		process.exit(2);
	}
	writeFileSync(path, content);
}

async function recordTurn(turnIndex, request, expectStream = true) {
	const prefix = pad(turnIndex);
	const reqPath = join(outDir, `${prefix}-request.json`);
	safeWrite(reqPath, JSON.stringify(request, null, 2));
	console.log(`[record] turn ${prefix}: request written`);

	// Stream the response to disk verbatim.
	const res = await callModel(request);
	let sseText = "";
	if (expectStream && request.stream) {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			sseText += decoder.decode(value, { stream: true });
		}
	} else {
		sseText = await res.text();
	}
	const ssePath = join(outDir, `${prefix}-response.sse`);
	safeWrite(ssePath, sseText);
	console.log(
		`[record] turn ${prefix}: response written (${sseText.length} bytes)`,
	);
	return sseText;
}

// parse the assistant content blocks out of a non-stream or stream replay
function parseAssistantContent(sseText) {
	// crude: collect content_block_start ... content_block_stop groups
	const blocks = [];
	let current = null;
	let currentText = "";
	let currentJson = "";
	for (const line of sseText.split("\n")) {
		if (!line.startsWith("data:")) continue;
		const data = line.slice(5).trim();
		if (!data || data === "[DONE]") continue;
		let evt;
		try {
			evt = JSON.parse(data);
		} catch {
			continue;
		}
		if (evt.type === "content_block_start" && evt.content_block) {
			current = { ...evt.content_block };
			currentText = "";
			currentJson = "";
		} else if (evt.type === "content_block_delta" && evt.delta) {
			if (evt.delta.type === "text_delta") currentText += evt.delta.text;
			else if (evt.delta.type === "input_json_delta")
				currentJson += evt.delta.partial_json;
		} else if (evt.type === "content_block_stop") {
			if (current?.type === "text") current.text = currentText;
			if (current?.type === "tool_use") {
				try {
					current.input = JSON.parse(currentJson || "{}");
				} catch {
					current.input = { _raw: currentJson };
				}
			}
			blocks.push(current);
			current = null;
		}
	}
	return blocks;
}

async function main() {
	console.log(
		`[record] model=${creds.model} cassette=${name} turns=${turnScripts.length}`,
	);

	for (let i = 0; i < turnScripts.length; i++) {
		const ts = turnScripts[i];
		if (ts.user) {
			messages.push({ role: "user", content: ts.user });
		} else if (ts.toolResult) {
			// Find the tool_use block from the most recent assistant message
			// and use its real id — the model generated it, we must echo it.
			let toolUseId = ts.toolUseId;
			for (let j = messages.length - 1; j >= 0; j--) {
				if (messages[j].role !== "assistant") continue;
				const block = messages[j].content.find((b) => b.type === "tool_use");
				if (block) {
					toolUseId = block.id;
					break;
				}
			}
			messages.push({
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: toolUseId,
						content: ts.toolResult,
					},
				],
			});
		}

		const request = {
			model: creds.model,
			max_tokens: ts.maxTokens ?? 1024,
			system: SYSTEM_PROMPT,
			messages: JSON.parse(JSON.stringify(messages)),
			tools: TOOLS,
			stream: true,
		};

		const sseText = await recordTurn(i + 1, request);
		const blocks = parseAssistantContent(sseText);
		messages.push({ role: "assistant", content: blocks });
	}

	const manifest = {
		name,
		model: creds.model,
		recordedAt: new Date().toISOString(),
		endpoint: creds.baseUrl,
		turns: turnScripts.length,
		volatileFields: [],
		description: args.description ?? `Cassette ${name}`,
	};
	writeFileSync(
		join(outDir, "manifest.json"),
		JSON.stringify(manifest, null, 2),
	);
	console.log(`[record] done: ${outDir}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
