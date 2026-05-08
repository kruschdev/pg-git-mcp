#!/usr/bin/env node

/**
 * @module import_hf_dataset
 * Universal Hugging Face dataset ingestion tool for the homelab semantic recall DB.
 * Fetches rows from any HF dataset via the datasets-server API, generates embeddings
 * via the Ollama fleet, and persists them into kruschdb.blobs.
 *
 * Usage:
 *   node scripts/import_hf_dataset.js --dataset bigcode/commitpackft --config javascript --split train --limit 50000
 *   node scripts/import_hf_dataset.js --dataset princeton-nlp/SWE-bench --split train --limit 100000
 *   node scripts/import_hf_dataset.js --dataset code-search-net/code_search_net --config python --split train --limit 100000
 */

import { query, pool } from '../db/pool.js';
import { getEmbedding, MAX_EMBED_CHARS } from '../lib/embedding.js';
import crypto from 'crypto';

const HF_API_BASE = 'https://datasets-server.huggingface.co/rows';

function hashContent(buffer) {
    const header = `blob ${buffer.length}\0`;
    return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (flag, fallback) => {
        const idx = args.indexOf(flag);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
    };
    return {
        dataset: get('--dataset', 'princeton-nlp/SWE-bench'),
        config: get('--config', 'default'),
        split: get('--split', 'train'),
        limit: parseInt(get('--limit', '10000'), 10),
        concurrent: parseInt(get('--concurrent', '15'), 10)
    };
}

async function fetchDatasetRows(dataset, config, split, offset, length) {
    const url = `${HF_API_BASE}?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${split}&offset=${offset}&length=${length}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HF API ${res.status} ${res.statusText}`);
    const data = await res.json();
    return data.rows || [];
}

// ── Row formatters ──────────────────────────────────────────────────────────────
// Each dataset has different column names. These formatters extract a coherent
// text blob + filename from the raw row object.

const FORMATTERS = {
    // SWE-bench: problem_statement + patch
    'princeton-nlp/SWE-bench': (row) => {
        const { instance_id, problem_statement, patch, repo } = row;
        if (!patch || !problem_statement) return null;
        const text = `Repository: ${repo}\nIssue: ${instance_id}\n\nProblem Statement:\n${problem_statement}\n\nResolution Patch:\n${patch}`;
        return { text, fileName: `${instance_id}.md`, id: instance_id };
    },

    // CommitPackFT: commit message (instruction) + code diff
    'bigcode/commitpackft': (row) => {
        const { subject, message, old_contents, new_contents, old_file, new_file } = row;
        const instruction = message || subject || '';
        if (!instruction || (!old_contents && !new_contents)) return null;
        const text = `Commit Message:\n${instruction}\n\nFile: ${new_file || old_file || 'unknown'}\n\nBefore:\n${(old_contents || '(new file)').substring(0, 4000)}\n\nAfter:\n${(new_contents || '(deleted)').substring(0, 4000)}`;
        const id = crypto.createHash('md5').update(text.substring(0, 500)).digest('hex').substring(0, 12);
        return { text, fileName: `commit_${id}.md`, id: `commit_${id}` };
    },

    // CodeSearchNet: function code + docstring
    'code-search-net/code_search_net': (row) => {
        const { func_code_string, func_documentation_string, func_name, language } = row;
        if (!func_code_string) return null;
        const doc = func_documentation_string || '(no documentation)';
        const text = `Language: ${language || 'unknown'}\nFunction: ${func_name || 'anonymous'}\n\nDocumentation:\n${doc}\n\nCode:\n${func_code_string}`;
        const id = crypto.createHash('md5').update(func_code_string.substring(0, 500)).digest('hex').substring(0, 12);
        return { text, fileName: `${func_name || id}.md`, id };
    },

    // SWE-bench Verified: same format as SWE-bench
    'princeton-nlp/SWE-bench_Verified': (row) => FORMATTERS['princeton-nlp/SWE-bench'](row),

    // Glaive Function Calling v2: system prompt with tool defs + multi-turn chat
    'glaiveai/glaive-function-calling-v2': (row) => {
        const { system, chat } = row;
        if (!chat) return null;
        const text = `${system || ''}\n\n${chat}`.substring(0, 8000);
        const id = crypto.createHash('md5').update(chat.substring(0, 500)).digest('hex').substring(0, 12);
        return { text, fileName: `fc_${id}.md`, id: `fc_${id}` };
    },

    // Arcee Agent Data: multi-turn conversation trajectories
    'arcee-ai/agent-data': (row) => {
        const { conversations, dataset } = row;
        if (!conversations || !Array.isArray(conversations) || conversations.length === 0) return null;
        const text = conversations.map(c => `[${(c.from || 'unknown').toUpperCase()}]\n${c.value}`).join('\n\n');
        const id = crypto.createHash('md5').update(text.substring(0, 500)).digest('hex').substring(0, 12);
        return { text: text.substring(0, 8000), fileName: `agent_${id}.md`, id: `agent_${id}` };
    },

    // LeetCode Dataset: problem + solution + explanation
    'newfacade/LeetCodeDataset': (row) => {
        const { task_id, difficulty, tags, problem_description, completion, response } = row;
        if (!problem_description || !completion) return null;
        const tagStr = Array.isArray(tags) ? tags.join(', ') : '';
        const text = `# ${task_id} [${difficulty}]\nTags: ${tagStr}\n\nProblem:\n${problem_description}\n\nSolution:\n${completion}\n\nExplanation:\n${(response || '').substring(0, 3000)}`;
        return { text: text.substring(0, 8000), fileName: `lc_${task_id}.md`, id: `lc_${task_id}` };
    }
};

// Generic fallback: concatenate all string values
function genericFormatter(row) {
    const parts = [];
    let id = '';
    for (const [key, val] of Object.entries(row)) {
        if (typeof val === 'string' && val.length > 0) {
            parts.push(`${key}: ${val.substring(0, 3000)}`);
            if (!id && val.length > 5) id = crypto.createHash('md5').update(val.substring(0, 200)).digest('hex').substring(0, 12);
        }
    }
    if (parts.length === 0) return null;
    return { text: parts.join('\n\n'), fileName: `row_${id}.md`, id };
}

async function processRow(rowObj, repoId, datasetSlug, formatter) {
    const parsed = formatter(rowObj);
    if (!parsed) return;

    const { text, fileName, id } = parsed;
    const contentBuffer = Buffer.from(text, 'utf-8');
    const blobHash = hashContent(contentBuffer);

    const existing = await query(`SELECT id FROM blobs WHERE id = $1`, [blobHash]);
    if (existing.rows.length > 0) {
        await query(`UPDATE blobs SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1`, [blobHash]);
        return;
    }

    try {
        let embeddingStr = null;
        const embedText = text.substring(0, MAX_EMBED_CHARS);

        if (embedText.length > 20) {
            console.log(`[Embed] ${id}`);
            const vector = await getEmbedding(embedText);
            if (vector) {
                embeddingStr = `[${vector.join(',')}]`;
            }
        }

        const filePath = `datasets/${datasetSlug}/${fileName}`;
        if (embeddingStr) {
            await query(
                `INSERT INTO blobs (id, repository_id, content, size, file_name, file_path, embedding)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
                 ON CONFLICT (id) DO NOTHING`,
                [blobHash, repoId, contentBuffer, contentBuffer.length, fileName, filePath, embeddingStr]
            );
        } else {
            await query(
                `INSERT INTO blobs (id, repository_id, content, size, file_name, file_path)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO NOTHING`,
                [blobHash, repoId, contentBuffer, contentBuffer.length, fileName, filePath]
            );
        }
    } catch (e) {
        console.error(`Failed to process ${id}:`, e.message);
    }
}

async function main() {
    const opts = parseArgs();
    const { dataset, config, split, limit, concurrent } = opts;

    // Build a unique repo name from dataset + config + split
    const repoName = config !== 'default'
        ? `${dataset.split('/').pop()}-${config}-${split}`
        : `${dataset.split('/').pop()}-${split}`;

    const datasetSlug = dataset.replace('/', '_');

    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  Hugging Face Dataset Ingestion Tool             ║`);
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`  Dataset:     ${dataset}`);
    console.log(`  Config:      ${config}`);
    console.log(`  Split:       ${split}`);
    console.log(`  Limit:       ${limit.toLocaleString()}`);
    console.log(`  Concurrency: ${concurrent}`);
    console.log(`  Repo Name:   ${repoName}`);
    console.log('');

    // Select formatter
    const formatter = FORMATTERS[dataset] || genericFormatter;
    if (!FORMATTERS[dataset]) {
        console.warn(`⚠ No custom formatter for "${dataset}". Using generic key:value concatenation.`);
    }

    // Get or Create Repo
    let repoId;
    const res = await query(`SELECT id FROM repositories WHERE name = $1`, [repoName]);
    if (res.rows.length > 0) {
        repoId = res.rows[0].id;
    } else {
        const inserted = await query(
            `INSERT INTO repositories (name, description) VALUES ($1, $2) RETURNING id`,
            [repoName, `HF dataset: ${dataset} (config: ${config}, split: ${split})`]
        );
        repoId = inserted.rows[0].id;
    }

    // Auto-resume from existing row count
    let offset = 0;
    const offsetRes = await query(`SELECT count(*) as count FROM blobs WHERE repository_id = $1`, [repoId]);
    if (offsetRes.rows.length > 0) {
        offset = parseInt(offsetRes.rows[0].count, 10);
        if (offset > 0) console.log(`Resuming from database offset: ${offset}`);
    }

    let totalProcessed = 0;
    const batchSize = 100;
    const startTime = Date.now();

    while (totalProcessed < limit) {
        const fetchCount = Math.min(batchSize, limit - totalProcessed);
        console.log(`Fetching offset ${offset}, length ${fetchCount}...`);

        let rows = [];
        try {
            rows = await fetchDatasetRows(dataset, config, split, offset, fetchCount);
        } catch (e) {
            console.error(`API Error: ${e.message}. Retrying in 30s...`);
            await new Promise(r => setTimeout(r, 30000));
            try {
                rows = await fetchDatasetRows(dataset, config, split, offset, fetchCount);
            } catch (e2) {
                console.error(`Retry failed: ${e2.message}. Stopping.`);
                break;
            }
        }

        if (rows.length === 0) {
            console.log("No more rows returned by API. Dataset complete.");
            break;
        }

        // Process concurrently
        for (let i = 0; i < rows.length; i += concurrent) {
            const chunk = rows.slice(i, i + concurrent);
            const promises = chunk.map(r => processRow(r.row, repoId, datasetSlug, formatter));
            await Promise.allSettled(promises);
        }

        totalProcessed += rows.length;
        offset += rows.length;

        // Progress report every 500 rows
        if (totalProcessed % 500 < batchSize) {
            const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
            const rate = (totalProcessed / (Date.now() - startTime) * 60000).toFixed(0);
            console.log(`── Progress: ${totalProcessed.toLocaleString()} rows | ${elapsed} min | ${rate} rows/min ──`);
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✅ Import complete! Processed ${totalProcessed.toLocaleString()} rows in ${totalTime} min.`);
    await pool.end();
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
