/**
 * PostgreSQL connection + query helpers.
 *
 * This module is lazy: the pool is only created on first use, and import-time
 * errors are avoided if DATABASE_URL isn't set. That lets CLI scripts and
 * tests that only touch SQLite still run during the gradual migration.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { createSchemaPg } from "./schema.pg";
import { seedDefinitionsPg } from "./seedDefinitions.pg";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env (local) or Railway env vars (prod)."
    );
  }

  // Railway's hosted Postgres requires SSL; local dev does not.
  const needsSsl =
    process.env.NODE_ENV === "production" ||
    /railway\.app|rlwy\.net/.test(connectionString);

  _pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  _pool.on("error", (err) => {
    console.error("[pg pool] unexpected error on idle client:", err);
  });

  return _pool;
}

/** Convenience export — uses getPool() under the hood. */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

// ── Query helpers ─────────────────────────────────────────────────

export function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | undefined> {
  const res = await getPool().query<T>(text, params);
  return res.rows[0];
}

export async function queryAll<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryRun(
  text: string,
  params?: any[]
): Promise<{ rowCount: number }> {
  const res = await getPool().query(text, params);
  return { rowCount: res.rowCount ?? 0 };
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Initialization ────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;

/**
 * Create schema and seed — idempotent.
 * Safe to call many times; only the first call actually runs.
 * Call once from index.ts at server startup.
 */
export function initDb(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    console.log("[db] Initializing PostgreSQL...");
    const p = getPool();
    await createSchemaPg(p);
    await seedDefinitionsPg(p);
    console.log("[db] PostgreSQL ready.");
  })().catch((err) => {
    // Reset on failure so a retry can try again.
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

export default pool;
