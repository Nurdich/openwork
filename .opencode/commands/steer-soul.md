---
description: Steer Soul Mode (interactive)
agent: soul
---

Steer Soul Mode based on the user's request.

Rules:
- If the user provides explicit values, apply directly.
- You may update: Current focus, Preferences/boundaries, and heartbeat cadence.
- If cadence changes, update the `soul-heartbeat` scheduler job.
- Summarize exactly what changed.
- Tooling limits: do NOT use subagents or search tools. Use only read/edit on allowed files and scheduler tools.
