import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import * as git from './git-engine.js';
import { pool } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? false  // Same-origin only in production
        : true   // Allow all in development
}));
app.use(express.json());

// Serve client static assets in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// ── API Routes ────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
    res.json({ ai: { embedModel: config.ai.embedModel } });
});

app.get('/api/repos', async (req, res) => {
    try {
        const repos = await git.getRepositories();
        res.json(repos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/repos', async (req, res) => {
    try {
        const { name, description } = req.body;
        const repo = await git.createRepository(name, description);
        res.json(repo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/repos/:id/tree', async (req, res) => {
    try {
        const repoId = parseInt(req.params.id, 10);
        if (isNaN(repoId)) {
            return res.status(400).json({ error: 'Invalid repository ID' });
        }

        // Get root tree for the main branch
        const rootTreeId = await git.getRepoRootTree(repoId);
        if (!rootTreeId) {
            return res.json([]);
        }

        const entries = await git.getTreeEntries(rootTreeId);
        res.json(entries || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/repos/:id/tree/:treeId', async (req, res) => {
    try {
        const entries = await git.getTreeEntries(req.params.treeId);
        res.json(entries || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/blobs/:id', async (req, res) => {
    try {
        const blob = await git.getBlob(req.params.id);
        if (!blob) {
            return res.status(404).json({ error: 'Blob not found' });
        }
        res.json({
            id: blob.id,
            size: blob.size,
            content: blob.content.toString('utf-8')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SPA fallback — serve index.html for all non-API routes
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
async function verifyDatabase() {
    try {
        await pool.query('SELECT 1');
        console.log('[pg-git] Database connection verified.');
    } catch (err) {
        console.error('[pg-git] FATAL: Cannot reach PostgreSQL:', err.message);
        process.exit(1);
    }
}

let httpServer;

async function shutdown() {
    console.log('[pg-git] Shutting down...');
    if (httpServer) httpServer.close();
    try { await pool.end(); } catch (_) { /* best-effort */ }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
    await verifyDatabase();
    httpServer = app.listen(config.server.port, () => {
        console.log(`PG-Git API running on port ${config.server.port}`);
    });
}

main();
