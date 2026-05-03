/**
 * Shared Ollama embedding client for PG-Git.
 * Centralizes the embedding logic that was previously duplicated
 * across mcp.js, sync_to_pg.js, and import_github.js.
 */

import { config } from '../config.js';

const TEXT_EXTENSIONS = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt',
    '.html', '.css', '.yml', '.yaml', '.sql', '.py', '.sh',
    '.toml', '.env', '.dockerfile', '.graphql', '.vue', '.svelte'
]);

/**
 * Generate a vector embedding for a text string via Ollama.
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]|null>} The embedding vector, or null on failure.
 */
export async function getEmbedding(text) {
    try {
        const res = await fetch(`${config.ai.ollamaUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: config.ai.embedModel, prompt: text })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.embedding;
    } catch (e) {
        console.error(`[Embed] Ollama request failed: ${e.message}`);
        return null;
    }
}

/**
 * Check if a file extension is a text type we should embed.
 * @param {string} ext - The lowercase file extension (e.g. '.js').
 * @returns {boolean}
 */
export function isEmbeddable(ext) {
    return TEXT_EXTENSIONS.has(ext);
}

/** Maximum character length to send to Ollama for embedding. */
export const MAX_EMBED_CHARS = 50000;
