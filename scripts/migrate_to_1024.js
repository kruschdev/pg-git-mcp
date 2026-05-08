import { pool } from '../db/pool.js';

async function migrate() {
    console.log('Connecting to database...');
    const client = await pool.connect();
    try {
        console.log('Starting migration to 1024 dimensions...');

        console.log('1. Dropping blobs_embedding_idx...');
        await client.query('DROP INDEX IF EXISTS blobs_embedding_idx');

        console.log('3. Dropping and recreating vector columns to vector(1024)...');
        await client.query('ALTER TABLE blobs DROP COLUMN IF EXISTS embedding');
        await client.query('ALTER TABLE blobs ADD COLUMN embedding vector(1024)');
        
        try {
            await client.query('ALTER TABLE ide_agent_memory DROP COLUMN IF EXISTS embedding');
            await client.query('ALTER TABLE ide_agent_memory ADD COLUMN embedding vector(1024)');
        } catch (e) {
            console.log('Notice: ide_agent_memory alter failed:', e.message);
        }
        
        try {
            await client.query('ALTER TABLE ide_agent_nuggets DROP COLUMN IF EXISTS embedding');
            await client.query('ALTER TABLE ide_agent_nuggets ADD COLUMN embedding vector(1024)');
        } catch (e) {
            console.log('Notice: ide_agent_nuggets alter failed:', e.message);
        }

        console.log('4. Recreating blobs_embedding_idx...');
        await client.query('CREATE INDEX blobs_embedding_idx ON blobs USING hnsw (embedding vector_cosine_ops)');

        console.log('✅ Migration to 1024 dimensions completed successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
