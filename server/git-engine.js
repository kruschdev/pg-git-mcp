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

/**
 * Semantic search with exponential temporal decay.
 * Score = cosine_similarity * exp(-0.01 * age_in_days)
 * 
 * Uses denormalized file_name column for performance.
 * Joins repositories to return the human-readable project name.
 * 
 * @param {number[]} vector - The query embedding vector.
 * @param {number} limit - Max results to return.
 * @param {number|undefined} repositoryId - Optional repo filter.
 * @returns {Promise<Array>} Matching rows with similarity, file_name, project, content, etc.
 */
export async function searchBlobs(vector, limit = 5, repositoryId) {
    const vectorStr = `[${vector.join(',')}]`;

    let sql = `
        SELECT 
            b.id,
            b.repository_id,
            r.name AS project,
            b.content,
            b.last_seen_at,
            COALESCE(b.file_name, b.id) AS file_name,
            b.file_path,
            (1 - (b.embedding <=> $1::vector)) 
                * exp(-0.01 * EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(b.last_seen_at, b.created_at))) / 86400.0)
            AS similarity
        FROM blobs b
        JOIN repositories r ON r.id = b.repository_id
        WHERE b.embedding IS NOT NULL
    `;

    const params = [vectorStr];

    if (repositoryId !== undefined && repositoryId !== null) {
        params.push(repositoryId);
        sql += ` AND b.repository_id = $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY similarity DESC LIMIT $${params.length}`;

    const res = await query(sql, params);
    return res.rows;
}

