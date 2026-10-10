import { PoolClient } from "pg";
import pool from "../config/db.config";

// Ejecutor de queries: el pool (autocommit) o un cliente dentro de una transacción.
export type Db = Pick<PoolClient, "query">;

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
