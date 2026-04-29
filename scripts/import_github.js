#!/usr/bin/env node

import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import { query, pool } from '../db/pool.js';

const execPromise = util.promisify(exec);

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";
const TEXT_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml', '.sql', '.py', '.sh']);

async function getEmbedding(text) {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.embedding;
    } catch (e) {
        return null;
    }
}

async function isGitRepo(targetDir) {
    try {
        await execPromise('git rev-parse --is-inside-work-tree', { cwd: targetDir });
        return true;
    } catch {
        return false;
    }
}

async function processBlob(blobHash, name, repoId, targetDir) {
    const existing = await query(`SELECT id FROM blobs WHERE id = $1`, [blobHash]);
    if (existing.rows.length > 0) {
        await query(`UPDATE blobs SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1`, [blobHash]);
        return;
    }

    try {
        const { stdout } = await execPromise(`git cat-file -p ${blobHash}`, { cwd: targetDir, encoding: 'buffer', maxBuffer: 1024 * 1024 * 50 }); // 50MB max
        const ext = path.extname(name).toLowerCase();
        let embeddingStr = null;

        if (TEXT_EXTENSIONS.has(ext)) {
            const text = stdout.toString('utf-8');
            if (text.length < 50000) {
                console.log(`[Embed] Generating vector for blob: ${blobHash.substring(0, 7)} (${name})`);
                const vector = await getEmbedding(text);
                if (vector) {
                    embeddingStr = `[${vector.join(',')}]`;
                }
            }
        }

        if (embeddingStr) {
            await query(
                `INSERT INTO blobs (id, repository_id, content, size, embedding) VALUES ($1, $2, $3, $4, $5::vector) ON CONFLICT (id) DO NOTHING`,
                [blobHash, repoId, stdout, stdout.length, embeddingStr]
            );
        } else {
            await query(
                `INSERT INTO blobs (id, repository_id, content, size) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
                [blobHash, repoId, stdout, stdout.length]
            );
        }
    } catch (e) {
        console.error(`Failed to process blob ${blobHash}:`, e.message);
    }
}

async function processTree(treeHash, repoId, targetDir) {
    const existing = await query(`SELECT id FROM trees WHERE id = $1`, [treeHash]);
    if (existing.rows.length > 0) return;

    try {
        const { stdout } = await execPromise(`git ls-tree ${treeHash}`, { cwd: targetDir });
        const lines = stdout.trim().split('\n').filter(l => l.length > 0);

        // Insert tree first
        await query(`INSERT INTO trees (id, repository_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [treeHash, repoId]);

        for (const line of lines) {
            // Format: 100644 blob hash    filename
            const match = line.match(/^\d+ (\w+) ([a-f0-9]{40})\t(.*)$/);
            if (!match) continue;
            
            const [_, type, objectId, name] = match;

            if (type === 'tree') {
                await processTree(objectId, repoId, targetDir);
            } else if (type === 'blob') {
                await processBlob(objectId, name, repoId, targetDir);
            }

            await query(
                `INSERT INTO tree_entries (tree_id, type, name, object_id) VALUES ($1, $2, $3, $4) ON CONFLICT (tree_id, name) DO NOTHING`,
                [treeHash, type, name, objectId]
            );
        }
    } catch (e) {
        console.error(`Failed to process tree ${treeHash}:`, e.message);
    }
}

async function main() {
    const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    
    if (!(await isGitRepo(targetDir))) {
        console.error(`Error: Directory is not a valid git repository: ${targetDir}`);
        process.exit(1);
    }

    const repoName = path.basename(targetDir);
    console.log(`Starting GitHub Import for: ${repoName}`);

    // Get or Create Repo
    let repoId;
    const res = await query(`SELECT id FROM repositories WHERE name = $1`, [repoName]);
    if (res.rows.length > 0) {
        repoId = res.rows[0].id;
    } else {
        const inserted = await query(`INSERT INTO repositories (name, description) VALUES ($1, $2) RETURNING id`, [repoName, `Imported from git repository`]);
        repoId = inserted.rows[0].id;
    }

    // Fetch Commits
    // Format: Hash|ParentHash|AuthorName|CommitMessage
    const { stdout: logOut } = await execPromise(`git log --reverse --format="%H|%P|%an|%s"`, { cwd: targetDir });
    const commits = logOut.trim().split('\n').filter(l => l.length > 0);

    console.log(`Found ${commits.length} commits to process...`);

    let latestCommitSha = null;

    for (let i = 0; i < commits.length; i++) {
        const line = commits[i];
        const parts = line.split('|');
        const hash = parts[0];
        // Git log parent hashes are space separated. Take the first one for simplicity.
        const parentHash = parts[1] ? parts[1].split(' ')[0] : null; 
        const author = parts[2] || 'Unknown';
        const message = parts.slice(3).join('|') || 'No message';

        const existingCommit = await query(`SELECT id FROM commits WHERE id = $1`, [hash]);
        if (existingCommit.rows.length > 0) {
            latestCommitSha = hash;
            continue;
        }

        console.log(`[${i + 1}/${commits.length}] Importing commit: ${hash.substring(0, 7)} - ${message}`);

        // Get Tree Hash
        const { stdout: treeOut } = await execPromise(`git show -s --format=%T ${hash}`, { cwd: targetDir });
        const treeHash = treeOut.trim();

        // Process the entire tree recursively
        await processTree(treeHash, repoId, targetDir);

        // Insert Commit
        await query(
            `INSERT INTO commits (id, repository_id, tree_id, parent_id, message, author) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
            [hash, repoId, treeHash, parentHash, message, author]
        );

        latestCommitSha = hash;
    }

    // Update main branch
    if (latestCommitSha) {
        // Find current branch name
        const { stdout: branchOut } = await execPromise(`git branch --show-current`, { cwd: targetDir });
        const branchName = branchOut.trim() || 'main';

        const branchRes = await query(`SELECT id FROM branches WHERE repository_id = $1 AND name = $2`, [repoId, branchName]);
        if (branchRes.rows.length > 0) {
            await query(`UPDATE branches SET commit_id = $1 WHERE repository_id = $2 AND name = $3`, [latestCommitSha, repoId, branchName]);
        } else {
            await query(`INSERT INTO branches (repository_id, name, commit_id) VALUES ($1, $2, $3)`, [repoId, branchName, latestCommitSha]);
        }
        console.log(`✅ Import complete! Branch '${branchName}' updated to point to ${latestCommitSha.substring(0, 7)}`);
    }

    await pool.end();
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
