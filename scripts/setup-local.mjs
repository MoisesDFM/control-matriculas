/**
 * Puesta en marcha local en un solo paso. Crea la base de datos, escribe
 * .env.local, aplica el esquema y crea la cuenta de administrador.
 *
 *   node scripts/setup-local.mjs --pgpass "TU_PASSWORD_DE_POSTGRES" \
 *     --email moises@nechimotos.com --nombre "Moises Fernandez" --clave "MiClave.2026"
 *
 * --pgpass  contraseña del rol de PostgreSQL de su equipo (no se guarda en el
 *           historial de git: solo se escribe en .env.local, que esta ignorado).
 * --clave   contraseña con la que usted entrara a la aplicacion web.
 *
 * Parametros opcionales: --usuario (rol de PostgreSQL, por defecto postgres),
 * --db (nombre de la base, por defecto nechimotos), --host, --puerto.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const clave = process.argv[i];
  if (clave?.startsWith('--')) args[clave.slice(2)] = process.argv[i + 1] ?? '';
}

const pgpass = args.pgpass ?? '';
const usuario = args.usuario ?? 'postgres';
const host = args.host ?? 'localhost';
const puerto = args.puerto ?? '5432';
const db = args.db ?? 'nechimotos';
const email = (args.email ?? '').trim().toLowerCase();
const nombre = (args.nombre ?? '').trim();
const clave = args.clave ?? '';

function abortar(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!pgpass) abortar('Falta --pgpass (la contraseña de su PostgreSQL local).');
if (!email.includes('@')) abortar('Falta --email para la cuenta de administrador.');
if (nombre.length < 3) abortar('Falta --nombre para la cuenta de administrador.');
if (clave.length < 10 || !/[A-Z]/.test(clave) || !/[a-z]/.test(clave) || !/[0-9]/.test(clave)) {
  abortar('--clave debe tener minimo 10 caracteres, con mayuscula, minuscula y numero.');
}

const base = `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(pgpass)}@${host}:${puerto}`;
const urlDb = `${base}/${db}`;
const local = host === 'localhost' || host === '127.0.0.1';
const ssl = local ? false : { rejectUnauthorized: true };

// ---------- 1. Base de datos ----------
process.stdout.write(`1/4  Base de datos "${db}" ... `);
const admin = new pg.Client({ connectionString: `${base}/postgres`, ssl });
try {
  await admin.connect();
} catch (e) {
  console.log('FALLO');
  abortar(
    `No se pudo conectar a PostgreSQL en ${host}:${puerto} como "${usuario}".\n` +
      `  Detalle: ${e.message}\n` +
      '  Revise que la contraseña de --pgpass sea la correcta.',
  );
}
const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
if (rows.length === 0) {
  await admin.query(`CREATE DATABASE ${JSON.stringify(db).replace(/"/g, '"')}`);
  console.log('creada');
} else {
  console.log('ya existia');
}
await admin.end();

// ---------- 2. .env.local ----------
process.stdout.write('2/4  .env.local ... ');
const previo = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const secretoPrevio = /^JWT_SECRET="(.+)"$/m.exec(previo)?.[1];
const jwtSecret =
  secretoPrevio && secretoPrevio.length >= 32 ? secretoPrevio : randomBytes(48).toString('base64');

writeFileSync(
  '.env.local',
  `# ============ DESARROLLO LOCAL ============
# Generado por scripts/setup-local.mjs. Este archivo esta en .gitignore.
DATABASE_URL="${urlDb}"

# Secreto de firma de sesiones. En Vercel use OTRO distinto.
JWT_SECRET="${jwtSecret}"

ACCESS_TOKEN_TTL_MIN="15"
REFRESH_TOKEN_TTL_DAYS="7"
APP_ORIGIN="http://localhost:3000"
NODE_ENV="development"

# Google Sheets es opcional en local: sin estas variables todo funciona
# salvo el boton de sincronizacion.
GOOGLE_SHEETS_TAB="REGISTROS"
`,
  'utf8',
);
console.log(secretoPrevio ? 'actualizado (secreto conservado)' : 'escrito (secreto nuevo)');

// ---------- 3. Esquema ----------
process.stdout.write('3/4  Esquema y datos maestros ... \n');
const entorno = { ...process.env, DATABASE_URL: urlDb };
try {
  execFileSync(process.execPath, ['scripts/migrate.mjs'], { env: entorno, stdio: 'inherit' });
} catch {
  abortar('Fallo la migracion. Revise el mensaje anterior.');
}

// ---------- 4. Administrador ----------
process.stdout.write('4/4  Cuenta de administrador ... \n');
try {
  execFileSync(
    process.execPath,
    ['scripts/create-user.mjs', '--email', email, '--nombre', nombre, '--rol', 'ADMIN', '--password', clave],
    { env: entorno, stdio: 'inherit' },
  );
} catch {
  abortar('No se pudo crear el usuario. Revise el mensaje anterior.');
}

console.log(`
========================================================
  Listo. Ahora ejecute:   npm run dev
  Entre en http://localhost:3000

  Correo : ${email}
  Clave  : la que indico en --clave
========================================================
`);
