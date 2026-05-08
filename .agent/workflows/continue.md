---
description: Resume pg-git development with project-scoped context
---

# /continue — PG-Git

## Steps

1. **Context Load (Project-Scoped)**:
   - Read `GEMINI_INFLIGHT.md` in this project root.
   - Query `krusch_context_search_memory(category: 'activity', query: 'pg-git')`.
   - Query `krusch_context_search_memory(category: 'lessons', query: 'pg-git pgvector embedding')`.
   - Query `mcp_nuggets-memory_nudges(kinds: ['project', 'user'], query: 'pg-git')`.
   - **Zero-Trust**: Execute `krusch_context_search_code(project: 'pg-git')` to verify the current codebase state.

2. **Health Checks**:
   - Verify kruschdb is reachable: `ssh kruschserv "docker exec openclaw-db psql -U openclaw -d kruschdb -c 'SELECT 1'"`.
   - Verify Ollama embedding model is available: `curl -s http://10.0.0.19:11434/api/tags | grep qwen2.5-coder`.
   - Check blob count: `ssh kruschserv "docker exec openclaw-db psql -U openclaw -d kruschdb -c 'SELECT COUNT(*) FROM blobs'"`.

3. **Transient State Check**: Look for any pending migrations, schema changes, or mid-flight refactors in `GEMINI_INFLIGHT.md`.

4. **Execution**: Generate `task.md` and begin work autonomously.
