import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env variables into process.env
dotenv.config({ path: join(__dirname, '.env') });

const configPath = join(__dirname, 'config.json');
let baseConfig = {};

try {
    if (fs.existsSync(configPath)) {
        baseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
} catch (e) {
    console.warn("Could not load config.json:", e.message);
}

function envOr(envKey, fileValue, defaultValue) {
    if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
        return process.env[envKey];
    }
    if (fileValue !== undefined) {
        return fileValue;
    }
    return defaultValue;
}

export const config = {
    ...baseConfig,
    server: {
        port: envOr('PORT', baseConfig.server?.port, 4890)
    },
    db: {
        host: envOr('DB_HOST', baseConfig.db?.host || 'localhost', 'localhost'),
        port: envOr('DB_PORT', baseConfig.db?.port || 5434, 5434),
        database: envOr('DB_NAME', baseConfig.db?.database || 'postgres', 'postgres'),
        user: envOr('DB_USER', baseConfig.db?.user || 'postgres', 'postgres'),
        password: envOr('DB_PASSWORD', baseConfig.db?.password || '', ''),
        poolSize: baseConfig.db?.poolSize || 10
    },
    ai: {
        embedModel: envOr('EMBED_MODEL', baseConfig.ai?.embedModel, 'qwen2.5-coder:1.5b'),
        ollamaUrl: envOr('OLLAMA_URL', baseConfig.ai?.ollamaUrl, 'http://localhost:11434')
    }
};

export function updateConfig(newValues) {
    if (newValues.ai) {
        baseConfig.ai = { ...baseConfig.ai, ...newValues.ai };
        config.ai.embedModel = baseConfig.ai.embedModel;
    }
    fs.writeFileSync(configPath, JSON.stringify(baseConfig, null, 2), 'utf-8');
}

export default config;
