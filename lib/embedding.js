/**
 * Shared Ollama embedding client for PG-Git.
 * Centralizes the embedding logic and implements round-robin
 * load balancing across the fleet.
 */

import { config } from '../config.js';
import { ollamaQueue, PRIORITY } from '../../../lib/llm-queue.js';

const TEXT_EXTENSIONS = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt',
    '.html', '.css', '.yml', '.yaml', '.sql', '.py', '.sh',
    '.toml', '.env', '.dockerfile', '.graphql', '.vue', '.svelte'
]);

/**
 * Generate a vector embedding for a text string via Ollama.
 * Utilizes the centralized Ollama Priority Queue for concurrency management.
 * @param {string} text - The text to embed.
 * @param {number} priority - The queue priority level.
 * @returns {Promise<number[]|null>} The embedding vector, or null on failure.
 */
export async function getEmbedding(text, priority = PRIORITY.LOW) {
    try {
        return await ollamaQueue.enqueue(async (endpoint) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
            try {
                const res = await fetch(`${endpoint}/api/embeddings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        model: config.ai.embedModel, 
                        prompt: text,
                        options: { num_ctx: 2048 }
                    }),
                    signal: controller.signal
                });
                
                if (res.ok) {
                    const data = await res.json();
                    return data.embedding;
                } else {
                    const errText = await res.text();
                    throw new Error(`Status ${res.status}: ${errText}`);
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }, priority);
    } catch (e) {
        console.error(`[Embed] ${e.message}`);
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

/** Maximum character length to send to Ollama for embedding (nomic-embed-text has 2048-8192 token limit -> safely ~6k chars). */
export const MAX_EMBED_CHARS = 6000;
