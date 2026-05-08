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

// Also sync root-level dirs
const ROOT_DIRS = [
    { name: 'scripts', path: '/home/kruschdev/homelab/scripts' },
    { name: 'lib', path: '/home/kruschdev/homelab/lib' },
    { name: 'lib-py', path: '/home/kruschdev/homelab/lib-py' },
    { name: '.agent', path: '/home/kruschdev/homelab/.agent' },
];

const HOMELAB_ROOT = '/home/kruschdev/homelab/projects';

async function main() {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);

    const syncScript = path.join(__dirname, 'sync_to_pg.js');

    console.log('=== Batch Sync: All Active Projects ===\n');

    // Sync projects
    for (const project of PROJECTS) {
        const projectPath = path.join(HOMELAB_ROOT, project);
        try {
            console.log(`\n📦 Syncing project: ${project}`);
            const { stdout, stderr } = await exec('node', [syncScript, projectPath], {
                timeout: 3600_000, // 60 min per project
                env: { ...process.env }
            });
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
        } catch (err) {
            console.error(`❌ Failed to sync ${project}: ${err.message}`);
        }
    }

    // Sync root dirs
    for (const dir of ROOT_DIRS) {
        try {
            console.log(`\n📦 Syncing root dir: ${dir.name}`);
            const { stdout, stderr } = await exec('node', [syncScript, dir.path], {
                timeout: 3600_000,
                env: { ...process.env }
            });
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
        } catch (err) {
            console.error(`❌ Failed to sync ${dir.name}: ${err.message}`);
        }
    }

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
    console.log('\n✅ Batch sync complete!');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
