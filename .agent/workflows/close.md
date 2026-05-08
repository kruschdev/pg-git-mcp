---
description: Pause pg-git and save semantic state
---

# /close — PG-Git

## Steps

1. **Self-Sync**: Take a semantic snapshot of pg-git itself.
   ```bash
   node /home/kruschdev/homelab/projects/pg-git/scripts/sync_to_pg.js /home/kruschdev/homelab/projects/pg-git
   ```

2. **Update GEMINI_INFLIGHT.md**:
   - Create or overwrite `GEMINI_INFLIGHT.md` in this project root.
   - Include: current MCP tool status, any pending schema migrations, Ollama model health.

3. **Log Activity**:
   - Execute `krusch_context_add_memory` with `category: 'activity'` and content: `[pg-git] <description>`.

4. **Save Steering Facts**:
   - Store any new patterns via `mcp_nuggets-memory_remember` with `kind: 'project'`, key prefixed `pg-git:`.

5. **Summarize**: 
   > "PG-Git state saved. See you next session."
