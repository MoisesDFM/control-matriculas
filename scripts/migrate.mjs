/**
 * Aplica los archivos SQL de db/ en orden alfabetico, dentro de una
 * transaccion por archivo, y registra lo aplicado en la tabla _migraciones.
 *
 *   npm run db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL. Cree .env.local a partir de .env.example.');
  process.exit(1);
}

/**
 * Misma politica TLS que src/lib/db.ts (semantica de `sslmode` de libpq):
 * local sin TLS, DATABASE_CA_CERT para verificacion estricta, `sslmode=require`
 * cifra sin verificar el emisor (lo que aceptan Supabase y Neon), y cualquier
 * otro host remoto exige verificacion.
 */
function sslPara(url) {
  let hostname = '';
  let sslmode = null;
  try {
    const u = new URL(url);
    hostname = u.hostname;
    sslmode = u.searchParams.get('sslmode');
  } catch {
    // URL no interpretable: se asume remoto.
  }
  if (['localhost', '127.0.0.1', '::1'].includes(hostname) && sslmode !== 'require') return false;

  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (ca) {
    const pem = ca.startsWith('-----BEGIN') ? ca.split('\\n').join('\n') : readFileSync(ca, 'utf8');
    return { ca: pem, rejectUnauthorized: true };
  }
  if (sslmode === 'require' || sslmode === 'prefer') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

const dir = path.resolve('db');
const archivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

/** Ver urlSinSslmode() en src/lib/db.ts: pg eleva sslmode a verify-full. */
function urlSinSslmode(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('uselibpqcompat');
    return u.toString();
  } catch {
    return url;
  }
}

const client = new pg.Client({ connectionString: urlSinSslmode(DATABASE_URL), ssl: sslPara(DATABASE_URL) });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migraciones (
    archivo    text PRIMARY KEY,
    sha256     text NOT NULL,
    aplicada_en timestamptz NOT NULL DEFAULT now()
  )`);

for (const archivo of archivos) {
  const sql = readFileSync(path.join(dir, archivo), 'utf8');
  const sha = createHash('sha256').update(sql).digest('hex');

  const { rows } = await client.query(`SELECT sha256 FROM _migraciones WHERE archivo = $1`, [archivo]);
  if (rows.length > 0) {
    if (rows[0].sha256 !== sha) {
      console.warn(`  ~ ${archivo}: el contenido cambio desde que se aplico (revise manualmente).`);
    } else {
      console.log(`  = ${archivo} ya aplicada`);
    }
    continue;
  }

  process.stdout.write(`  + ${archivo} ... `);
  try {
    await client.query(sql);
    await client.query(`INSERT INTO _migraciones (archivo, sha256) VALUES ($1, $2)`, [archivo, sha]);
    console.log('OK');
  } catch (e) {
    console.log('FALLO');
    console.error(e.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('Migraciones al dia.');
