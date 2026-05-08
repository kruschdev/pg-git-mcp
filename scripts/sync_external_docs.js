#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import https from 'https';

const CONFIG_PATH = path.join(process.cwd(), 'config/external_docs.json');
const CACHE_DIR = path.join(process.cwd(), 'knowledge-cache');
const MAX_CHUNK_CHARS = 25000; // Half of MAX_EMBED_CHARS to be safe

async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function chunkMarkdown(content) {
    const lines = content.split('\n');
    const chunks = [];
    let currentChunk = '';

    for (const line of lines) {
        // If we hit a header and the current chunk is getting large, split it
        if ((line.startsWith('## ') || line.startsWith('# ')) && currentChunk.length > MAX_CHUNK_CHARS) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += line + '\n';
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
    }
    return chunks;
}

async function runSyncToPg(dirPath) {
    return new Promise((resolve, reject) => {
        const syncScript = path.join(process.cwd(), 'scripts/sync_to_pg.js');
        const child = spawn('node', [syncScript, dirPath], { stdio: 'inherit' });
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`sync_to_pg.js exited with code ${code}`));
        });
    });
}

async function main() {
    console.log('Starting external documentation sync pipeline...');
    
    let configData;
    try {
        const fileContent = await fs.readFile(CONFIG_PATH, 'utf-8');
        configData = JSON.parse(fileContent);
    } catch (e) {
        console.error('Failed to read config/external_docs.json:', e.message);
        process.exit(1);
    }

    await fs.mkdir(CACHE_DIR, { recursive: true });

    for (const doc of configData) {
        console.log(`\nFetching ${doc.name} from ${doc.url}...`);
        try {
            const content = await fetchUrl(doc.url);
            console.log(`Fetched ${content.length} characters.`);
            
            const repoDir = path.join(CACHE_DIR, doc.name);
            await fs.rm(repoDir, { recursive: true, force: true });
            await fs.mkdir(repoDir, { recursive: true });

            const chunks = chunkMarkdown(content);
            console.log(`Split into ${chunks.length} chunks.`);

            for (let i = 0; i < chunks.length; i++) {
                const chunkPath = path.join(repoDir, `part${i + 1}.md`);
                await fs.writeFile(chunkPath, chunks[i], 'utf-8');
            }

            console.log(`Starting sync for ${doc.name}...`);
            await runSyncToPg(repoDir);
            console.log(`Finished processing ${doc.name}.`);
        } catch (e) {
            console.error(`Failed to process ${doc.name}:`, e.message);
        }
    }

    console.log('\nAll external docs synchronized successfully!');
}

main().catch(err => {
    console.error('Pipeline failed:', err);
    process.exit(1);
});
