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

const dir = path.resolve('db');
const archivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: true } });
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
