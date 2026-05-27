/**
 * High-level JS SDK for @pi-oxide/pi-host-web.
 *
 * Re-exports all raw types so consumers never need to import from ./raw.
 */

export * from "../pi_host_web.js";

export declare function ensureInit(): Promise<void>;

export declare function continueTurn(handle: number): StepResult;

export declare function toolResult(
  text: string,
  opts?: { terminate?: boolean }
): { content: Array<{ type: "text"; text: string }>; terminate?: boolean };

export declare function toolError(
  code: string,
  message: string
): { error: { code: string; message: string } };

export interface LlmStream {
  chunks: AsyncIterable<LlmChunk>;
  result: Promise<LlmResult>;
}

export interface LlmProvider {
  call(context: LlmContext, signal?: AbortSignal): Promise<LlmStream> | LlmStream;
}

export type ToolMap = Record<
  string,
  (call: ToolCall) => Promise<ToolResult> | ToolResult
>;

export interface AgentRunConfig {
  llm: LlmProvider;
  tools: ToolMap;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export declare class Agent {
  static create(options: AgentOptions): Promise<Agent>;
  run(promptText: string, config: AgentRunConfig): Promise<AgentAction>;
  stop(): void;
  reset(): void;
  state(): AgentState;
  getSessionState(): SessionState;
  setSessionState(sessionState: SessionState): void;
  steer(message: AgentMessage): AgentEvent[];
  followUp(message: AgentMessage): void;
  destroy(): void;
}
