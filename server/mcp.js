#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

import { 
    getRepositories, 
    getTreeEntries, 
    getBlob, 
    getRepoRootTree,
    searchBlobs
} from './git-engine.js';

import { getEmbedding } from '../lib/embedding.js';
import { pool } from '../db/pool.js';

// ── Health Check ──────────────────────────────────────────────────────────────
async function verifyDatabase() {
    try {
        await pool.query('SELECT 1');
        console.error('[pg-git-mcp] Database connection verified.');
    } catch (err) {
        console.error('[pg-git-mcp] FATAL: Cannot reach PostgreSQL:', err.message);
        process.exit(1);
    }
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
    { name: "pg-git-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "pg_git_list_repos",
                description: "List all available PG-Git repositories stored in the database.",
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: "pg_git_read_tree",
                description: "Read the directory structure (DAG node) of a specific repository. If tree_id is omitted, it attempts to read the root tree of the 'main' branch.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repository_id: { type: "number", description: "The ID of the repository." },
                        tree_id: { type: "string", description: "The specific SHA-1 tree hash. Leave empty for root." }
                    },
                    required: ["repository_id"]
                }
            },
            {
                name: "pg_git_read_blob",
                description: "Read the file contents of a specific blob.",
                inputSchema: {
                    type: "object",
                    properties: {
                        blob_id: { type: "string", description: "The SHA-1 hash of the blob." }
                    },
                    required: ["blob_id"]
                }
            },
            {
                name: "pg_git_semantic_search",
                description: "Semantically search the contents of all files in PG-Git. Results are automatically decayed by age so recent code ranks higher.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query." },
                        limit: { type: "number", description: "Number of results to return.", default: 5 },
                        project: { type: "string", description: "Optional project name to filter search (e.g., 'annotated', 'signet', 'krusch-dbos-mcp')." },
                        repository_id: { type: "number", description: "Optional repository ID to limit search to a specific repo." }
                    },
                    required: ["query"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments || {};
    try {
        if (request.params.name === "pg_git_list_repos") {
            const repos = await getRepositories();
            const output = repos.map(r => `ID: ${r.id} | Name: ${r.name} | Desc: ${r.description}`).join('\n');
            return {
                content: [{ type: "text", text: output || "No repositories found." }]
            };
        } else if (request.params.name === "pg_git_read_tree") {
            const { repository_id, tree_id } = args;
            let targetTree = tree_id;
            
            if (!targetTree) {
                targetTree = await getRepoRootTree(repository_id);
                if (!targetTree) {
                    return { content: [{ type: "text", text: "No 'main' branch or root tree found for this repository. It may be empty." }] };
                }
            }
            
            const entries = await getTreeEntries(targetTree);
            if (!entries || entries.length === 0) {
                return { content: [{ type: "text", text: `Tree ${targetTree} is empty or does not exist.` }] };
            }
            
            const output = entries.map(e => `[${e.type.toUpperCase()}] ${e.name} (Object ID: ${e.object_id})`).join('\n');
            return { content: [{ type: "text", text: `Tree contents for ${targetTree}:\n\n${output}` }] };

        } else if (request.params.name === "pg_git_read_blob") {
            const { blob_id } = args;
            const blob = await getBlob(blob_id);
            if (!blob) {
                throw new McpError(ErrorCode.InvalidParams, `Blob ${blob_id} not found.`);
            }
            
            const textContent = blob.content.toString('utf-8');
            return { content: [{ type: "text", text: textContent }] };
            
        } else if (request.params.name === "pg_git_semantic_search") {
            const { query: searchQuery, limit = 5, repository_id, project } = args;
            
            // Resolve project name to repository_id if provided
            let resolvedRepoId = repository_id;
            if (project && !resolvedRepoId) {
                const repoRes = await pool.query(`SELECT id FROM repositories WHERE name = $1`, [project]);
                if (repoRes.rows.length > 0) {
                    resolvedRepoId = repoRes.rows[0].id;
                }
            }
            
            const vector = await getEmbedding(searchQuery);
            if (!vector) {
                throw new McpError(ErrorCode.InternalError, "Failed to generate embedding for query via Ollama.");
            }
            
            const results = await searchBlobs(vector, limit, resolvedRepoId);
            if (results.length === 0) {
                return { content: [{ type: "text", text: "No semantically relevant files found." }] };
            }
            
            let output = `=== 🔍 Semantic Search Results ===\n`;
            for (const r of results) {
                const dateStr = r.last_seen_at ? new Date(r.last_seen_at).toISOString().split('T')[0] : 'unknown';
                const projectTag = r.project ? `[${r.project}]` : '';
                const pathStr = r.file_path ? ` | Path: ${r.file_path}` : '';
                output += `\n--- Match (Score: ${Number(r.similarity).toFixed(2)}) | ${projectTag} ${r.file_name}${pathStr} | Seen: ${dateStr} ---\n`;
                // Preview first 500 chars
                const content = r.content.toString('utf-8');
                output += content.substring(0, 500) + (content.length > 500 ? '...\n' : '\n');
            }
            return { content: [{ type: "text", text: output }] };

        } else {
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
    } catch (err) {
        // Re-throw MCP errors directly so the SDK handles them properly
        if (err instanceof McpError) throw err;
        return {
            content: [{ type: "text", text: `[Error] Failed executing ${request.params.name}: ${err.message}` }],
            isError: true
        };
    }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
async function shutdown() {
    console.error('[pg-git-mcp] Shutting down...');
    try { await pool.end(); } catch (_) { /* best-effort */ }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
    await verifyDatabase();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[pg-git-mcp] Server running on stdio");
}

main().catch(err => {
    console.error("[Fatal]", err);
    process.exit(1);
});
