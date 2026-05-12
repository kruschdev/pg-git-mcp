#!/usr/bin/env node
/**
 * Backfill missing embeddings in kruschdb.blobs.
 * Finds all rows where embedding IS NULL and generates via the Ollama fleet.
 * 
 * Usage:
 *   node scripts/backfill_embeddings.js              # Homelab repos only
 *   node scripts/backfill_embeddings.js --all         # All repos including datasets
 *   node scripts/backfill_embeddings.js --project=pg-git  # Single project
 */
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { getChunkedCentroidEmbedding, isEmbeddable } from '../lib/embedding.js';
import { ollamaQueue } from '../lib/embedding.js';

const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5434,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kruschdb'
});

// Homelab projects to include by default (matches sync_all_projects.js)
const HOMELAB_REPOS = new Set([
    'annotated', 'agent-toolkit-for-aws', 'berean', 'caren', 'first-things-first',
    'heyjb', 'hivemind-companion-ext', 'home-ai', 'krusch-dbos-mcp', 'krusch-agentic-mcp',
    'krusch-context-mcp', 'krusch-infra-mcp', 'krusch-ide', 'lightmind', 'money-machine',
    'perkins_snow_removal', 'pg-git', 'pocket-lawyer', 'pocket-lawyer-marketing',
    'roughin-suite', 'signet', 'spark', 'vllm', 'scripts', 'lib', 'lib-py', '.agent'
]);

async function main() {
    const args = process.argv.slice(2);
    const allRepos = args.includes('--all');
    const projectFlag = args.find(a => a.startsWith('--project='));
    const projectFilter = projectFlag ? projectFlag.split('=')[1] : null;

    console.log('PG-Git Embedding Backfill');
    console.log('========================');
    if (projectFilter) console.log(`Filter: project=${projectFilter}`);
    else if (!allRepos) console.log('Filter: homelab repos only (use --all for everything)');

    // Build query with repo filtering
    let queryText = `
        SELECT b.id, b.file_name, b.file_path, b.size, b.summary, r.name as repo_name
        FROM blobs b
        JOIN repositories r ON b.repository_id = r.id
        WHERE b.embedding IS NULL AND b.file_name IS NOT NULL
    `;
    const params = [];
    
    if (projectFilter) {
        queryText += ` AND r.name = $1`;
        params.push(projectFilter);
    } else if (!allRepos) {
        queryText += ` AND r.name = ANY($1)`;
        params.push([...HOMELAB_REPOS]);
    }
    
    queryText += ` ORDER BY b.size ASC`;

    const missing = await pool.query(queryText, params);
    console.log(`Found ${missing.rows.length} blobs missing embeddings.\n`);

    if (missing.rows.length === 0) {
        console.log('Nothing to backfill!');
        await pool.end();
        return;
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const startTime = Date.now();
    const logInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = processed > 0 ? (processed / (Date.now() - startTime) * 1000).toFixed(1) : '0';
        console.log(`[${elapsed}s] Embedded: ${processed} | Skipped: ${skipped} | Failed: ${failed} | Rate: ${rate}/s`);
    }, 10_000);

    for (const row of missing.rows) {
        const ext = path.extname(row.file_name || '').toLowerCase();
        if (!isEmbeddable(ext)) {
            skipped++;
            continue;
        }

        // Try to read text from summary (stored during pointer-mode sync)
        let text = row.summary || '';
        
        // If summary is too short, skip — we can't embed meaningfully
        if (text.length < 10) {
            skipped++;
            continue;
        }

        // Use chunked centroid for quality parity with the sync path
        const vector = await getChunkedCentroidEmbedding(text);

        if (vector) {
            const embeddingStr = `[${vector.join(',')}]`;
            await pool.query(
                'UPDATE blobs SET embedding = $1::vector WHERE id = $2',
                [embeddingStr, row.id]
            );
            processed++;
        } else {
            failed++;
            if (failed <= 5) console.warn(`Failed to embed: ${row.file_path} (${row.repo_name})`);
        }
    }

    clearInterval(logInterval);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDone: ${processed} embedded, ${skipped} skipped, ${failed} failed (${totalTime}s)`);
    
    // Print fleet health
    try {
        const health = ollamaQueue.health();
        console.log(`Fleet: ${health.map(h => `${h.endpoint.split('//')[1]} (✓${h.successes}/✗${h.failures})`).join(', ')}`);
    } catch (_) { /* queue not initialized */ }

    await pool.end();
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
