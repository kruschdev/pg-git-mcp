import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import * as git from './git-engine.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
    // Placeholder tree response
    res.json([
        { type: 'blob', name: 'README.md', path: 'README.md' },
        { type: 'tree', name: 'src', path: 'src' }
    ]);
});

app.listen(config.server.port, () => {
    console.log(`PG-Git API running on port ${config.server.port}`);
});
