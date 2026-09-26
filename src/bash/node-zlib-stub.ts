// just-bash's browser bundle still imports node:zlib for gzip/gunzip.
// The extension build has no Node zlib. Those commands fail when called.

function unavailable(name: string): never {
	throw new Error(`${name} is not available in the browser shell`);
}

export const constants = {
	Z_BEST_COMPRESSION: 9,
	Z_BEST_SPEED: 1,
	Z_DEFAULT_COMPRESSION: -1,
};

export function gunzipSync(
	_buffer?: Uint8Array,
	// just-bash passes zlib options. This stub never reads them.
	_options?: unknown,
): Uint8Array {
	unavailable("gunzipSync");
}

export function gzipSync(
	_buffer?: Uint8Array,
	// just-bash passes zlib options. This stub never reads them.
	_options?: unknown,
): Uint8Array {
	unavailable("gzipSync");
}
