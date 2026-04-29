import pg from 'pg';

const { Client } = pg;
async function main() {
    const client = new Client({
        host: '10.0.0.85',
        port: 5434,
        database: 'postgres',
        user: 'openclaw',
        password: 'openclaw_password'
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
