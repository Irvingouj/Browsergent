# Changelog

All notable changes to Browsergent are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.0] — 2026-07-11

### Changed

- **`@pi-oxide/extension-js` `^0.15.3` → `^0.16.0`.** Picks up the capability-register content-script tool surface, fixed `web.tab` positional `tabId` fields, `chrome.scripting.executeScript({ func })` → `E_UNTRANSPORTABLE_PARAM` (no more opaque Chrome `func`/`files` error after QuickJS transport), and sidepanel structured API error display.

### Notes for agents / operators

- Sandbox `page.*` / `web.tab.*` **call shapes are unchanged**; the upgrade is runtime quality + clearer transport errors.
- Prefer `web.tab.evaluate` or packaged `files:` for MAIN-world injection instead of passing `func` into `chrome.scripting.executeScript`.

## [0.5.7] — prior

See GitHub Releases for earlier notes (`v0.5.7` and below).
