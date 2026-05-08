#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { query, pool } from '../db/pool.js';
import { hashContent } from '../server/git-engine.js';
import { getEmbedding, isEmbeddable, MAX_EMBED_CHARS } from '../lib/embedding.js';

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '__pycache__', 'data', 'tmp', '.gemini', '.venv', '.vscode', 'nodes', 'sandbox', 'logs']);

async function insertBlob(repoId, buffer, filePath, rootDir) {
    const sha = hashContent(buffer);
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const relativePath = path.relative(rootDir, filePath);
    
    // Check if the blob already exists to avoid re-embedding
    const existing = await query(`SELECT id, embedding FROM blobs WHERE id = $1`, [sha]);
    let needsEmbedding = true;
    if (existing.rows.length > 0) {
        await query(`UPDATE blobs SET last_seen_at = CURRENT_TIMESTAMP, file_name = COALESCE(file_name, $2), file_path = COALESCE(file_path, $3) WHERE id = $1`, [sha, fileName, relativePath]);
        if (existing.rows[0].embedding !== null) {
            return sha;
        }
        // If it exists but embedding is null, we fall through to embed it.
    }

    let embeddingStr = null;
    let summary = null;
    if (isEmbeddable(ext)) {
        const text = buffer.toString('utf-8');
        // Generate summary (first 500 chars) for search result display
        summary = text.substring(0, 500);
        console.log(`[Embed] Generating semantic vector for: ${path.basename(filePath)}`);
        const textToEmbed = text.substring(0, 8000);
        const vector = await getEmbedding(textToEmbed);
        if (vector) {
            embeddingStr = `[${vector.join(',')}]`;
        }
    }

    // Pointer-based storage: summary + file_path, no full content
    if (embeddingStr) {
        await query(
            `INSERT INTO blobs (id, repository_id, size, embedding, file_name, file_path, summary, storage_mode) VALUES ($1, $2, $3, $4::vector, $5, $6, $7, 'pointer') ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding`,
            [sha, repoId, buffer.length, embeddingStr, fileName, relativePath, summary]
        );
    } else {
        await query(
            `INSERT INTO blobs (id, repository_id, size, file_name, file_path, summary, storage_mode) VALUES ($1, $2, $3, $4, $5, $6, 'pointer') ON CONFLICT (id) DO NOTHING`,
            [sha, repoId, buffer.length, fileName, relativePath, summary]
        );
    }

    return sha;
}

function hashTree(entries) {
    // Standardize sorting by name
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const content = entries.map(e => `${e.type} ${e.object_id} ${e.name}`).join('\n');
    return crypto.createHash('sha1').update(`tree ${content.length}\0${content}`).digest('hex');
}

async function processDirectory(dirPath, repoId, rootDir) {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const entries = [];

    for (const item of items) {
        if (EXCLUDED_DIRS.has(item.name)) continue;
        
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) {
            const treeSha = await processDirectory(fullPath, repoId, rootDir);
            if (treeSha) {
                entries.push({ type: 'tree', name: item.name, object_id: treeSha });
            }
        } else {
            let stat;
            try {
                stat = await fs.stat(fullPath);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    console.log(`[Skip] Broken link or missing file: ${fullPath}`);
                    continue;
                }
                throw e;
            }
            if (stat.isDirectory()) {
                console.log(`[Skip] Ignoring directory symlink: ${fullPath}`);
                continue;
            }
            if (stat.size > 50 * 1024 * 1024) {
                console.log(`[Skip] Ignoring large file: ${fullPath} (${Math.round(stat.size/1024/1024)}MB)`);
                continue;
            }
            const buffer = await fs.readFile(fullPath);
            const blobSha = await insertBlob(repoId, buffer, fullPath, rootDir);
            entries.push({ type: 'blob', name: item.name, object_id: blobSha });
        }
    }

    if (entries.length === 0) return null;

    const treeSha = hashTree(entries);
    
    // Insert Tree if not exists
    await query(`INSERT INTO trees (id, repository_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [treeSha, repoId]);
    
    // Insert tree entries
    for (const entry of entries) {
        await query(
            `INSERT INTO tree_entries (tree_id, type, name, object_id) VALUES ($1, $2, $3, $4) ON CONFLICT (tree_id, name) DO NOTHING`,
            [treeSha, entry.type, entry.name, entry.object_id]
        );
    }

    return treeSha;
}

async function main() {
    const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    const repoName = path.basename(targetDir);
    
    console.log(`Starting Semantic PG-Git Snapshot for: ${repoName}`);
    console.log(`Target Directory: ${targetDir}`);

    // Get or Create Repo
    let repoId;
    const res = await query(`SELECT id FROM repositories WHERE name = $1`, [repoName]);
    if (res.rows.length > 0) {
        repoId = res.rows[0].id;
    } else {
        const inserted = await query(`INSERT INTO repositories (name, description) VALUES ($1, $2) RETURNING id`, [repoName, `Automated snapshot of ${repoName}`]);
        repoId = inserted.rows[0].id;
    }

    // Process Tree
    const rootTreeSha = await processDirectory(targetDir, repoId, targetDir);
    if (!rootTreeSha) {
        console.log('Directory is empty or all ignored.');
        await pool.end();
        return;
    }

    // Create Commit
    const commitMessage = `Automated snapshot at ${new Date().toISOString()}`;
    const commitContent = `tree ${rootTreeSha}\nmessage ${commitMessage}`;
    const commitSha = crypto.createHash('sha1').update(`commit ${commitContent.length}\0${commitContent}`).digest('hex');

    // Get parent commit if exists
    let parentId = null;
    const branchRes = await query(`SELECT commit_id FROM branches WHERE repository_id = $1 AND name = 'main'`, [repoId]);
    if (branchRes.rows.length > 0) {
        parentId = branchRes.rows[0].commit_id;
    }

    // Skip if nothing changed (assuming root tree is same as parent's root tree)
    if (parentId) {
        const parentRes = await query(`SELECT tree_id FROM commits WHERE id = $1`, [parentId]);
        if (parentRes.rows.length > 0 && parentRes.rows[0].tree_id === rootTreeSha) {
            console.log('No changes detected since last snapshot. Skipping commit.');
            await pool.end();
            return;
        }
    }

    await query(
        `INSERT INTO commits (id, repository_id, tree_id, parent_id, message, author) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [commitSha, repoId, rootTreeSha, parentId, commitMessage, 'Semantic-Agent']
    );

    // Update branch
    if (parentId) {
        await query(`UPDATE branches SET commit_id = $1 WHERE repository_id = $2 AND name = 'main'`, [commitSha, repoId]);
    } else {
        await query(`INSERT INTO branches (repository_id, name, commit_id) VALUES ($1, $2, $3)`, [repoId, 'main', commitSha]);
    }

    console.log(`✅ Snapshot complete! Commit SHA: ${commitSha}`);
    await pool.end();
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
