import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env, isProd } from './env';

/**
 * Pool unico reutilizado entre invocaciones (en serverless el modulo se cachea).
 * max bajo a proposito: el plan gratuito de Supabase/Neon limita conexiones.
 * Usar el pooler (puerto 6543 en Supabase / endpoint -pooler en Neon).
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/**
 * SSL obligatorio y con verificacion de certificado contra cualquier host
 * remoto. Solo se desactiva para PostgreSQL en la propia maquina (desarrollo),
 * donde no hay red que interceptar y el servidor local no suele tener TLS.
 */
export function sslPara(url: string): { rejectUnauthorized: boolean } | false {
  try {
    const { hostname, searchParams } = new URL(url);
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (local && searchParams.get('sslmode') !== 'require') return false;
  } catch {
    // Si no se puede interpretar, se asume remoto y se exige SSL.
  }
  return { rejectUnauthorized: true };
}

export const pool =
  globalThis.__pgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
    ssl: sslPara(env.DATABASE_URL),
  });

if (!isProd) globalThis.__pgPool = pool;

/**
 * Ejecuta SQL SIEMPRE parametrizado. No existe en el proyecto ninguna funcion
 * que concatene valores del usuario en la sentencia: asi se elimina por
 * construccion la superficie de SQL Injection.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as unknown[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Transaccion con rollback automatico ante cualquier excepcion. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Codigos de error PostgreSQL que traducimos a mensajes de negocio. */
export function pgError(e: unknown): { code?: string; message: string; constraint?: string } {
  const err = e as { code?: string; message?: string; constraint?: string };
  return { code: err.code, message: err.message ?? 'Error de base de datos', constraint: err.constraint };
}
