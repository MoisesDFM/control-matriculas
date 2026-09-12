import { query, queryOne, tx } from '../db';
import { normalizarFecha, aISO } from '../domain/fechas';
import { limpiarTexto, limpiarMayusculas } from '../security/sanitize';
import { anexarFilas, escribirFila, leerFilas, reemplazarTodo, type FilaAP } from './google-sheets';

/**
 * ============== SINCRONIZACION BIDIRECCIONAL DB <-> GOOGLE SHEETS ==============
 *
 * Modelo de autoridad:
 *  - PostgreSQL es el motor de persistencia y la fuente de verdad.
 *  - La hoja de Drive es un espejo operativo editable por el control central.
 *  - Reconciliacion por CHASIS (VIN), que es la clave natural unica del vehiculo.
 *  - Resolucion de conflictos: last-write-wins comparando updated_at de la BD
 *    contra el momento del ultimo sync; si la fila de Sheets cambio y la BD no,
 *    entra el cambio de Sheets. Si ambos cambiaron, gana la BD y la diferencia
 *    queda anotada en sync_log para revision humana.
 */

export interface ResultadoSync {
  direccion: 'DB_TO_SHEETS' | 'SHEETS_TO_DB';
  leidas: number;
  creadas: number;
  actualizadas: number;
  errores: { fila?: number; chasis?: string; motivo: string }[];
  duracionMs: number;
}

interface FilaDb {
  col_a_identificacion: string;
  col_b_nombre: string;
  col_c_fecha_apertura: string;
  col_d_codigo: string;
  col_e_ciudad_correspondencia: string;
  col_f_prenda: string | null;
  col_g_marca: string;
  col_h_linea: string;
  col_i_modelo: number;
  col_j_placa: string | null;
  col_k_soat: string | null;
  col_l_fecha_matricula: string | null;
  col_m_chasis: string;
  col_n_motor: string;
  col_o_runt: string;
  col_p_observacion: string | null;
  id: string;
  sheets_row: number | null;
}

/** Proyeccion de un registro a la fila A..P del Excel. */
export function aFilaAP(r: FilaDb): FilaAP {
  return [
    r.col_a_identificacion,
    r.col_b_nombre,
    r.col_c_fecha_apertura, // YYYY/MM/DD
    r.col_d_codigo,
    r.col_e_ciudad_correspondencia,
    r.col_f_prenda ?? '',
    r.col_g_marca,
    r.col_h_linea,
    r.col_i_modelo,
    r.col_j_placa ?? '',
    r.col_k_soat ?? '', // YYYY/MM/DD
    r.col_l_fecha_matricula ?? '', // YYYY/MM/DD
    r.col_m_chasis,
    r.col_n_motor,
    r.col_o_runt, // Si / No
    r.col_p_observacion ?? '',
  ];
}

// ---------------------------------------------------------------- DB -> SHEETS
export async function sincronizarHaciaSheets(
  opciones: { completo?: boolean; usuarioId?: string | null } = {},
): Promise<ResultadoSync> {
  const t0 = Date.now();
  const errores: ResultadoSync['errores'] = [];
  let creadas = 0;
  let actualizadas = 0;

  const filas = await query<FilaDb>(
    `SELECT v.*, r.sheets_row
       FROM vw_registros v JOIN registros r ON r.id = v.id
      WHERE v.estado <> 'ANULADO'
        ${opciones.completo ? '' : 'AND (r.sheets_synced_at IS NULL OR r.updated_at > r.sheets_synced_at)'}
      ORDER BY v.col_c_fecha_apertura, v.col_m_chasis`,
  );

  if (opciones.completo) {
    await reemplazarTodo(filas.map(aFilaAP));
    await query(
      `UPDATE registros r SET sheets_synced_at = now(), sheets_row = x.fila
         FROM (SELECT id, row_number() OVER (ORDER BY fecha_apertura, chasis) + 1 AS fila
                 FROM registros WHERE estado <> 'ANULADO') x
        WHERE r.id = x.id`,
    );
    actualizadas = filas.length;
  } else {
    const nuevas: { id: string; fila: FilaAP }[] = [];
    for (const r of filas) {
      try {
        if (r.sheets_row) {
          await escribirFila(r.sheets_row, aFilaAP(r));
          await query(`UPDATE registros SET sheets_synced_at = now() WHERE id = $1`, [r.id]);
          actualizadas++;
        } else {
          nuevas.push({ id: r.id, fila: aFilaAP(r) });
        }
      } catch (e) {
        errores.push({ chasis: r.col_m_chasis, motivo: mensaje(e) });
      }
    }
    if (nuevas.length) {
      const primera = await anexarFilas(nuevas.map((n) => n.fila));
      if (primera !== null) {
        await Promise.all(
          nuevas.map((n, i) =>
            query(`UPDATE registros SET sheets_row = $1, sheets_synced_at = now() WHERE id = $2`, [primera + i, n.id]),
          ),
        );
      }
      creadas = nuevas.length;
    }
  }

  const r: ResultadoSync = {
    direccion: 'DB_TO_SHEETS',
    leidas: filas.length,
    creadas,
    actualizadas,
    errores,
    duracionMs: Date.now() - t0,
  };
  await registrarSync(r, opciones.usuarioId ?? null);
  return r;
}

// ---------------------------------------------------------------- SHEETS -> DB
export async function sincronizarDesdeSheets(usuarioId: string | null = null): Promise<ResultadoSync> {
  const t0 = Date.now();
  const errores: ResultadoSync['errores'] = [];
  let creadas = 0;
  let actualizadas = 0;

  const filas = await leerFilas();

  // Catalogos en memoria: evita N consultas por fila.
  const pdvs = new Map(
    (await query<{ id: number; ciudad_correspondencia: string }>(
      `SELECT id, ciudad_correspondencia FROM puntos_venta WHERE activo`,
    )).map((p) => [p.ciudad_correspondencia, p.id]),
  );
  const codigos = new Set((await query<{ codigo: string }>(`SELECT codigo FROM codigos`)).map((c) => c.codigo));

  for (const { fila, valores } of filas) {
    try {
      const d = interpretarFila(valores);
      if (!d) {
        errores.push({ fila, motivo: 'Fila incompleta: se requieren identificacion, chasis y ciudad.' });
        continue;
      }

      if (!d.fechaApertura) {
        errores.push({ fila, chasis: d.chasis, motivo: 'FECHA DE APERTURA ilegible. Use el formato YYYY/MM/DD.' });
        continue;
      }
      if (!d.modelo) {
        errores.push({ fila, chasis: d.chasis, motivo: 'MODELO ausente o no numerico.' });
        continue;
      }

      const puntoVentaId = pdvs.get(d.ciudad);
      if (!puntoVentaId) {
        errores.push({ fila, motivo: `Ciudad de correspondencia desconocida: "${d.ciudad}".` });
        continue;
      }
      if (!codigos.has(d.codigo)) {
        errores.push({ fila, motivo: `Codigo no registrado en el catalogo: "${d.codigo}".` });
        continue;
      }

      const existente = await queryOne<{ id: string; updated_at: Date; sheets_synced_at: Date | null }>(
        `SELECT id, updated_at, sheets_synced_at FROM registros WHERE chasis = $1`,
        [d.chasis],
      );

      if (!existente) {
        await tx(async (c) => {
          await c.query(
            `INSERT INTO registros (
               numero_identificacion, nombre_completo, fecha_apertura, codigo, punto_venta_id,
               prenda, marca, linea, modelo, placa, soat_fecha_expedicion,
               fecha_matricula_emision, chasis, motor, runt, observacion,
               transito_id, tramitador_id, origen, sheets_row, sheets_synced_at
             ) VALUES (
               $1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date,$13,$14,$15::respuesta_runt,$16,
               (SELECT transito_id FROM puntos_venta WHERE id = $5),
               (SELECT tramitador_id FROM puntos_venta WHERE id = $5),
               'SHEETS', $17, now())`,
            [
              d.identificacion, d.nombre, aISO(d.fechaApertura), d.codigo, puntoVentaId,
              d.prenda, d.marca, d.linea, d.modelo, d.placa, aISO(d.soat),
              aISO(d.fechaMatricula), d.chasis, d.motor, d.runt, d.observacion, fila,
            ],
          );
        });
        creadas++;
        continue;
      }

      // Si la BD cambio despues del ultimo espejo, la BD manda: no se pisa.
      const bdMasNueva =
        existente.sheets_synced_at !== null && existente.updated_at > existente.sheets_synced_at;
      if (bdMasNueva) {
        errores.push({
          fila,
          chasis: d.chasis,
          motivo: 'Conflicto: el registro cambio en la aplicacion despues del ultimo espejo. Prevalece la base de datos.',
        });
        continue;
      }

      await query(
        `UPDATE registros SET
            numero_identificacion = $1, nombre_completo = $2, fecha_apertura = $3::date,
            codigo = $4, punto_venta_id = $5, prenda = $6, marca = $7, linea = $8, modelo = $9,
            placa = $10, soat_fecha_expedicion = $11::date, fecha_matricula_emision = $12::date,
            motor = $13, runt = $14::respuesta_runt, observacion = $15,
            origen = 'SHEETS', sheets_row = $16, sheets_synced_at = now()
          WHERE id = $17`,
        [
          d.identificacion, d.nombre, aISO(d.fechaApertura), d.codigo, puntoVentaId,
          d.prenda, d.marca, d.linea, d.modelo, d.placa, aISO(d.soat), aISO(d.fechaMatricula),
          d.motor, d.runt, d.observacion, fila, existente.id,
        ],
      );
      actualizadas++;
    } catch (e) {
      errores.push({ fila, motivo: mensaje(e) });
    }
  }

  const r: ResultadoSync = {
    direccion: 'SHEETS_TO_DB',
    leidas: filas.length,
    creadas,
    actualizadas,
    errores,
    duracionMs: Date.now() - t0,
  };
  await registrarSync(r, usuarioId);
  return r;
}

/** Interpreta y sanea una fila posicional A..P venida de la hoja. */
function interpretarFila(v: FilaAP) {
  const txt = (i: number, max = 200) => limpiarTexto(v[i] === null || v[i] === undefined ? '' : String(v[i]), max);
  const may = (i: number, max = 60) => limpiarMayusculas(v[i] === null || v[i] === undefined ? '' : String(v[i]), max);

  const identificacion = may(0, 20);
  const chasis = may(12, 25);
  const ciudad = may(4, 60);
  if (!identificacion || !chasis || !ciudad) return null;

  const runtCrudo = may(14, 5);

  return {
    identificacion,
    nombre: txt(1, 160),
    fechaApertura: normalizarFecha(v[2] ?? null) ?? null,
    codigo: may(3, 30),
    ciudad,
    prenda: txt(5, 80) || null,
    marca: may(6, 40),
    linea: may(7, 60),
    modelo: Number(String(v[8] ?? '').replace(/\D/g, '')) || null,
    placa: may(9, 6) || null,
    soat: normalizarFecha(v[10] ?? null),
    fechaMatricula: normalizarFecha(v[11] ?? null),
    chasis,
    motor: may(13, 25),
    runt: runtCrudo === 'SI' || runtCrudo === 'SÍ' || runtCrudo === 'S' || runtCrudo === 'TRUE' ? 'SI' : 'NO',
    observacion: txt(15, 500) || null,
  };
}

async function registrarSync(r: ResultadoSync, usuarioId: string | null): Promise<void> {
  await query(
    `INSERT INTO sync_log (direccion, filas_leidas, filas_creadas, filas_actualizadas,
                           filas_con_error, detalle, ejecutado_por, duracion_ms)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [
      r.direccion,
      r.leidas,
      r.creadas,
      r.actualizadas,
      r.errores.length,
      JSON.stringify(r.errores.slice(0, 200)),
      usuarioId,
      r.duracionMs,
    ],
  );
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : 'Error desconocido');
