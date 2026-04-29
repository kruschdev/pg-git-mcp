import fs from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    try {
        console.log('Connecting to PostgreSQL database...');
        const schemaPath = join(__dirname, 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');
        console.log('Executing schema.sql...');
        await pool.query(schema);
        console.log('Migration successful.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

main();
