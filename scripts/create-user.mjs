/**
 * Crea usuarios. Es la UNICA via para dar de alta una cuenta: no existe
 * autoregistro en la aplicacion (requisito zero-trust).
 *
 *   node --env-file=.env.local scripts/create-user.mjs \
 *     --email paula@nechimotos.com --nombre "Paula Gomez" --rol ADMIN --password "Clave.Segura.2026"
 *
 *   node --env-file=.env.local scripts/create-user.mjs \
 *     --email asesor.nechi@nechimotos.com --nombre "Asesor Nechi" --rol ASESOR --pdv "NECHI" --password "..."
 *
 * Si se omite --password se genera una aleatoria y se imprime una sola vez.
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] ?? '']);
    return acc;
  }, []),
);

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}

const email = String(args.email ?? '').trim().toLowerCase();
const nombre = String(args.nombre ?? '').trim();
const rol = String(args.rol ?? '').trim().toUpperCase();
const pdv = args.pdv ? String(args.pdv).trim().toUpperCase() : null;
const password = args.password ? String(args.password) : randomBytes(12).toString('base64url');

if (!email.includes('@') || nombre.length < 3 || !['ADMIN', 'ASESOR'].includes(rol)) {
  console.error('Uso: --email <correo> --nombre <nombre> --rol ADMIN|ASESOR [--pdv "CIUDAD"] [--password <clave>]');
  process.exit(1);
}
if (rol === 'ASESOR' && !pdv) {
  console.error('Un ASESOR requiere --pdv con la CIUDAD CORRESPONDENCIA exacta.');
  process.exit(1);
}
if (password.length < 10) {
  console.error('La contraseña debe tener al menos 10 caracteres.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: true } });
await client.connect();

let puntoVentaId = null;
if (pdv) {
  const { rows } = await client.query(`SELECT id FROM puntos_venta WHERE ciudad_correspondencia = $1`, [pdv]);
  if (rows.length === 0) {
    console.error(`No existe el punto de venta "${pdv}". Ejecute db:migrate primero.`);
    await client.end();
    process.exit(1);
  }
  puntoVentaId = rows[0].id;
}

const hash = await bcrypt.hash(password, 12);

try {
  const { rows } = await client.query(
    `INSERT INTO usuarios (email, password_hash, nombre, rol, punto_venta_id)
     VALUES ($1, $2, $3, $4::rol_usuario, $5)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           nombre = EXCLUDED.nombre,
           rol = EXCLUDED.rol,
           punto_venta_id = EXCLUDED.punto_venta_id,
           activo = true,
           intentos_fallidos = 0,
           bloqueado_hasta = NULL,
           password_changed_at = now()
     RETURNING id`,
    [email, hash, nombre, rol, puntoVentaId],
  );

  console.log('\nUsuario listo');
  console.log('  id       :', rows[0].id);
  console.log('  correo   :', email);
  console.log('  rol      :', rol, puntoVentaId ? `(PDV ${pdv})` : '(acceso global)');
  if (!args.password) console.log('  password :', password, '  <-- se muestra una sola vez');
  console.log('');
} catch (e) {
  console.error('Error:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
