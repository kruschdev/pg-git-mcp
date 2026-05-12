# PG-Git — Session State

**Status**: Published and Stable
**Last Updated**: 2026-05-08

## Current State
- Successfully audited, rebranded, and published the underlying codebase memory engine as `pg-git-mcp` (v1.0.2) to the NPM registry.
- Re-wired the main `krusch-context-mcp` project to consume `pg-git-mcp` via NPM, removing the cumbersome "Sibling Dependency" requirement.
- The `client/dist` Web UI bundle successfully packaged and verified.

## MCP Tool Status
- All 4 standalone native tools (`pg_git_list_repos`, `pg_git_read_tree`, `pg_git_read_blob`, `pg_git_semantic_search`) are documented and accurately reflected in the new README.
- `krusch-context-mcp` fully imports and wraps these tools without issue.

## Pending Schema Migrations
- None. Schema is stable at 1024-dimension `bge-large`.

## Ollama Model Health
- `bge-large` operations verified as stable and successful during ingestion processes across the session.
