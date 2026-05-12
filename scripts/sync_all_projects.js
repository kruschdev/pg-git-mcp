#!/usr/bin/env node

/**
 * Batch sync all active homelab projects into pg-git's kruschdb.blobs.
 * Each project gets its own repository entry for project-scoped search.
 * 
 * Usage: node scripts/sync_all_projects.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Active projects to sync (matching AGENTS.md project listing)
const PROJECTS = [
    'annotated',
    'agent-toolkit-for-aws',
    'berean',
    'caren',
    'first-things-first',
    'heyjb',
    'hivemind-companion-ext',
    'home-ai',
    'krusch-dbos-mcp',
    'krusch-agentic-mcp',
    'krusch-context-mcp',
    'krusch-infra-mcp',
    'krusch-ide',
    'lightmind',
    'money-machine',
    'perkins_snow_removal',
    'pg-git',
    'pocket-lawyer',
    'pocket-lawyer-marketing',
    'roughin-suite',
    'signet',
    'spark',
    'vllm',
];

// Also sync root-level dirs (relative to monorepo root)
const MONOREPO_ROOT = path.resolve(__dirname, '../../..');
const ROOT_DIRS = [
    { name: 'scripts', path: path.join(MONOREPO_ROOT, 'scripts') },
    { name: 'lib', path: path.join(MONOREPO_ROOT, 'lib') },
    { name: 'lib-py', path: path.join(MONOREPO_ROOT, 'lib-py') },
    { name: '.agent', path: path.join(MONOREPO_ROOT, '.agent') },
];

const HOMELAB_ROOT = path.join(MONOREPO_ROOT, 'projects');

async function main() {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);

    const syncScript = path.join(__dirname, 'sync_to_pg.js');

    // Parse --parallel=N flag (default 3)
    const parallelFlag = process.argv.find(a => a.startsWith('--parallel='));
    const PARALLEL = Math.max(1, parseInt(parallelFlag?.split('=')[1] || '3', 10));

    console.log(`=== Batch Sync: All Active Projects (parallel=${PARALLEL}) ===\n`);

    /**
     * Run sync tasks with concurrency limit.
     * @param {{ name: string, path: string }[]} tasks
     */
    async function syncWithConcurrency(tasks) {
        const results = { success: 0, failed: 0 };
        const executing = new Set();

        for (const task of tasks) {
            const run = (async () => {
                try {
                    console.log(`\n📦 Syncing: ${task.name}`);
                    const { stdout, stderr } = await exec('node', [syncScript, task.path], {
                        timeout: 3600_000,
                        env: { ...process.env }
                    });
                    if (stdout) console.log(stdout);
                    if (stderr) console.error(stderr);
                    results.success++;
                } catch (err) {
                    console.error(`❌ Failed to sync ${task.name}: ${err.message}`);
                    results.failed++;
                }
            })();

            executing.add(run);
            run.finally(() => executing.delete(run));

            if (executing.size >= PARALLEL) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);
        return results;
    }

    // Build unified task list
    const allTasks = [
        ...PROJECTS.map(p => ({ name: p, path: path.join(HOMELAB_ROOT, p) })),
        ...ROOT_DIRS.map(d => ({ name: d.name, path: d.path }))
    ];

    const results = await syncWithConcurrency(allTasks);

    // Summary
    const res = await query(`
        SELECT r.name as project, count(b.id) as blobs, count(b.embedding) as embedded
        FROM repositories r
        LEFT JOIN blobs b ON b.repository_id = r.id
        GROUP BY r.name
        ORDER BY blobs DESC
    `);
    
    console.log('\n=== Sync Summary ===');
    console.log('Project'.padEnd(30) + 'Blobs'.padStart(8) + 'Embedded'.padStart(10));
    console.log('-'.repeat(48));
    for (const row of res.rows) {
        console.log(row.project.padEnd(30) + String(row.blobs).padStart(8) + String(row.embedded).padStart(10));
    }

    await pool.end();
    console.log(`\n✅ Batch sync complete! (${results.success} succeeded, ${results.failed} failed)`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
