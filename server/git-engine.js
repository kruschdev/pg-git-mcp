import crypto from 'crypto';
import { query } from '../db/pool.js';

export function hashContent(buffer) {
    // Basic SHA-1 similar to git blob hashing
    const header = `blob ${buffer.length}\0`;
    return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

export async function createRepository(name, description = '') {
    const res = await query(
        `INSERT INTO repositories (name, description) VALUES ($1, $2) RETURNING *`,
        [name, description]
    );
    return res.rows[0];
}

export async function getRepositories() {
    const res = await query(`SELECT * FROM repositories ORDER BY created_at DESC`);
    return res.rows;
}

export async function getRepository(id) {
    const res = await query(`SELECT * FROM repositories WHERE id = $1`, [id]);
    return res.rows[0];
}

// Minimal placeholder for inserting a blob
export async function insertBlob(repoId, buffer) {
    const sha = hashContent(buffer);
    await query(
        `INSERT INTO blobs (id, repository_id, content, size) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [sha, repoId, buffer, buffer.length]
    );
    return sha;
}

export async function getTreeEntries(treeId) {
    const res = await query(`SELECT * FROM tree_entries WHERE tree_id = $1`, [treeId]);
    return res.rows;
}

export async function getBlob(blobId) {
    const res = await query(`SELECT * FROM blobs WHERE id = $1`, [blobId]);
    return res.rows[0];
}

export async function getRepoRootTree(repoId) {
    const res = await query(`
        SELECT c.tree_id 
        FROM branches b
        JOIN commits c ON b.commit_id = c.id
        WHERE b.repository_id = $1 AND b.name = 'main'
        LIMIT 1
    `, [repoId]);
    return res.rows[0]?.tree_id || null;
}
