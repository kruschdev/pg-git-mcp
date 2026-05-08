# PG-Git - Agent Context

This file provides architectural context and rules for any AI agent or LLM operating within this repository. 

## Project Overview
This repository contains a standalone **PostgreSQL-Backed Version Control System** and an **MCP Server** that exposes semantic code search capabilities to AI IDEs. It provides an ACID-compliant Git DAG implementation with automatic temporal decay for semantic searches.

## Architecture & Rules

1. **The MCP SDK**: All communication must strictly adhere to the official `@modelcontextprotocol/sdk`. We use `StdioServerTransport` for all I/O.
2. **Semantic Blobs**: Git objects (Blobs, Trees, Commits) are mapped directly into SQL (`db/schema.sql`). Blobs contain an `embedding vector(1024)` generated locally via Ollama (`bge-large`).
3. **Temporal Decay**: The `searchBlobs()` function (exposed as `pg_git_semantic_search` in standalone mode, or `krusch_context_search_code` via [Krusch Context MCP](https://github.com/kruschdev/krusch-context-mcp)) dynamically calculates cosine similarity using the `pgvector` HNSW index, and explicitly multiplies the score by an exponential time decay `exp(-0.01 * age)` using the `last_seen_at` timestamp.
4. **Standalone Purity**: This project is completely standalone. Always use standard `pg`, `dotenv`, and native `child_process.exec` (for git operations).

## Development Workflows
- **Syncing**: The `scripts/sync_to_pg.js` script (`npm run snapshot`) automatically hashes, embeds, and inserts the current working directory into Postgres.
- **Importing**: The `scripts/import_github.js` script (`npm run import`) parses native `.git` history using `git log` and `git ls-tree`, embedding files sequentially into Postgres.

## Hazards
- **NEVER** pass files larger than 50,000 characters to Ollama for embedding. Always enforce size limits to prevent node crashes.
- **NEVER** run the `import` script on a massive repository without confirming Ollama has sufficient VRAM to handle rapid sequential embeddings.

---

## 🤖 Agent Enforcement Patterns (For End-Users)

If you are deploying PG-Git as your primary semantic memory architecture, you should actively enforce its usage in your IDE to maximize context retention.

### 1. The Workspace Zero-Trust Rule
To prevent your agent from suffering from "Goldfish Memory" or confidently hallucinating outdated context based on stale local files, add a **Zero-Trust Verification** rule to your global AI instructions (e.g., `.cursorrules` or Claude Desktop's Global System Prompt):

> **### 🛑 ZERO-TRUST CONTEXT VERIFICATION**
> Before executing a research task, writing code, or answering architectural questions in a new session, you MUST independently execute a Vector Database query to pull the latest codebase realities. 
> **Execution:** You must physically execute the `krusch_context_search_code` tool to search for context related to the current topic. The database has a built-in temporal decay that ensures you only retrieve the freshest, most relevant code. If you proceed without querying semantic memory first, you are violating the core partnership agreement.

### 2. The Agentic Snapshot Protocol
Agents should be instructed to take a semantic snapshot of the codebase before closing a session or finishing a major refactor. Ensure your agents have a rule to run the snapshot command:

> **### 📸 END-OF-SESSION PROTOCOL**
> When concluding a task or stepping away, you must sync the current state to the PG-Git database so it can be semantically retrieved later.
> **Execution:** Run `node /path/to/pg-git/scripts/sync_to_pg.js .` on the active repository before ending the session.
