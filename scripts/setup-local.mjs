/**
 * Puesta en marcha en un solo paso: prepara la base de datos, escribe
 * .env.local, aplica el esquema y crea la cuenta de administrador.
 *
 * --- Opcion A: Supabase / Neon (recomendada, no requiere PostgreSQL local) ---
 *
 *   node scripts/setup-local.mjs \
 *     --url "postgresql://postgres.xxxx:CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
 *     --email moises@nechimotos.com --nombre "Moises Fernandez" --clave "MiClave.2026"
 *
 * --- Opcion B: PostgreSQL instalado en este equipo ---
 *
 *   node scripts/setup-local.mjs --pgpass "CLAVE_DE_POSTGRES" \
 *     --email moises@nechimotos.com --nombre "Moises Fernandez" --clave "MiClave.2026"
 *
 * --clave  es la contraseña con la que usted entrara a la aplicacion web.
 * Nada de esto queda en git: solo se escribe en .env.local, que esta ignorado.
 *
 * Opcionales (solo opcion B): --usuario, --db, --host, --puerto.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

// npm puede despojar las comillas: un valor con espacios llega como varios
// argumentos sueltos, asi que se acumulan hasta el siguiente "--".
const args = {};
{
  let actual = null;
  for (const token of process.argv.slice(2)) {
    if (token.startsWith('--')) {
      actual = token.slice(2);
      args[actual] = '';
    } else if (actual) {
      args[actual] = args[actual] ? `${args[actual]} ${token}` : token;
    }
  }
}

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

const email = (args.email ?? '').trim().toLowerCase();
const nombre = (args.nombre ?? '').trim();
const clave = args.clave ?? '';

function abortar(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!email.includes('@')) abortar('Falta --email para la cuenta de administrador.');
if (nombre.length < 3) abortar('Falta --nombre para la cuenta de administrador.');
if (clave.length < 10 || !/[A-Z]/.test(clave) || !/[a-z]/.test(clave) || !/[0-9]/.test(clave)) {
  abortar('--clave debe tener minimo 10 caracteres, con mayuscula, minuscula y numero.');
}

// ---------------------------------------------------------------------------
// Resolucion de la cadena de conexion
// ---------------------------------------------------------------------------
let urlDb;
let remoto;

if (args.url) {
  let u;
  try {
    u = new URL(args.url.trim());
  } catch {
    abortar('--url no es una cadena de conexion valida. Copiela completa desde Supabase.');
  }
  if (!u.protocol.startsWith('postgres')) abortar('--url debe empezar por postgresql://');
  const passwordPlano = decodeURIComponent(u.password);
  if (passwordPlano === '' || /[[\]]|YOUR-PASSWORD/i.test(passwordPlano)) {
    abortar('La --url todavia trae el marcador de la contraseña. Reemplacelo por la clave real de la base.');
  }

  remoto = !['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  // Supabase y Neon usan su propia CA: sin sslmode el driver rechazaria el
  // certificado. `require` cifra el trafico; para verificacion estricta, ver
  // DATABASE_CA_CERT en .env.example.
  if (remoto && !u.searchParams.get('sslmode')) u.searchParams.set('sslmode', 'require');
  urlDb = u.toString();
} else {
  const pgpass = args.pgpass ?? '';
  if (!pgpass) {
    abortar('Indique --url (Supabase/Neon) o --pgpass (PostgreSQL de este equipo).');
  }
  const usuario = args.usuario ?? 'postgres';
  const host = args.host ?? 'localhost';
  const puerto = args.puerto ?? '5432';
  const db = args.db ?? 'nechimotos';
  remoto = !['localhost', '127.0.0.1', '::1'].includes(host);
  const base = `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(pgpass)}@${host}:${puerto}`;
  urlDb = `${base}/${db}`;

  // Con PostgreSQL local hay que crear la base; en Supabase/Neon ya existe.
  process.stdout.write(`1/4  Base de datos "${db}" ... `);
  const admin = new pg.Client({ connectionString: urlSinSslmode(`${base}/postgres`), ssl: remoto ? { rejectUnauthorized: false } : false });
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
    await admin.query(`CREATE DATABASE "${db.replace(/"/g, '""')}"`);
    console.log('creada');
  } else {
    console.log('ya existia');
  }
  await admin.end();
}

// ---------------------------------------------------------------------------
// Prueba de conexion (unico paso cuando la base ya existe)
// ---------------------------------------------------------------------------
process.stdout.write(`${args.url ? '1/4  Conexion' : '1b   Verificacion'} ... `);
const prueba = new pg.Client({
  connectionString: urlSinSslmode(urlDb),
  ssl: remoto ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15_000,
});
try {
  await prueba.connect();
  const { rows } = await prueba.query('SELECT current_database() AS db, version() AS v');
  console.log(`OK (${rows[0].db}, ${rows[0].v.split(' ').slice(0, 2).join(' ')})`);
  await prueba.end();
} catch (e) {
  console.log('FALLO');
  abortar(
    `No se pudo conectar a la base de datos.\n  Detalle: ${e.message}\n` +
      (args.url
        ? '  Revise que copio la cadena completa de Supabase y que reemplazo [YOUR-PASSWORD]\n' +
          '  por la contraseña real. Si el error menciona ENETUNREACH o IPv6, use la cadena\n' +
          '  del "Session pooler" en lugar de la "Direct connection".'
        : '  Revise la contraseña de --pgpass.'),
  );
}

// ---------------------------------------------------------------------------
// .env.local
// ---------------------------------------------------------------------------
process.stdout.write('2/4  .env.local ... ');
const previo = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const secretoPrevio = /^JWT_SECRET="(.+)"$/m.exec(previo)?.[1];
const jwtSecret =
  secretoPrevio && secretoPrevio.length >= 32 ? secretoPrevio : randomBytes(48).toString('base64');

writeFileSync(
  '.env.local',
  `# ============ CONFIGURACION LOCAL ============
# Generado por scripts/setup-local.mjs. Este archivo esta en .gitignore.
DATABASE_URL="${urlDb}"

# Verificacion estricta del certificado del servidor (opcional pero recomendada
# en produccion). Descargue el .crt en Supabase -> Settings -> Database ->
# SSL Configuration y ponga aqui su ruta.
# DATABASE_CA_CERT="C:/ruta/prod-ca-2021.crt"

# Secreto de firma de sesiones. En Vercel use OTRO distinto.
JWT_SECRET="${jwtSecret}"

ACCESS_TOKEN_TTL_MIN="15"
REFRESH_TOKEN_TTL_DAYS="7"
APP_ORIGIN="http://localhost:3000"
NODE_ENV="development"

# Google Sheets es opcional: sin estas variables todo funciona salvo el boton
# de sincronizacion.
GOOGLE_SHEETS_TAB="REGISTROS"
`,
  'utf8',
);
console.log(secretoPrevio ? 'actualizado (secreto conservado)' : 'escrito (secreto nuevo)');

// ---------------------------------------------------------------------------
// Esquema y cuenta de administrador
// ---------------------------------------------------------------------------
const entorno = { ...process.env, DATABASE_URL: urlDb };

console.log('3/4  Esquema y datos maestros ...');
try {
  execFileSync(process.execPath, ['scripts/migrate.mjs'], { env: entorno, stdio: 'inherit' });
} catch {
  abortar('Fallo la migracion. Revise el mensaje anterior.');
}

console.log('4/4  Cuenta de administrador ...');
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
