#!/usr/bin/env node
/**
 * Backfill missing embeddings in kruschdb.blobs.
 * Finds all rows where embedding IS NULL and generates via the Ollama fleet.
 */
import pg from 'pg';
import { getEmbedding, isEmbeddable, MAX_EMBED_CHARS } from '../lib/embedding.js';
import path from 'path';

const pool = new pg.Pool({
    host: process.env.DB_HOST || '10.0.0.85',
    port: process.env.DB_PORT || 5434,
    user: process.env.DB_USER || 'openclaw',
    password: process.env.DB_PASSWORD || 'openclaw_password',
    database: process.env.DB_NAME || 'kruschdb'
});

async function main() {
    console.log('PG-Git Embedding Backfill');
    console.log('========================');

    const missing = await pool.query(
        'SELECT id, file_name, file_path, content, size FROM blobs WHERE embedding IS NULL ORDER BY size ASC'
    );
    console.log(`Found ${missing.rows.length} blobs missing embeddings.\n`);

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const row of missing.rows) {
        const ext = path.extname(row.file_name || '').toLowerCase();
        if (!isEmbeddable(ext)) {
            skipped++;
            continue;
        }

        // Decode content from bytea
        let text;
        try {
            text = Buffer.from(row.content).toString('utf8');
        } catch (e) {
            skipped++;
            continue;
        }

        if (!text || text.length < 10) {
            skipped++;
            continue;
        }

        const truncated = text.substring(0, MAX_EMBED_CHARS);
        const vector = await getEmbedding(truncated);

        if (vector) {
            const embeddingStr = `[${vector.join(',')}]`;
            await pool.query(
                'UPDATE blobs SET embedding = $1::vector WHERE id = $2',
                [embeddingStr, row.id]
            );
            processed++;
            if (processed % 50 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
                console.log(`Embedded ${processed} (${rate}/s, ${elapsed}s elapsed) | skipped: ${skipped} | failed: ${failed}`);
            }
        } else {
            failed++;
            if (failed <= 5) console.warn(`Failed to embed: ${row.file_path}`);
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDone: ${processed} embedded, ${skipped} skipped, ${failed} failed (${totalTime}s)`);
    await pool.end();
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
