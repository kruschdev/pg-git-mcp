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
                // console.log(`[Embed] Requesting ${config.ai.embedModel}`);
                const res = await fetch(`${endpoint}/api/embeddings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        model: config.ai.embedModel, 
                        prompt: text,
                        truncate: true,
                        options: { num_ctx: 512 }
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

/** Maximum character length to send to Ollama for embedding (bge-large has 512 token limit -> safely ~2k chars). */
export const MAX_EMBED_CHARS = 2000;

/**
 * Calculates an L2-normalized centroid for an array of vectors.
 * @param {number[][]} vectors 
 * @returns {number[]|null} 
 */
function calculateCentroid(vectors) {
    if (!vectors || vectors.length === 0) return null;
    if (vectors.length === 1) return vectors[0];
    
    const len = vectors[0].length;
    let centroid = new Array(len).fill(0);
    
    for (const vec of vectors) {
        for (let i = 0; i < len; i++) {
            centroid[i] += vec[i];
        }
    }
    
    let sqSum = 0;
    for (let i = 0; i < len; i++) {
        sqSum += centroid[i] * centroid[i];
    }
    
    const norm = Math.sqrt(sqSum);
    if (norm === 0) return centroid;
    
    for (let i = 0; i < len; i++) {
        centroid[i] = centroid[i] / norm;
    }
    
    return centroid;
}

/**
 * Splits text into overlapping chunks, embeds each, and returns the L2-normalized centroid.
 * @param {string} text - The full text to embed.
 * @param {number} priority - The queue priority level.
 * @returns {Promise<number[]|null>} The centroid embedding vector, or null on failure.
 */
export async function getChunkedCentroidEmbedding(text, priority = PRIORITY.LOW) {
    const CHUNK_SIZE = 800;
    const OVERLAP = 200;
    
    if (text.length <= CHUNK_SIZE) {
        return await getEmbedding(text, priority);
    }
    
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        chunks.push(text.substring(start, start + CHUNK_SIZE));
        start += (CHUNK_SIZE - OVERLAP);
    }
    
    // Limit to max 30 chunks (~30k chars) to prevent massive API spam for huge files
    const maxChunks = Math.min(chunks.length, 30);
    const vectors = [];
    
    // Process chunks sequentially to avoid tying up the entire LLM queue
    for (let i = 0; i < maxChunks; i++) {
        const vec = await getEmbedding(chunks[i], priority);
        if (vec) vectors.push(vec);
    }
    
    return calculateCentroid(vectors);
}
