/**
 * Anthropic Messages API adapter for Browsergent.
 * Streaming via SSE; text deltas are emitted as they arrive.
 *
 * The LLM has ONE tool: run_lua. It generates Lua code to control the browser.
 * All page.* operations go through Lua — the LLM never calls browser tools directly.
 */

// --- Anthropic API types ---

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean };

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// --- Streaming SSE types ---

type AnthropicStreamEvent =
  | { type: "message_start"; message: unknown }
  | {
      type: "content_block_start";
      index: number;
      content_block:
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "input_json_delta"; partial_json: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string | null; stop_sequence: string | null } }
  | { type: "message_stop" };

function isAnthropicStreamEvent(value: unknown): value is AnthropicStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "message_start" ||
    type === "content_block_start" ||
    type === "content_block_delta" ||
    type === "content_block_stop" ||
    type === "message_delta" ||
    type === "message_stop"
  );
}

// --- Tool definition for Anthropic (single tool: run_lua) ---

const BROWSER_TOOLS: AnthropicTool[] = [
  {
    name: "run_lua",
    description:
      "Execute Lua code to control the browser. Available API:\n" +
      "- page.snapshot() → returns page elements with ref_ids\n" +
      "- page.click(ref_id) → click element\n" +
      "- page.fill(ref_id, text) → fill input\n" +
      "- page.clear(ref_id) → clear input\n" +
      "- page.select(ref_id, value) → select option\n" +
      "- page.press(key) → press key\n" +
      "- page.scroll(direction, amount?) → scroll\n" +
      "- page.extract(ref_id?) → extract text\n" +
      "- page.goto(url) → navigate\n" +
      "- page.back() / page.forward() / page.reload()",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Lua code to execute" },
      },
      required: ["code"],
    },
  },
];

const SYSTEM_PROMPT = `You are Browsergent, a browser automation agent. You control the browser by generating Lua code.

Your workflow:
1. Use run_lua to execute Lua code that calls page.snapshot() to see what's on the page.
2. Use run_lua to execute Lua code that interacts with elements (page.fill, page.click, etc.).
3. Each element has a ref_id (like "e0", "e1"). Use these ref_ids to target elements.
4. Report what you did and what happened.

Rules:
- Always snapshot before acting to get fresh ref_ids.
- Never guess ref_ids.
- Generate valid Lua code in the "code" field of run_lua.
- You can combine multiple page.* calls in a single run_lua invocation.
- Report errors clearly.
- Complete the task the user asked for.`;

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AnthropicCallResult {
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  stopReason: "end_turn" | "tool_use";
}

// --- SSE parser ---

async function parseAnthropicStream(
  response: Response,
  onTextDelta: (text: string) => void,
  abortSignal?: AbortSignal,
): Promise<AnthropicCallResult> {
  if (!response.body) {
    throw new Error("Response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const toolBlocks: Array<{ id: string; name: string; partialJson: string }> = [];
  let stopReason: AnthropicCallResult["stopReason"] = "end_turn";

  try {
    while (true) {
      if (abortSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        if (!event.trim()) continue;

        let eventType = "";
        let data = "";

        for (const line of event.split("\n")) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data = line.slice(5).trim();
          }
        }

        if (!eventType || !data) continue;
        if (data === "[DONE]") continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        if (!isAnthropicStreamEvent(parsed)) continue;

        switch (parsed.type) {
          case "message_start":
          case "message_stop":
          case "content_block_stop":
            break;
          case "content_block_start": {
            if (parsed.content_block.type === "tool_use") {
              toolBlocks[parsed.index] = {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                partialJson: "",
              };
            }
            break;
          }
          case "content_block_delta": {
            if (parsed.delta.type === "text_delta") {
              text += parsed.delta.text;
              onTextDelta(parsed.delta.text);
            } else if (parsed.delta.type === "input_json_delta") {
              const block = toolBlocks[parsed.index];
              if (block) {
                block.partialJson += parsed.delta.partial_json;
              }
            }
            break;
          }
          case "message_delta": {
            if (parsed.delta.stop_reason === "tool_use") {
              stopReason = "tool_use";
            }
            break;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const toolCalls = toolBlocks.map((b) => {
    let args: Record<string, unknown> = {};
    if (b.partialJson) {
      const parsed: unknown = JSON.parse(b.partialJson);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    }
    return { id: b.id, name: b.name, arguments: args };
  });

  return { text, toolCalls, stopReason };
}

// --- Public API ---

export async function callAnthropic(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: AnthropicConfig,
  abortSignal: AbortSignal | undefined,
  onTextDelta: (text: string) => void,
): Promise<AnthropicCallResult> {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com";
  const anthropicMessages: AnthropicMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    model: config.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: anthropicMessages,
    tools: BROWSER_TOOLS,
    stream: true,
  };

  const isFireworks = baseUrl.includes("fireworks.ai");
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(isFireworks
        ? { Authorization: `Bearer ${config.apiKey}` }
        : { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }),
    },
    body: JSON.stringify(body),
    signal: abortSignal ?? null,
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errorText}`);
  }

  return parseAnthropicStream(resp, onTextDelta, abortSignal);
}
