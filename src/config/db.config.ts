import { Pool } from 'pg';
import { envConfig } from './env.config';

const pool = new Pool({
  host: envConfig.db.host,
  port: Number(envConfig.db.port) || 5432,
  user: envConfig.db.user,
  password: envConfig.db.password,
  database: envConfig.db.name,
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
  process.exit(-1);
});

export default pool;
