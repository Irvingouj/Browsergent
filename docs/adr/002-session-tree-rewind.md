# ADR 002: Pi-Compatible Session-Tree Rewind

**Status:** Accepted

Browsergent will adopt Pi's session-tree semantics: `/tree`-style navigation moves the active leaf while preserving other branches, and `/fork` creates a child session from the entry before the selected user message and returns that prompt to the composer. Rewind changes conversation history only; it does not undo or replay browser/file side effects, and resumed work uses the current page state. The new session-history format has no backward-compatibility or migration requirement for legacy snapshots.
