import { config } from '../config.js';
import pg from 'pg';

const { Client } = pg;
async function main() {
    const client = new Client({
        host: config.db.host,
        port: config.db.port,
        database: 'postgres',
        user: config.db.user,
        password: config.db.password
    });
    try {
        await client.connect();
        const res = await client.query('SELECT datname FROM pg_database');
        console.log(res.rows);
    } catch(err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
main();
