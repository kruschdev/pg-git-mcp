import pg from 'pg';
import { config } from '../config.js';

const { Client } = pg;
async function main() {
    const client = new Client({
        host: config.db.host,
        port: config.db.port,
        database: 'postgres', // Connect to default DB to create the new one
        user: config.db.user,
        password: config.db.password
    });
    try {
        await client.connect();
        await client.query(`CREATE DATABASE ${config.db.database}`);
        console.log(`Database ${config.db.database} created successfully.`);
    } catch(err) {
        if(err.code === '42P04') {
            console.log("Database pg_git already exists.");
        } else {
            console.error("Failed to create DB:", err);
        }
    } finally {
        await client.end();
    }
}
main();
