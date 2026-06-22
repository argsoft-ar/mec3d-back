"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const env_config_1 = require("./env.config");
const pool = new pg_1.Pool({
    host: env_config_1.envConfig.db.host,
    port: Number(env_config_1.envConfig.db.port) || 5432,
    user: env_config_1.envConfig.db.user,
    password: env_config_1.envConfig.db.password,
    database: env_config_1.envConfig.db.name,
});
pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
    process.exit(-1);
});
exports.default = pool;
