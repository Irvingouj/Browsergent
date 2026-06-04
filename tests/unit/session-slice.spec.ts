import { describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("session slice", () => {
	test("sessionPanelOpenChanged toggles panel open state", () => {
		expect(browsergentStore.getState().session.sessionPanelOpen).toBe(false);

		browsergentStore.getState().sessionPanelOpenChanged(true);
		expect(browsergentStore.getState().session.sessionPanelOpen).toBe(true);

		browsergentStore.getState().sessionPanelOpenChanged(false);
		expect(browsergentStore.getState().session.sessionPanelOpen).toBe(false);
	});

	test("sessionListLoaded replaces the entire session list", () => {
		const sessions = [
			{ id: "s1", title: "Session 1", timestamp: 1000, messageCount: 3 },
			{ id: "s2", title: "Session 2", timestamp: 2000, messageCount: 5 },
		];

		browsergentStore.getState().sessionListLoaded(sessions);
		expect(browsergentStore.getState().session.sessions).toHaveLength(2);
		expect(browsergentStore.getState().session.sessions[0]).toEqual(
			sessions[0],
		);
		expect(browsergentStore.getState().session.sessions[1]).toEqual(
			sessions[1],
		);
	});

	test("activeSessionChanged updates active session id", () => {
		browsergentStore.getState().activeSessionChanged("s1");
		expect(browsergentStore.getState().session.activeSessionId).toBe("s1");

		browsergentStore.getState().activeSessionChanged("s2");
		expect(browsergentStore.getState().session.activeSessionId).toBe("s2");
	});

	test("sessionTitleUpdated finds session by id and updates title", () => {
		browsergentStore.getState().sessionListLoaded([
			{ id: "s1", title: "Old Title", timestamp: 1000, messageCount: 2 },
			{ id: "s2", title: "Untouched", timestamp: 2000, messageCount: 4 },
		]);

		browsergentStore.getState().sessionTitleUpdated("s1", "New Title");
		const state = browsergentStore.getState().session.sessions;
		expect(state[0].title).toBe("New Title");
		expect(state[1].title).toBe("Untouched");
	});

	test("sessionDeleted removes session and clears activeSessionId if it was active", () => {
		browsergentStore.getState().sessionListLoaded([
			{ id: "s1", title: "Session 1", timestamp: 1000, messageCount: 1 },
			{ id: "s2", title: "Session 2", timestamp: 2000, messageCount: 2 },
		]);
		browsergentStore.getState().activeSessionChanged("s1");

		browsergentStore.getState().sessionDeleted("s1");
		expect(browsergentStore.getState().session.sessions).toHaveLength(1);
		expect(browsergentStore.getState().session.sessions[0].id).toBe("s2");
		expect(browsergentStore.getState().session.activeSessionId).toBeNull();
	});

	test("sessionDeleted removes session without clearing activeSessionId if another was active", () => {
		browsergentStore.getState().sessionListLoaded([
			{ id: "s1", title: "Session 1", timestamp: 1000, messageCount: 1 },
			{ id: "s2", title: "Session 2", timestamp: 2000, messageCount: 2 },
		]);
		browsergentStore.getState().activeSessionChanged("s2");

		browsergentStore.getState().sessionDeleted("s1");
		expect(browsergentStore.getState().session.sessions).toHaveLength(1);
		expect(browsergentStore.getState().session.activeSessionId).toBe("s2");
	});

	test("sessionCreated adds a new placeholder session and sets it as active", () => {
		browsergentStore
			.getState()
			.sessionListLoaded([
				{ id: "s1", title: "Existing", timestamp: 1000, messageCount: 1 },
			]);

		browsergentStore.getState().sessionCreated("s2");
		const state = browsergentStore.getState().session;
		expect(state.sessions).toHaveLength(2);
		expect(state.sessions[0].id).toBe("s2");
		expect(state.sessions[0].title).toBe("Session s2");
		expect(state.sessions[0].messageCount).toBe(0);
		expect(state.activeSessionId).toBe("s2");
	});

	test("setSessionsLoading toggles loading state", () => {
		expect(browsergentStore.getState().session.isLoadingSessions).toBe(false);

		browsergentStore.getState().setSessionsLoading(true);
		expect(browsergentStore.getState().session.isLoadingSessions).toBe(true);

		browsergentStore.getState().setSessionsLoading(false);
		expect(browsergentStore.getState().session.isLoadingSessions).toBe(false);
	});
});
