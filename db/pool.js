import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;
export const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: config.db.poolSize
});

export const query = (text, params) => pool.query(text, params);
