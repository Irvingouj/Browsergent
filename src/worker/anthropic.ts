/**
 * Anthropic Messages API adapter for Browsergent.
 * Non-streaming for v1 simplicity.
 */

import type { BrowserCommand, PageSnapshot } from "../types/browser";

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

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// --- Tool definitions for Anthropic ---

const BROWSER_TOOLS: AnthropicTool[] = [
  {
    name: "page_snapshot",
    description: "Take a snapshot of the current page. Returns visible interactive elements with ref_ids.",
    input_schema: {
      type: "object",
      properties: {
        only_visible: { type: "boolean", description: "Only include visible elements", default: true },
      },
    },
  },
  {
    name: "page_click",
    description: "Click an element by its ref_id.",
    input_schema: {
      type: "object",
      properties: { ref_id: { type: "string", description: "The ref_id from page_snapshot" } },
      required: ["ref_id"],
    },
  },
  {
    name: "page_fill",
    description: "Fill an input field with text.",
    input_schema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "The ref_id from page_snapshot" },
        text: { type: "string", description: "Text to fill" },
      },
      required: ["ref_id", "text"],
    },
  },
  {
    name: "page_clear",
    description: "Clear an input field.",
    input_schema: {
      type: "object",
      properties: { ref_id: { type: "string", description: "The ref_id from page_snapshot" } },
      required: ["ref_id"],
    },
  },
  {
    name: "page_select",
    description: "Select an option in a dropdown.",
    input_schema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "The ref_id from page_snapshot" },
        value: { type: "string", description: "Option value to select" },
      },
      required: ["ref_id", "value"],
    },
  },
  {
    name: "page_press",
    description: "Press a key (Enter, Tab, Escape, Backspace, etc).",
    input_schema: {
      type: "object",
      properties: { key: { type: "string", description: "Key to press" } },
      required: ["key"],
    },
  },
  {
    name: "page_scroll",
    description: "Scroll the page.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
        amount: { type: "number", description: "Pixels to scroll" },
      },
      required: ["direction"],
    },
  },
  {
    name: "page_extract",
    description: "Extract text from the page or a specific element.",
    input_schema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "Optional ref_id. If omitted, extracts full page text." },
      },
    },
  },
  {
    name: "page_goto",
    description: "Navigate to a URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL to navigate to" } },
      required: ["url"],
    },
  },
  {
    name: "page_back",
    description: "Go back in browser history.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "page_forward",
    description: "Go forward in browser history.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "page_reload",
    description: "Reload the current page.",
    input_schema: { type: "object", properties: {} },
  },
];

const SYSTEM_PROMPT = `You are Browsergent, a browser automation agent. You can see web pages and interact with them.

Your workflow:
1. Use page_snapshot to see what's on the page.
2. Use page_fill, page_click, page_select, etc. to interact with elements.
3. Each element has a ref_id (like "e0", "e1"). Use these ref_ids to target elements.
4. Report what you did and what happened.

Rules:
- Always snapshot before acting to get fresh ref_ids.
- Never guess ref_ids.
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

export async function callAnthropic(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: AnthropicConfig,
  abortSignal?: AbortSignal,
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
  };

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: abortSignal ?? null,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as AnthropicResponse;

  let text = "";
  const toolCalls: AnthropicCallResult["toolCalls"] = [];

  for (const block of data.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  return {
    text,
    toolCalls,
    stopReason: data.stop_reason === "tool_use" ? "tool_use" : "end_turn",
  };
}

/** Map Anthropic tool name + args to a BrowserCommand. */
export function mapToolToCommand(
  name: string,
  args: Record<string, unknown>,
): BrowserCommand {
  switch (name) {
    case "page_snapshot":
      return { kind: "page.snapshot", options: { onlyVisible: args.only_visible as boolean | undefined } };
    case "page_click":
      return { kind: "page.click", refId: args.ref_id as string };
    case "page_fill":
      return { kind: "page.fill", refId: args.ref_id as string, text: args.text as string };
    case "page_clear":
      return { kind: "page.clear", refId: args.ref_id as string };
    case "page_select":
      return { kind: "page.select", refId: args.ref_id as string, value: args.value as string };
    case "page_press":
      return { kind: "page.press", key: args.key as string };
    case "page_scroll":
      return { kind: "page.scroll", direction: args.direction as "up" | "down", amount: args.amount as number | undefined };
    case "page_extract":
      return { kind: "page.extract", refId: args.ref_id as string | undefined };
    case "page_goto":
      return { kind: "page.goto", url: args.url as string };
    case "page_back":
      return { kind: "page.back" };
    case "page_forward":
      return { kind: "page.forward" };
    case "page_reload":
      return { kind: "page.reload" };
    default:
      return { kind: "page.snapshot" };
  }
}

/** Format a BrowserResult into text for the LLM. */
export function formatToolResult(command: BrowserCommand, result: unknown): string {
  if (typeof result === "object" && result !== null) {
    const snapshot = result as Partial<PageSnapshot>;
    if (snapshot.elements && Array.isArray(snapshot.elements)) {
      return `Page: ${snapshot.url}\nTitle: ${snapshot.title}\n\nElements:\n${snapshot.elements
        .map((e) => `  [${e.refId}] <${e.tag}> role=${e.role} text="${e.text}"${e.label ? ` label="${e.label}"` : ""}${e.placeholder ? ` placeholder="${e.placeholder}"` : ""}${e.value ? ` value="${e.value}"` : ""} enabled=${e.enabled}`)
        .join("\n")}`;
    }
  }
  return JSON.stringify(result);
}
