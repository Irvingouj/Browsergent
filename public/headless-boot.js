(function () {
	const workers = new Map();

	function publish(sessionId, event) {
		chrome.runtime
			.sendMessage({ type: "offscreenRunEvent", sessionId, event })
			.catch(function () {});
	}

	function ensureWorker(sessionId) {
		const existing = workers.get(sessionId);
		if (existing) return existing;
		const worker = new Worker(chrome.runtime.getURL("agent-worker.js"), {
			type: "module",
		});
		worker.onmessage = function (event) {
			publish(sessionId, event.data);
		};
		workers.set(sessionId, worker);
		return worker;
	}

	function isRunCommand(message) {
		return (
			message &&
			message.type === "offscreenRunCommand" &&
			typeof message.sessionId === "string" &&
			typeof message.windowId === "number" &&
			message.message &&
			typeof message.message === "object"
		);
	}

	chrome.runtime.onMessage.addListener(function (message) {
		if (!isRunCommand(message)) return;
		const worker = ensureWorker(message.sessionId);
		worker.postMessage(message.message);
	});

	chrome.runtime.sendMessage({ type: "offscreenHostReady" }).catch(function () {});
})();