/* @ts-self-types="./pi_host_web.d.ts" */

/**
 * @param {number} handle
 * @param {SessionEntry} entry
 * @returns {EmptyResult}
 */
export function appendSessionEntry(handle, entry) {
    const ret = wasm.appendSessionEntry(handle, entry);
    return ret;
}

/**
 * @param {number} handle
 * @returns {StepResult}
 */
export function continueTurn(handle) {
    const ret = wasm.continueTurn(handle);
    return ret;
}

/**
 * @param {AgentOptions} options
 * @returns {CreateAgentResult}
 */
export function createAgent(options) {
    const ret = wasm.createAgent(options);
    return ret;
}

/**
 * @param {number} handle
 * @returns {EmptyResult}
 */
export function destroyAgent(handle) {
    const ret = wasm.destroyAgent(handle);
    return ret;
}

/**
 * @param {EstimateTokensInput} input
 * @returns {EstimateTokensResult}
 */
export function estimateTokens(input) {
    const ret = wasm.estimateTokens(input);
    return ret;
}

/**
 * @param {string} text
 * @returns {EstimateTokensResult}
 */
export function estimateTokensForText(text) {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.estimateTokensForText(ptr0, len0);
    return ret;
}

/**
 * @param {string} tool_name
 * @returns {ContextStrategy}
 */
export function fallbackStrategy(tool_name) {
    const ptr0 = passStringToWasm0(tool_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.fallbackStrategy(ptr0, len0);
    return ret;
}

/**
 * @param {number} handle
 * @param {LlmChunk} chunk
 * @returns {EventsResult}
 */
export function feedLlmChunk(handle, chunk) {
    const ret = wasm.feedLlmChunk(handle, chunk);
    return ret;
}

/**
 * @param {number} handle
 * @param {AgentMessage} message
 * @returns {EmptyResult}
 */
export function followUp(handle, message) {
    const ret = wasm.followUp(handle, message);
    return ret;
}

/**
 * @param {number} handle
 * @returns {SessionBranchResult}
 */
export function getSessionBranch(handle) {
    const ret = wasm.getSessionBranch(handle);
    return ret;
}

/**
 * @param {number} handle
 * @returns {SessionStateResult}
 */
export function getSessionState(handle) {
    const ret = wasm.getSessionState(handle);
    return ret;
}

/**
 * @param {number} handle
 * @param {string} target_id
 * @param {BranchSummary | null} [summary]
 * @returns {MoveToResult}
 */
export function moveTo(handle, target_id, summary) {
    const ptr0 = passStringToWasm0(target_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.moveTo(handle, ptr0, len0, isLikeNone(summary) ? 0 : addToExternrefTable0(summary));
    return ret;
}

/**
 * @param {number} handle
 * @param {LlmResult} result
 * @returns {StepResult}
 */
export function onLlmDone(handle, result) {
    const ret = wasm.onLlmDone(handle, result);
    return ret;
}

/**
 * @param {number} handle
 * @param {string} tool_call_id
 * @param {CancelReason} reason
 * @returns {StepResult}
 */
export function onToolCancelled(handle, tool_call_id, reason) {
    const ptr0 = passStringToWasm0(tool_call_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.onToolCancelled(handle, ptr0, len0, reason);
    return ret;
}

/**
 * @param {number} handle
 * @param {string} tool_call_id
 * @param {ToolDonePayload} payload
 * @returns {StepResult}
 */
export function onToolDone(handle, tool_call_id, payload) {
    const ptr0 = passStringToWasm0(tool_call_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.onToolDone(handle, ptr0, len0, payload);
    return ret;
}

/**
 * @param {number} handle
 * @param {string} tool_call_id
 * @returns {EventsResult}
 */
export function onToolStarted(handle, tool_call_id) {
    const ptr0 = passStringToWasm0(tool_call_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.onToolStarted(handle, ptr0, len0);
    return ret;
}

/**
 * @param {number} handle
 * @param {ToolExecutionUpdate} update
 * @returns {EventsResult}
 */
export function onToolUpdate(handle, update) {
    const ret = wasm.onToolUpdate(handle, update);
    return ret;
}

/**
 * @param {ProjectionInput} input
 * @returns {ProjectionResult}
 */
export function projectContext(input) {
    const ret = wasm.projectContext(input);
    return ret;
}

/**
 * @param {number} handle
 * @param {PromptRequest} prompt
 * @returns {StepResult}
 */
export function prompt(handle, prompt) {
    const ret = wasm.prompt(handle, prompt);
    return ret;
}

/**
 * @param {number} handle
 * @returns {EmptyResult}
 */
export function reset(handle) {
    const ret = wasm.reset(handle);
    return ret;
}

/**
 * @param {string} level
 */
export function setLogLevel(level) {
    const ptr0 = passStringToWasm0(level, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.setLogLevel(ptr0, len0);
}

/**
 * @param {number} handle
 * @param {SessionState} state
 * @returns {EmptyResult}
 */
export function setSessionState(handle, state) {
    const ret = wasm.setSessionState(handle, state);
    return ret;
}

/**
 * @param {number} handle
 * @returns {StateResult}
 */
export function state(handle) {
    const ret = wasm.state(handle);
    return ret;
}

/**
 * @param {number} handle
 * @param {AgentMessage} message
 * @returns {EventsResult}
 */
export function steer(handle, message) {
    const ret = wasm.steer(handle, message);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_is_undefined_67b456be8673d3d7: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_string_get_72bdf95d3ae505b1: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_0c201ade58bb55e1: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_ce2c4456b290c5e7: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_mark_b4d943f3bc2d2404: function(arg0, arg1) {
            performance.mark(getStringFromWasm0(arg0, arg1));
        },
        __wbg_measure_84362959e621a2c1: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            let deferred0_0;
            let deferred0_1;
            let deferred1_0;
            let deferred1_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                deferred1_0 = arg2;
                deferred1_1 = arg3;
                performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }, arguments); },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_parse_03863847d06c4e89: function() { return handleError(function (arg0, arg1) {
            const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_stringify_8286df6dcc591521: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./pi_host_web_bg.js": import0,
    };
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('pi_host_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
