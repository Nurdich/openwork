---
description: Soul Mode status (read-only)
agent: soul
---

Provide a read-only Soul Mode status report.

Constraints:
- Read-only: do not modify files.
- Tooling limits: do NOT use subagents or search tools. Only use read/glob and scheduler status tools.

Steps:
1) Read `.opencode/soul.md`.
2) Read the latest entries in `.opencode/soul/heartbeat.jsonl`.
3) Check scheduler job state for `soul-heartbeat` (if scheduler is available).

Output:
- Current focus
- Latest heartbeat age
- Top loose ends (1-3)
- Next action
