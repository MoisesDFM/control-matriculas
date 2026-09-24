/**
 * Datos de prueba FICTICIOS para poder revisar la interfaz con contenido real.
 *
 *   npm run seed:demo              # crea usuarios, registros y solicitudes RUNT
 *   npm run seed:demo -- --limpiar # borra todo lo de prueba y nada mas
 *
 * Todo lo generado es reconocible y reversible: los chasis empiezan por DEMO y
 * los correos terminan en @example.com. No se toca ningun dato real.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {
  NOMBRES, VEHICULOS, PRENDAS, OBSERVACIONES, USUARIOS_DEMO, PASSWORD_DEMO,
  REPARTO, CODIGOS, aleatorio, elegir, placaFicticia, cedulaFicticia,
  chasisFicticio, motorFicticio, haceDias,
} from './demo-data.mjs';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL. Ejecute primero npm run setup:local.');
  process.exit(1);
}

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

const limpiar = process.argv.includes('--limpiar');

try {
  if (limpiar) {
    await limpiarDemo(client);
  } else {
    await sembrar(client);
  }
} catch (e) {
  console.error('\n  Error:', e.message, '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}

// ---------------------------------------------------------------------------
async function limpiarDemo(c) {
  const r1 = await c.query(`DELETE FROM solicitudes_runt WHERE correo LIKE '%@example.com'`);
  const r2 = await c.query(`DELETE FROM registros WHERE chasis LIKE 'DEMO%'`);
  const r3 = await c.query(`DELETE FROM usuarios WHERE email LIKE '%@example.com'`);
  console.log(`
  Datos de prueba eliminados
    solicitudes RUNT : ${r1.rowCount}
    registros        : ${r2.rowCount}
    usuarios         : ${r3.rowCount}
`);
}

async function sembrar(c) {
  const { rows: pdvs } = await c.query(
    `SELECT id, ciudad_correspondencia, permite_preasignacion FROM puntos_venta WHERE activo ORDER BY id`,
  );
  if (pdvs.length === 0) throw new Error('No hay puntos de venta. Ejecute npm run db:migrate primero.');

  const asesores = await crearAsesores(c, pdvs);
  const registros = await crearRegistros(c, pdvs, asesores);
  const solicitudes = await crearSolicitudes(c, pdvs, asesores);

  console.log(`
  ============================================================
  Datos de prueba listos
    usuarios asesores    : ${asesores.length}
    registros            : ${registros}
    solicitudes RUNT     : ${solicitudes}

  Ingreso de los asesores de prueba:
${USUARIOS_DEMO.map((u) => `    ${u.email.padEnd(32)} (${u.pdv})`).join('\n')}
    contraseña para los tres : ${PASSWORD_DEMO}

  Para revertir:  npm run seed:demo -- --limpiar
  ============================================================
`);
}

async function crearAsesores(c, pdvs) {
  const hash = await bcrypt.hash(PASSWORD_DEMO, 12);
  const creados = [];

  for (const u of USUARIOS_DEMO) {
    const pdv = pdvs.find((p) => p.ciudad_correspondencia === u.pdv);
    if (!pdv) continue;
    const { rows } = await c.query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, punto_venta_id)
       VALUES ($1, $2, $3, 'ASESOR', $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, activo = true
       RETURNING id`,
      [u.email, hash, u.nombre, pdv.id],
    );
    creados.push({ id: rows[0].id, puntoVentaId: pdv.id });
  }
  return creados;
}

async function crearRegistros(c, pdvs, asesores) {
  const rnd = aleatorio(20260924);
  let n = 0;
  let i = 0;

  // Dos pasadas del reparto para tener volumen suficiente en el tablero.
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    for (const [estado, runt, dias, conSoat, conPlaca] of REPARTO) {
      i++;
      const pdv = pdvs[i % pdvs.length];
      const vehiculo = elegir(rnd, VEHICULOS);
      const autor = asesores[i % Math.max(asesores.length, 1)]?.id ?? null;
      const preasignada = conPlaca && pdv.permite_preasignacion && estado === 'EN_TRANSITO' && i % 5 === 0;
      const matriculado = estado === 'MATRICULADO' || estado === 'ENTREGADO';

      await c.query(
        `INSERT INTO registros (
           numero_identificacion, nombre_completo, fecha_apertura, codigo, punto_venta_id,
           prenda, marca, linea, modelo, placa, placa_preasignada,
           soat_fecha_expedicion, fecha_matricula_emision, chasis, motor, runt, observacion,
           transito_id, tramitador_id, estado, creado_por, actualizado_por,
           en_transito_en, matriculado_en, entregado_en
         ) VALUES (
           $1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,$14,$15,$16::respuesta_runt,$17,
           (SELECT transito_id FROM puntos_venta WHERE id = $5),
           (SELECT tramitador_id FROM puntos_venta WHERE id = $5),
           $18::estado_registro, $19, $19,
           $20::timestamptz, $21::timestamptz, $22::timestamptz
         ) ON CONFLICT (chasis) DO NOTHING`,
        [
          cedulaFicticia(rnd, i),
          elegir(rnd, NOMBRES),
          haceDias(dias),
          elegir(rnd, CODIGOS),
          pdv.id,
          elegir(rnd, PRENDAS),
          vehiculo.marca,
          vehiculo.linea,
          elegir(rnd, vehiculo.modelos),
          conPlaca ? placaFicticia(rnd) : null,
          preasignada,
          conSoat ? haceDias(dias - 1) : null,
          matriculado ? haceDias(Math.max(1, Math.floor(dias / 2))) : null,
          chasisFicticio(i),
          motorFicticio(rnd, i),
          runt,
          elegir(rnd, OBSERVACIONES),
          matriculado && preasignada ? 'EN_TRANSITO' : estado,
          autor,
          estado === 'REGISTRADO' || estado === 'DOC_COMPLETA' ? null : new Date(Date.now() - dias * 43_200_000),
          matriculado ? new Date(Date.now() - dias * 21_600_000) : null,
          estado === 'ENTREGADO' ? new Date(Date.now() - dias * 10_800_000) : null,
        ],
      );
      n++;
    }
  }
  return n;
}

async function crearSolicitudes(c, pdvs, asesores) {
  if (asesores.length === 0) return 0;
  const rnd = aleatorio(777);
  let n = 0;

  // Solicitudes pendientes sobre registros que estan bloqueados por RUNT.
  const { rows } = await c.query(
    `SELECT r.id, r.numero_identificacion, r.nombre_completo, r.punto_venta_id
       FROM registros r
      WHERE r.chasis LIKE 'DEMO%' AND r.runt = 'NO'
      ORDER BY r.created_at
      LIMIT 5`,
  );

  for (const r of rows) {
    const autor = asesores.find((a) => a.puntoVentaId === r.punto_venta_id) ?? asesores[0];
    await c.query(
      `INSERT INTO solicitudes_runt (
         registro_id, punto_venta_id, numero_identificacion, nombre_completo,
         direccion_barrio, telefono, correo, cedula_url, solicitado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        r.id,
        r.punto_venta_id,
        r.numero_identificacion,
        r.nombre_completo,
        `Calle ${10 + Math.floor(rnd() * 80)} # ${Math.floor(rnd() * 40)}-${Math.floor(rnd() * 90)}, Barrio El Prado`,
        `3${Math.floor(rnd() * 100000000).toString().padStart(9, '0')}`,
        `cliente${n + 1}@example.com`,
        `https://example.com/demo/cedula-${n + 1}.jpg`,
        autor.id,
      ],
    );
    n++;
  }
  return n;
}
