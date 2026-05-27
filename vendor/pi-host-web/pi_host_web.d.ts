/* tslint:disable */
/* eslint-disable */
export interface AgentContext {
    system_prompt: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
}

export interface AgentOptions {
    system_prompt: string;
    model: Model;
    thinking_level?: ThinkingLevel;
    tools?: ToolDefinition[];
    steering_mode?: QueueMode;
    follow_up_mode?: QueueMode;
    tool_execution_mode?: ToolExecutionMode;
    session_id?: SessionId;
    messages?: AgentMessage[];
    session_state?: SessionState | null;
}

export interface AgentState {
    system_prompt: string;
    model: Model;
    thinking_level: ThinkingLevel;
    tools: ToolDefinition[];
    messages: AgentMessage[];
    is_streaming: boolean;
    streaming_message?: AgentMessage;
    pending_tool_calls: string[];
    error_message?: string;
}

export interface ApiUsageSnapshot {
    estimated_tokens: number;
    actual_input_tokens: number;
}

export interface AssistantMessage {
    content: Content[];
    api: ApiName;
    provider: ProviderName;
    model: ModelId;
    stop_reason: StopReason;
    error_message?: string;
    timestamp: number;
    usage: TokenUsage;
}

export interface BranchSummary {
    summary: string;
    details?: JsonSchema;
}

export interface ContextProjectionBudget {
    max_tool_result_chars: number;
    max_context_tokens: number;
    default_preview_chars: number;
    microcompact_after_turns?: number;
    compaction_threshold?: number;
}

export interface ContextProjectionReport {
    estimated_tokens: number;
    replacements: ContextReplacement[];
    dropped_messages: number;
    needs_compaction?: boolean;
    cache_breakpoints?: number[];
}

export interface ContextProjectionState {
    replacements: Record<string, ContextReplacement>;
    last_api_usage?: ApiUsageSnapshot | null;
    turns_since_compaction?: number;
}

export interface ContextReplacement {
    tool_call_id: string;
    tool_name: string;
    artifact_id: string;
    original_chars: number;
    preview_chars: number;
    strategy: ContextStrategy;
}

export interface CreateAgentOutput {
    handle: number;
}

export interface CreateAgentResult {
    ok: boolean;
    data?: CreateAgentOutput;
    error?: ErrorDto;
}

export interface EmptyResult {
    ok: boolean;
    data?: null;
    error?: ErrorDto;
}

export interface ErrorDto {
    code: string;
    message: string;
}

export interface EstimateTokensInput {
    messages: AgentMessage[];
}

export interface EstimateTokensOutput {
    tokens: number;
}

export interface EstimateTokensResult {
    ok: boolean;
    data?: EstimateTokensOutput;
    error?: ErrorDto;
}

export interface EventsOutput {
    events: AgentEvent[];
}

export interface EventsResult {
    ok: boolean;
    data?: EventsOutput;
    error?: ErrorDto;
}

export interface ImageContent {
    media_type: string;
    data: string;
}

export interface LlmContext {
    system_prompt: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
}

export interface LlmError {
    code: string;
    message: string;
    details?: Value;
}

export interface Model {
    id: ModelId;
    name: ModelName;
    api: ApiName;
    provider: ProviderName;
    base_url?: string;
    reasoning: boolean;
    context_window: number;
    max_tokens: number;
    capabilities?: ModelCapabilities;
    cost?: ModelCost;
}

export interface ModelCapabilities {
    vision: boolean;
    json_mode: boolean;
    function_calling: boolean;
    streaming: boolean;
}

export interface ModelCost {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
}

export interface MoveToOutput {
    summary_entry_id: string | null;
}

export interface MoveToResult {
    ok: boolean;
    data?: MoveToOutput;
    error?: ErrorDto;
}

export interface ProjectionInput {
    system_prompt: string;
    messages: AgentMessage[];
    budget: ContextProjectionBudget;
    state: ContextProjectionState;
}

export interface ProjectionOutput {
    projected_messages: AgentMessage[];
    updated_state: ContextProjectionState;
    report: ContextProjectionReport;
}

export interface ProjectionResult {
    ok: boolean;
    data?: ProjectionOutput;
    error?: ErrorDto;
}

export interface SessionBranchOutput {
    entries: SessionEntry[];
}

export interface SessionBranchResult {
    ok: boolean;
    data?: SessionBranchOutput;
    error?: ErrorDto;
}

export interface SessionEntry {
    id: string;
    parent_id?: string;
    kind: EntryKind;
    timestamp: number;
}

export interface SessionState {
    entries: SessionEntry[];
    leaf_id: string;
    name?: string;
}

export interface SessionStateOutput {
    state: SessionState;
}

export interface SessionStateResult {
    ok: boolean;
    data?: SessionStateOutput;
    error?: ErrorDto;
}

export interface StateOutput {
    state: AgentState;
}

export interface StateResult {
    ok: boolean;
    data?: StateOutput;
    error?: ErrorDto;
}

export interface StepOutput {
    events: AgentEvent[];
    actions: AgentAction[];
}

export interface StepResult {
    ok: boolean;
    data?: StepOutput;
    error?: ErrorDto;
}

export interface TextContent {
    text: string;
}

export interface TokenUsage {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    total_tokens: number;
}

export interface ToolCall {
    id: ToolCallId;
    name: ToolName;
    arguments: ToolArguments;
}

export interface ToolDefinition {
    name: ToolName;
    label: string;
    description: string;
    parameters: JsonSchema;
    execution_mode?: ExecutionMode;
}

export interface ToolError {
    code: string;
    message: string;
    details?: ToolDetails;
}

export interface ToolExecutionUpdate {
    tool_call_id: ToolCallId;
    stream: ToolOutputStream;
    chunk: string;
    sequence: number;
    timestamp: number;
}

export interface ToolResult {
    content: Content[];
    details?: ToolDetails;
    terminate?: boolean;
}

export interface ToolResultContext {
    content_kind: ContentKind;
    strategy: ContextStrategy;
    original_chars: number;
    truncated_by_tool: boolean;
    path?: string;
    exit_code?: number;
}

export interface ToolResultMessage {
    tool_call_id: ToolCallId;
    tool_name: ToolName;
    content: Content[];
    details?: ToolDetails;
    is_error: boolean;
    timestamp: number;
}

export interface UserMessage {
    content: Content[];
    timestamp: number;
}

export type AgentAction = { type: "stream_llm"; context: LlmContext; session_id?: SessionId } | { type: "execute_tools"; calls: ToolCall[] } | { type: "cancel_tools"; tool_call_ids: ToolCallId[]; reason: CancelReason } | { type: "wait_for_input"; mode: WaitMode } | { type: "finished"; messages: AgentMessage[] };

export type AgentEvent = { type: "agent_start" } | { type: "agent_end"; messages: AgentMessage[] } | { type: "turn_start" } | { type: "turn_end"; message: AgentMessage; tool_results: ToolResultMessage[] } | { type: "message_start"; message: AgentMessage } | { type: "message_update"; message: AgentMessage; delta: ContentDelta } | { type: "message_end"; message: AgentMessage } | { type: "tool_execution_start"; tool_call_id: ToolCallId; tool_name: ToolName; args?: ToolArguments } | { type: "tool_execution_update"; tool_call_id: ToolCallId; stream: ToolOutputStream; chunk: string; sequence: number; timestamp: number } | { type: "tool_execution_end"; tool_call_id: ToolCallId; result: ToolResult; is_error: boolean } | { type: "tool_execution_cancelled"; tool_call_id: ToolCallId; reason: CancelReason } | { type: "queue_update"; steer: AgentMessage[]; follow_up: AgentMessage[] } | { type: "save_point"; had_pending_writes: boolean } | { type: "settled" };

export type AgentMessage = ({ role: "user" } & UserMessage) | ({ role: "assistant" } & AssistantMessage) | ({ role: "tool_result" } & ToolResultMessage);

export type ApiName = string;

export type CancelReason = { type: "user_requested" } | { type: "timeout" } | { type: "agent_aborted" } | { type: "dependency_failed"; cause_tool_call_id: ToolCallId };

export type Content = ({ type: "text" } & TextContent) | ({ type: "image" } & ImageContent) | ({ type: "tool_call" } & ToolCall);

export type ContentDelta = { kind: "text_start" } | { kind: "text_delta"; text: string } | { kind: "text_end" } | { kind: "thinking_start" } | { kind: "thinking_delta"; text: string } | { kind: "thinking_end" } | { kind: "tool_call_start"; tool_call: ToolCall } | { kind: "tool_call_delta"; tool_call_id: ToolCallId; delta: Value } | { kind: "tool_call_end"; tool_call_id: ToolCallId };

export type ContentKind = "file_read" | "command_output" | "diff" | "search_results" | "directory_listing" | "generic_text";

export type ContextStrategy = { type: "keep_full" } | { type: "head"; max_chars: number } | { type: "tail"; max_chars: number } | { type: "head_tail"; head_chars: number; tail_chars: number } | { type: "drop_if_old" } | { type: "microcompacted" };

export type EntryKind = ({ type: "message" } & {} & AgentMessage) | { type: "compaction"; summary: string; first_kept_entry_id: string; tokens_before: number; details?: JsonSchema } | { type: "branch_summary"; summary: string; details?: JsonSchema } | { type: "model_change"; provider: string; model_id: string } | ({ type: "thinking_level_change" } & ThinkingLevel) | { type: "custom"; custom_type: string; data?: JsonSchema };

export type ExecutionMode = "parallel" | "sequential";

export type JsonSchema = Value;

export type LlmChunk = ({ kind: "start" } & {} & AssistantMessage) | { kind: "text_delta"; text: string } | { kind: "thinking_delta"; text: string } | { kind: "tool_call_delta"; tool_call_id: ToolCallId; delta: Value } | { kind: "done" } | { kind: "error"; message: string };

export type LlmResult = { Ok: AssistantMessage } | { Err: { error: LlmError; aborted: boolean } };

export type ModelId = string;

export type ModelName = string;

export type ModelProvider = "open_ai" | "anthropic" | "google" | "ollama" | "custom";

export type Phase = "idle" | "streaming" | "wait_for_input";

export type PromptRequest = AgentMessage | { text: string };

export type ProviderName = string;

export type QueueMode = "one_at_a_time" | "all";

export type SessionId = string;

export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "aborted" | "error";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ToolArguments = Value;

export type ToolCallId = string;

export type ToolDetails = Value;

export type ToolDonePayload = { error: ToolError } | { result: ToolResult } | ToolResult;

export type ToolExecutionMode = "parallel" | "sequential";

export type ToolName = string;

export type ToolOutputStream = "stdout" | "stderr" | "status";

export type WaitMode = "steering" | "follow_up" | "any";


export function abort(handle: number): StepResult;

export function appendSessionEntry(handle: number, entry: SessionEntry): EmptyResult;

export function continueTurn(handle: number): StepResult;

export function createAgent(options: AgentOptions): CreateAgentResult;

export function destroyAgent(handle: number): EmptyResult;

export function estimateTokens(input: EstimateTokensInput): EstimateTokensResult;

export function estimateTokensForText(text: string): EstimateTokensResult;

export function fallbackStrategy(tool_name: string): ContextStrategy;

export function feedLlmChunk(handle: number, chunk: LlmChunk): EventsResult;

export function followUp(handle: number, message: AgentMessage): EmptyResult;

export function getSessionBranch(handle: number): SessionBranchResult;

export function getSessionState(handle: number): SessionStateResult;

export function moveTo(handle: number, target_id: string, summary?: BranchSummary | null): MoveToResult;

export function onLlmDone(handle: number, result: LlmResult): StepResult;

export function onToolCancelled(handle: number, tool_call_id: string, reason: CancelReason): StepResult;

export function onToolDone(handle: number, tool_call_id: string, payload: ToolDonePayload): StepResult;

export function onToolStarted(handle: number, tool_call_id: string): EventsResult;

export function onToolUpdate(handle: number, update: ToolExecutionUpdate): EventsResult;

export function projectContext(input: ProjectionInput): ProjectionResult;

export function prompt(handle: number, prompt: PromptRequest): StepResult;

export function reset(handle: number): EmptyResult;

export function setLogLevel(level: string): void;

export function setSessionState(handle: number, state: SessionState): EmptyResult;

export function state(handle: number): StateResult;

export function steer(handle: number, message: AgentMessage): EventsResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly abort: (a: number) => any;
    readonly appendSessionEntry: (a: number, b: any) => any;
    readonly continueTurn: (a: number) => any;
    readonly createAgent: (a: any) => any;
    readonly destroyAgent: (a: number) => any;
    readonly estimateTokens: (a: any) => any;
    readonly estimateTokensForText: (a: number, b: number) => any;
    readonly fallbackStrategy: (a: number, b: number) => any;
    readonly feedLlmChunk: (a: number, b: any) => any;
    readonly followUp: (a: number, b: any) => any;
    readonly getSessionBranch: (a: number) => any;
    readonly getSessionState: (a: number) => any;
    readonly moveTo: (a: number, b: number, c: number, d: number) => any;
    readonly onLlmDone: (a: number, b: any) => any;
    readonly onToolCancelled: (a: number, b: number, c: number, d: any) => any;
    readonly onToolDone: (a: number, b: number, c: number, d: any) => any;
    readonly onToolStarted: (a: number, b: number, c: number) => any;
    readonly onToolUpdate: (a: number, b: any) => any;
    readonly projectContext: (a: any) => any;
    readonly prompt: (a: number, b: any) => any;
    readonly reset: (a: number) => any;
    readonly setLogLevel: (a: number, b: number) => void;
    readonly setSessionState: (a: number, b: any) => any;
    readonly state: (a: number) => any;
    readonly steer: (a: number, b: any) => any;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
