---
description: Remove Soul Mode (revert)
agent: soul
---

Revert Soul Mode completely.

Constraints:
- Tooling limits: do NOT use subagents or search tools. Use only allowed bash rm/rmdir and edit for opencode.json/opencode.jsonc.

Steps:
1) Delete scheduler job `soul-heartbeat`.
2) Remove files created for Soul Mode:
   - `.opencode/soul.md`
   - `.opencode/soul/`
   - `.opencode/agents/soul.md`
   - `.opencode/commands/soul-heartbeat.md`
   - `.opencode/commands/soul-status.md`
   - `.opencode/commands/steer-soul.md`
   - `.opencode/commands/take-my-soul-back.md`
3) Revert `opencode.json*` changes made by Soul Mode:
   - remove `.opencode/soul.md` from `instructions`
   - remove `opencode-scheduler` only if it was added solely for Soul Mode
4) Summarize exactly what was removed.
