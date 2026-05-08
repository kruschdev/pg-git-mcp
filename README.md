# PG-Git (Semantic Memory Engine)

<p align="center">
  <img src="assets/banner.png" alt="PG-Git Banner" width="100%">
</p>

A persistent, PostgreSQL-backed repository management system and semantic memory engine for AI IDEs. Instead of storing Git objects loosely on the file system, PG-Git stores the entire Directed Acyclic Graph (DAG) natively in PostgreSQL, complete with automatically generated, temporally-decayed semantic vector embeddings.

[![npm version](https://badge.fury.io/js/pg-git-mcp.svg)](https://badge.fury.io/js/pg-git-mcp)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
![Node](https://img.shields.io/badge/Node.js-22+-green.svg)
![Ollama](https://img.shields.io/badge/Ollama-bge--large-blue.svg)
![DB](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-lightgrey.svg)

## 🧠 Why PG-Git?

In the standard AI coding agent ecosystem, searching codebases relies on rigid grep searches or expensive AST parsing. PG-Git fundamentally changes this by bridging Git directly with Vector Databases:
1. **Semantic Code Search**: Find code based on what it *does*, not just its syntax.
2. **Exponential Temporal Decay**: PG-Git mathematically decays older vectors. Your agent will prioritize code you wrote yesterday over highly similar dead code written 6 months ago.
3. **Local-First Purity**: No cloud APIs. It uses Ollama with `bge-large` for 100% private, on-device vectorization at 1024 dimensions.
4. **ACID Compliant**: Native transactions ensure complete safety for multi-node accessibility and concurrent AI swarm agents.

## ⚠️ Not a Replacement for Git

It is critical to understand that PG-Git **does not replace Git** or services like GitHub/GitLab. It does not handle branch merging, rebasing, or pull requests. 

Instead, PG-Git is an **agentic augmentation layer**. You continue to use standard Git for your human-facing source control and team collaboration. PG-Git sits alongside it in your workflow, automatically ingesting your standard Git history to provide your AI agents with a mathematically optimized, semantically searchable clone of your codebase.

## 🤝 The Agentic Brain (Synergy with Krusch Context MCP)

PG-Git is designed to be used as the **codebase engine** underneath the **[Krusch Context MCP](https://github.com/kruschdev/krusch-context-mcp)** — a unified IDE context server that collapses semantic code search, episodic memory, and holographic nuggets into a single MCP process.

While PG-Git can be run standalone as its own MCP server (via `server/mcp.js`), its full power is realized when consumed by Krusch Context MCP:

| Layer | Source | Purpose |
|-------|--------|---------|
| **Codebase Memory (The "What" & "How")** | PG-Git `blobs` table | Semantically embedded source files across your entire codebase |
| **Episodic Memory (The "Why")** | Krusch Context `ide_agent_memory` | Architectural decisions, bugs encountered, project goals |
| **Holographic Nuggets (The "How to Behave")** | Krusch Context `ide_agent_nuggets` | Lightweight steering facts, user preferences, project conventions |

**Infinite Continuity**: By running Krusch Context MCP (which imports PG-Git's database pool and embedding logic directly), your agent can cross-reference the *intent* (episodic memory) with the *implementation* (codebase blobs). It remembers *why* you chose a specific architecture, and instantly sees *how* it's currently implemented, creating a deeply contextualized and autonomous coding workflow that persists across infinite sessions.

> 🔗 **See the full unified server documentation:** [Krusch Context MCP README](https://github.com/kruschdev/krusch-context-mcp)

## ⚡ Quick Start

You **must** have [Ollama](https://ollama.com/) running with the `bge-large` embedding model pulled:
```bash
ollama pull bge-large
```

**1. Clone & Migrate Database**
You will need a running PostgreSQL instance with `pgvector` enabled.
```bash
git clone https://github.com/kruschdev/pg-git.git
cd pg-git
npm install
cp .env.example .env
# Edit .env with your PostgreSQL credentials
node db/migrate.js
```

**2. Import Your GitHub History**

> [!WARNING]
> **Choose your embedding model carefully.** You must set your preferred model (via the Web UI Settings tab or `.env`) *before* running your first import or snapshot. If you change models later, vector dimensions will collide and you will be forced to manually wipe the database and re-embed all repositories from scratch.

You can instantly import any local `.git` repository. PG-Git will natively parse the Git history, generate semantic embeddings for all blobs, and securely deduplicate them into PostgreSQL:
```bash
npm run import
```

**3a. Use via Krusch Context MCP (Recommended)**

The recommended way to use PG-Git is through the [Krusch Context MCP](https://github.com/kruschdev/krusch-context-mcp) unified server, which wraps PG-Git's database pool and embedding logic alongside episodic memory and nuggets. See the [Krusch Context MCP Quick Start](https://github.com/kruschdev/krusch-context-mcp#-quick-start) for setup instructions.

**3b. Use Standalone MCP Server**

If you prefer to run PG-Git as an isolated MCP server, you can execute it directly via NPM. Add it to your agent/IDE configuration (e.g., `mcp_config.json`):
```json
{
  "mcpServers": {
    "pg-git-mcp": {
      "command": "npx",
      "args": ["-y", "pg-git-mcp"],
      "env": {
        "PG_CONNECTION_STRING": "postgres://user:pass@localhost:5434/kruschdb",
        "OLLAMA_URL": "http://localhost:11434",
        "EMBED_MODEL": "bge-large"
      }
    }
  }
}
```

**4. Start the Web UI (Optional)**
PG-Git includes a sleek, dual-pane IDE interface for browsing your semantic repositories.
```bash
npm run dev
```

---

## 🔧 MCP Tools (Standalone Mode)

When running PG-Git as a standalone MCP server, it exposes the following tools:

| Tool | Description |
|------|-------------|
| `pg_git_list_repos` | List all available PG-Git repositories stored in the database |
| `pg_git_read_tree` | Read the directory structure (DAG node) of a specific repository |
| `pg_git_read_blob` | Read the file contents of a specific blob |
| `pg_git_semantic_search` | Semantically search all indexed files with temporal decay scoring |

> [!NOTE]
> When used through **Krusch Context MCP**, these capabilities are exposed under unified tool names (`krusch_context_search_code`, `krusch_context_read_tree`, `krusch_context_read_blob`, `krusch_context_list_repos`) alongside 14 additional memory and nugget tools.

---

## 🚀 Real-World Usage Examples

### Standalone Mode

Speak to your IDE agent normally. It will use the standalone MCP tools to interface with the database:

**Example 1: Finding specific logic**
> **You:** "Where do we handle the temporal decay for the memory MCP?"
> **Agent:** *[Calls `pg_git_semantic_search`]* "I found the logic in `server/git-engine.js`. It uses the `exp(-0.01 * age_in_days)` formula in `searchBlobs()`."

**Example 2: Reading a repository tree**
> **You:** "What is the folder structure for the pg-git project?"
> **Agent:** *[Calls `pg_git_read_tree`]* "Here is the root directory structure..."

**Example 3: Filtering by project**
> **You:** "Search for authentication logic in the pocket-lawyer project only."
> **Agent:** *[Calls `pg_git_semantic_search` with `project: 'pocket-lawyer'`]* "Found 3 matches in the auth module..."

### How Does Temporal Decay Work?

When calling `pg_git_semantic_search`, PG-Git returns the highest cosine-similarity matches. However, it applies **Exponential Temporal Decay** based on the blob's `last_seen_at` timestamp:

```
score = cosine_similarity × exp(-0.01 × age_in_days)
```

If you have two very similar pieces of code, the *newer* one will have a significantly higher score, preventing your agent from hallucinating based on outdated implementations.

---

## 🤖 The Autonomous Agent Workflow

You can integrate PG-Git into your agentic workflow to ensure your semantic memory is always up to date. 

### Snapshot (Single Project)
Whenever you step away from a task, tell your agent to run the snapshot script. The agent will autonomously:
1. Hash the current project folder into Git Blobs and Trees.
2. Ping Ollama to embed any new or modified files.
3. Commit the state directly into PostgreSQL.

```bash
npm run snapshot
```

### Sync All Projects (Fleet-Wide)
To re-index all active project codebases across the fleet:

```bash
npm run sync-all
```

### External Documentation Sync
PG-Git can ingest external documentation (e.g., `llms.txt` manifests) for hallucination-free framework knowledge:

```bash
node scripts/sync_external_docs.js
```

---

## 📂 Project Structure

```
pg-git/
├── server/
│   ├── index.js              # Express API + Web UI server
│   ├── mcp.js                # Standalone MCP server (StdioServerTransport)
│   └── git-engine.js         # Git DAG operations + semantic search with temporal decay
├── db/
│   ├── schema.sql            # PostgreSQL schema (repos, commits, branches, trees, blobs + pgvector)
│   ├── pool.js               # Shared pg.Pool connection
│   ├── migrate.js            # Schema migration runner
│   ├── create-db.js          # Database creation helper
│   └── list-dbs.js           # List available databases
├── lib/
│   └── embedding.js          # Shared Ollama embedding client with fleet load balancing
├── scripts/
│   ├── sync_to_pg.js         # Snapshot a single project into PostgreSQL
│   ├── sync_all_projects.js  # Fleet-wide project sync
│   ├── sync_external_docs.js # External documentation ingestion (llms.txt)
│   ├── import_github.js      # Import native .git history
│   ├── import_hf_dataset.js  # Import HuggingFace datasets
│   ├── backfill_embeddings.js # Backfill missing embeddings
│   ├── migrate_to_1024.js    # Dimension migration helper
│   ├── migrate_to_pointer.js # Storage mode migration
│   └── scaffold_nesting_dolls.js # Nesting-doll chunking scaffold
├── client/                   # Vite + React Web UI
├── config/
│   └── external_docs.json    # External documentation manifest
├── config.js                 # Unified configuration (env + config.json merge)
├── assets/                   # Banner and social preview images
├── Dockerfile                # Multi-stage production build
├── docker-compose.yml        # Container orchestration
├── AGENTS.md                 # Agent context rules for AI IDEs
└── spec.md                   # Original project specification
```

---

## 🛠️ Configuration & Environment Variables

PG-Git uses a layered configuration system: environment variables override `config.json`, which overrides built-in defaults.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Express server port | `4890` |
| `DB_HOST` | PostgreSQL Host address | `localhost` |
| `DB_PORT` | PostgreSQL Port | `5434` |
| `DB_NAME` | Database Name | `postgres` |
| `DB_USER` | Database User | `postgres` |
| `DB_PASSWORD` | Database Password | *(empty)* |
| `OLLAMA_URL` | The endpoint for your local Ollama instance | `http://localhost:11434` |
| `EMBED_MODEL`| The Ollama text-embedding model to use | `bge-large` |

### Database Schema

PG-Git's PostgreSQL schema maps Git objects directly into SQL tables:

- **`repositories`** — Project registries
- **`commits`** — SHA-1 identified commit objects with tree and parent references
- **`branches`** — Named references to commit heads
- **`trees`** / **`tree_entries`** — Directory structures mapping names to blob/tree object IDs
- **`blobs`** — File content with `embedding vector(1024)` and `last_seen_at` temporal tracking

Semantic search uses the `pgvector` HNSW index with `vector_cosine_ops` for sub-millisecond approximate nearest-neighbor lookups.

---

## 🗺️ Related Projects

| Project | Role |
|---------|------|
| **[Krusch Context MCP](https://github.com/kruschdev/krusch-context-mcp)** | Unified IDE context server — wraps PG-Git + episodic memory + nuggets into a single MCP process |
| [PG-Git MCP on NPM](https://www.npmjs.com/package/pg-git-mcp) | This project published to the NPM registry |
| [NeoVertex Nuggets](https://github.com/NeoVertex1/nuggets) | Original Holographic Nuggets MCP architecture adapted in Krusch Context |

## License
ISC License. Created by [kruschdev](https://github.com/kruschdev).
