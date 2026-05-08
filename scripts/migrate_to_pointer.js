#!/usr/bin/env node

/**
 * @module migrate_to_pointer
 * Migrates local project blobs from full-content storage to pointer-based storage.
 * Keeps HF dataset rows untouched (they have no local file to point to).
 * 
 * What it does:
 * 1. Adds `summary` and `storage_mode` columns to the blobs table
 * 2. For local project blobs: generates a summary (first 500 chars), sets storage_mode='pointer', nulls content
 * 3. For HF dataset blobs: sets storage_mode='full', leaves content intact
 */

import { query, pool } from '../db/pool.js';

const HF_REPO_PATTERNS = ['SWE-bench%', 'commitpackft%', 'glaive%', 'arcee%', 'code_search_net%'];

async function main() {
    console.log('Starting Pointer Migration...\n');

    // Step 1: Add new columns
    console.log('Step 1: Adding summary and storage_mode columns...');
    await query(`ALTER TABLE blobs ADD COLUMN IF NOT EXISTS summary TEXT`);
    await query(`ALTER TABLE blobs ADD COLUMN IF NOT EXISTS storage_mode VARCHAR(10) DEFAULT 'full'`);
    console.log('  ✅ Columns added.\n');

    // Step 2: Mark HF dataset rows as 'full' (they stay as-is)
    console.log('Step 2: Marking HF dataset rows as storage_mode=full...');
    for (const pattern of HF_REPO_PATTERNS) {
        const res = await query(`
            UPDATE blobs SET storage_mode = 'full'
            WHERE repository_id IN (SELECT id FROM repositories WHERE name LIKE $1)
            AND storage_mode IS DISTINCT FROM 'full'
        `, [pattern]);
        console.log(`  Updated ${res.rowCount} rows matching ${pattern}`);
    }

    // Step 3: Generate summaries and convert local project blobs to pointers
    console.log('\nStep 3: Migrating local project blobs to pointer mode...');

    // Get all local project blobs that still have content and no summary
    const localBlobs = await query(`
        SELECT b.id, octet_length(b.content) as content_size
        FROM blobs b
        JOIN repositories r ON b.repository_id = r.id
        WHERE b.summary IS NULL 
        AND b.content IS NOT NULL
        AND b.storage_mode IS DISTINCT FROM 'full'
        AND r.name NOT LIKE 'SWE-bench%'
        AND r.name NOT LIKE 'commitpackft%'
        AND r.name NOT LIKE 'glaive%'
        AND r.name NOT LIKE 'arcee%'
        AND r.name NOT LIKE 'code_search_net%'
    `);

    console.log(`  Found ${localBlobs.rows.length} local project blobs to migrate.`);

    let migrated = 0;
    let freedBytes = 0;
    const batchSize = 100;

    for (let i = 0; i < localBlobs.rows.length; i += batchSize) {
        const batch = localBlobs.rows.slice(i, i + batchSize);
        const ids = batch.map(r => r.id);

        // Generate summaries (first 500 chars of content) and null out content in one query
        await query(`
            UPDATE blobs 
            SET summary = substring(convert_from(content, 'UTF8') from 1 for 500),
                storage_mode = 'pointer',
                content = NULL
            WHERE id = ANY($1)
        `, [ids]);

        migrated += batch.length;
        freedBytes += batch.reduce((sum, r) => sum + (r.content_size || 0), 0);

        if (migrated % 1000 === 0 || i + batchSize >= localBlobs.rows.length) {
            console.log(`  Migrated ${migrated}/${localBlobs.rows.length} | Freed: ${(freedBytes / 1024 / 1024).toFixed(1)} MB`);
        }
    }

    // Step 4: Reclaim disk space
    console.log('\nStep 4: Running VACUUM to reclaim disk space...');
    // Note: VACUUM cannot run inside a transaction in node-pg,
    // so we need to set the pool to auto-commit mode
    const client = await pool.connect();
    try {
        await client.query('VACUUM (VERBOSE) blobs');
    } catch (e) {
        console.warn('  VACUUM warning (may need manual run):', e.message);
    } finally {
        client.release();
    }

    // Final stats
    const stats = await query(`
        SELECT 
            storage_mode,
            count(*) as rows,
            pg_size_pretty(sum(CASE WHEN content IS NOT NULL THEN octet_length(content) ELSE 0 END)) as content_size,
            count(summary) as with_summary
        FROM blobs 
        GROUP BY storage_mode
    `);

    console.log('\n=== Migration Complete ===');
    console.log(`Freed: ${(freedBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log('\nStorage breakdown:');
    stats.rows.forEach(r => {
        console.log(`  ${r.storage_mode || 'null'}: ${r.rows} rows, ${r.content_size} content, ${r.with_summary} with summaries`);
    });

    await pool.end();
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
