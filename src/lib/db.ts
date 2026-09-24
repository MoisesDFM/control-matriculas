import { readFileSync } from 'node:fs';
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
 * Politica TLS, con la misma semantica que `sslmode` de libpq:
 *
 *  - Host local sin `sslmode=require`  -> sin TLS (no hay red que interceptar).
 *  - DATABASE_CA_CERT definido         -> TLS con verificacion contra esa CA.
 *    Es el modo mas fuerte y el recomendado en produccion. Supabase publica su
 *    certificado en Settings -> Database -> SSL Configuration.
 *  - `sslmode=require`                 -> TLS cifrado SIN verificar el emisor.
 *    Protege el trafico de escucha pasiva, pero no de un intermediario activo.
 *    Es lo que aceptan por defecto Supabase y Neon, cuyas CA no estan en el
 *    almacen de confianza de Node.
 *  - Cualquier otro host remoto        -> TLS con verificacion estricta.
 */
export function sslPara(url: string): { rejectUnauthorized: boolean; ca?: string } | false {
  let hostname = '';
  let sslmode: string | null = null;
  try {
    const u = new URL(url);
    hostname = u.hostname;
    sslmode = u.searchParams.get('sslmode');
  } catch {
    // URL no interpretable: se asume remoto y se exige TLS.
  }

  if ((hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') && sslmode !== 'require') {
    return false;
  }

  const ca = caDeEntorno();
  if (ca) return { ca, rejectUnauthorized: true };

  if (sslmode === 'require' || sslmode === 'prefer') return { rejectUnauthorized: false };

  return { rejectUnauthorized: true };
}

/** DATABASE_CA_CERT admite la ruta a un .crt o el PEM completo en linea. */
function caDeEntorno(): string | undefined {
  const valor = process.env.DATABASE_CA_CERT?.trim();
  if (!valor) return undefined;
  if (valor.startsWith('-----BEGIN')) return valor.replace(/\\n/g, '\n');
  try {
    return readFileSync(valor, 'utf8');
  } catch {
    throw new Error(`DATABASE_CA_CERT apunta a un archivo que no se puede leer: ${valor}`);
  }
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
