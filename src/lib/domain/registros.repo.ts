import { query, queryOne, tx } from '../db';
import { alcance, pdvParaEscritura } from '../api/rbac';
import { ErrorDominio } from '../api/respuestas';
import type { Sesion } from '../auth/session';
import type { Filtros, RegistroCrear } from './schemas';
import { aISO } from './fechas';
import { puedeTransicionar, type Estado, type Semaforo } from './estados';

/** Fila tal como la consume la UI: todas las fechas en YYYY/MM/DD. */
export interface RegistroVista {
  id: string;
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
  col_o_runt: 'Si' | 'No';
  col_p_observacion: string | null;
  punto_venta_id: number;
  estado: Estado;
  runt: 'SI' | 'NO';
  placa_preasignada: boolean;
  transito_id: number;
  tramitador_id: number;
  transito: string;
  tramitador: string;
  bloqueado_runt: boolean;
  dias_desde_apertura: number;
  dias_en_transito: number | null;
  semaforo: Semaforo;
  row_version: number;
}

const COLUMNAS_ORDEN: Record<Filtros['orden'], string> = {
  fecha_apertura: 'r.col_c_fecha_apertura',
  updated_at: 'r.updated_at',
  nombre_completo: 'r.col_b_nombre',
};

/**
 * Listado paginado. El filtro por punto de venta se inyecta SIEMPRE desde la
 * sesion (ver alcance()); un asesor no puede ampliarlo por querystring.
 */
export async function listarRegistros(
  sesion: Sesion,
  f: Filtros,
): Promise<{ filas: RegistroVista[]; total: number }> {
  const al = alcance(sesion, 'r');
  const params: unknown[] = [...al.params];
  const cond: string[] = [al.where];

  const push = (valor: unknown): string => {
    params.push(valor);
    return `$${params.length}`;
  };

  if (f.q) {
    const p = push(`%${f.q}%`);
    cond.push(
      `(r.col_b_nombre ILIKE ${p} OR r.col_a_identificacion ILIKE ${p} OR r.col_j_placa ILIKE ${p} OR r.col_m_chasis ILIKE ${p})`,
    );
  }
  if (f.estado) cond.push(`r.estado = ${push(f.estado)}::estado_registro`);
  if (f.runt) cond.push(`r.runt = ${push(f.runt)}::respuesta_runt`);
  if (f.soloBloqueados) cond.push(`r.bloqueado_runt`);
  // Solo el ADMIN puede acotar a otro PDV; para el asesor ya esta fijado arriba.
  if (f.puntoVentaId && sesion.rol === 'ADMIN') cond.push(`r.punto_venta_id = ${push(f.puntoVentaId)}`);
  if (f.tramitadorId) cond.push(`r.tramitador_id = ${push(f.tramitadorId)}`);
  if (f.transitoId) cond.push(`r.transito_id = ${push(f.transitoId)}`);
  if (f.desde) cond.push(`r.col_c_fecha_apertura >= ${push(f.desde)}`);
  if (f.hasta) cond.push(`r.col_c_fecha_apertura <= ${push(f.hasta)}`);

  const where = cond.join(' AND ');
  const orden = `${COLUMNAS_ORDEN[f.orden]} ${f.dir === 'asc' ? 'ASC' : 'DESC'}`;
  const limite = push(f.porPagina);
  const offset = push((f.pagina - 1) * f.porPagina);

  const [filas, conteo] = await Promise.all([
    query<RegistroVista>(
      `SELECT * FROM vw_registros r WHERE ${where} ORDER BY ${orden}, r.id LIMIT ${limite} OFFSET ${offset}`,
      params,
    ),
    queryOne<{ total: string }>(
      `SELECT count(*)::text AS total FROM vw_registros r WHERE ${where}`,
      params.slice(0, params.length - 2),
    ),
  ]);

  return { filas, total: Number(conteo?.total ?? 0) };
}

export async function obtenerRegistro(sesion: Sesion, id: string): Promise<RegistroVista> {
  const al = alcance(sesion, 'r');
  const fila = await queryOne<RegistroVista>(
    `SELECT * FROM vw_registros r WHERE ${al.where} AND r.id = $${al.siguiente}`,
    [...al.params, id],
  );
  // Fuera de alcance y no existente devuelven lo mismo: no se filtra la
  // existencia de datos de otras sedes.
  if (!fila) throw new ErrorDominio('NO_ENCONTRADO', 'Registro no encontrado.');
  return fila;
}

export async function crearRegistro(sesion: Sesion, d: RegistroCrear): Promise<string> {
  const puntoVentaId = pdvParaEscritura(sesion, d.puntoVentaId);

  // El RUNT nunca se auto-otorga: solo el ADMIN puede sentar 'SI'.
  const runt = sesion.rol === 'ADMIN' ? d.runt : 'NO';

  const fila = await queryOne<{ id: string }>(
    `INSERT INTO registros (
        numero_identificacion, nombre_completo, fecha_apertura, codigo, punto_venta_id,
        prenda, marca, linea, modelo, placa, placa_preasignada,
        soat_fecha_expedicion, fecha_matricula_emision, chasis, motor, runt, observacion,
        transito_id, tramitador_id, creado_por, actualizado_por, origen
     ) VALUES (
        $1, $2, $3::date, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12::date, $13::date, $14, $15, $16::respuesta_runt, $17,
        -- placeholders: el trigger fn_registro_normaliza los sobreescribe con
        -- el mapeo real del punto de venta.
        (SELECT transito_id FROM puntos_venta WHERE id = $5),
        (SELECT tramitador_id FROM puntos_venta WHERE id = $5),
        $18, $18, 'APP'
     ) RETURNING id`,
    [
      d.numeroIdentificacion,
      d.nombreCompleto,
      aISO(d.fechaApertura),
      d.codigo,
      puntoVentaId,
      d.prenda || null,
      d.marca,
      d.linea,
      d.modelo,
      d.placa,
      d.placaPreasignada,
      aISO(d.soatFechaExpedicion ?? null),
      aISO(d.fechaMatriculaEmision ?? null),
      d.chasis,
      d.motor,
      runt,
      d.observacion || null,
      sesion.usuarioId,
    ],
  );
  if (!fila) throw new ErrorDominio('ERROR_INTERNO', 'No se pudo crear el registro.');
  return fila.id;
}

/**
 * Cambio de estado. Triple validacion: predicado de dominio (aqui), trigger
 * de flujo y CHECK de la tabla. El bloqueo por RUNT se evalua en las tres.
 */
export async function cambiarEstado(
  sesion: Sesion,
  id: string,
  destino: Estado,
  rowVersion: number,
  nota: string,
): Promise<RegistroVista> {
  const actual = await obtenerRegistro(sesion, id);

  if (actual.row_version !== rowVersion) {
    throw new ErrorDominio('CONFLICTO', 'Otro usuario modifico este registro. Recargue la informacion.');
  }

  const veredicto = puedeTransicionar({
    actual: actual.estado,
    destino,
    runt: actual.runt,
    rol: sesion.rol,
    placa: actual.col_j_placa,
    placaPreasignada: actual.placa_preasignada,
    fechaMatricula: actual.col_l_fecha_matricula,
  });

  if (!veredicto.permitido) {
    throw new ErrorDominio(
      veredicto.codigo === 'RUNT_BLOQUEADO'
        ? 'RUNT_BLOQUEADO'
        : veredicto.codigo === 'SIN_PERMISO'
          ? 'SIN_PERMISO'
          : veredicto.codigo === 'DATOS_FALTANTES'
            ? 'VALIDACION'
            : 'TRANSICION_INVALIDA',
      veredicto.motivo ?? 'Transicion no permitida.',
    );
  }

  return tx(async (c) => {
    const res = await c.query(
      `UPDATE registros
          SET estado = $1::estado_registro, actualizado_por = $2
        WHERE id = $3 AND row_version = $4`,
      [destino, sesion.usuarioId, id, rowVersion],
    );
    if (res.rowCount === 0) {
      throw new ErrorDominio('CONFLICTO', 'El registro cambio mientras se guardaba. Recargue.');
    }
    if (nota) {
      await c.query(
        `UPDATE registro_historial SET nota = $1
          WHERE id = (SELECT max(id) FROM registro_historial WHERE registro_id = $2)`,
        [nota, id],
      );
    }
    const { rows } = await c.query<RegistroVista>(`SELECT * FROM vw_registros WHERE id = $1`, [id]);
    return rows[0]!;
  });
}

/** Actualiza fechas de SOAT / matricula y placa (gestion del control central). */
export async function actualizarRegistro(
  sesion: Sesion,
  id: string,
  d: Partial<RegistroCrear> & { rowVersion: number },
): Promise<RegistroVista> {
  const actual = await obtenerRegistro(sesion, id);
  if (actual.row_version !== d.rowVersion) {
    throw new ErrorDominio('CONFLICTO', 'Otro usuario modifico este registro. Recargue la informacion.');
  }

  // Campos que el asesor NO puede tocar: son del control central.
  const soloAdmin = ['placa', 'placaPreasignada', 'soatFechaExpedicion', 'fechaMatriculaEmision', 'runt'] as const;
  if (sesion.rol !== 'ADMIN' && soloAdmin.some((k) => d[k] !== undefined)) {
    throw new ErrorDominio(
      'SIN_PERMISO',
      'Placa, fechas de SOAT/matricula y RUNT los gestiona unicamente el control central.',
    );
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, valor: unknown, cast = '') => {
    params.push(valor);
    sets.push(`${col} = $${params.length}${cast}`);
  };

  if (d.nombreCompleto !== undefined) set('nombre_completo', d.nombreCompleto);
  if (d.prenda !== undefined) set('prenda', d.prenda || null);
  if (d.marca !== undefined) set('marca', d.marca);
  if (d.linea !== undefined) set('linea', d.linea);
  if (d.modelo !== undefined) set('modelo', d.modelo);
  if (d.observacion !== undefined) set('observacion', d.observacion || null);
  if (d.placa !== undefined) set('placa', d.placa);
  if (d.placaPreasignada !== undefined) set('placa_preasignada', d.placaPreasignada);
  if (d.soatFechaExpedicion !== undefined) set('soat_fecha_expedicion', aISO(d.soatFechaExpedicion), '::date');
  if (d.fechaMatriculaEmision !== undefined) set('fecha_matricula_emision', aISO(d.fechaMatriculaEmision), '::date');
  if (d.runt !== undefined) set('runt', d.runt, '::respuesta_runt');

  if (sets.length === 0) return actual;

  set('actualizado_por', sesion.usuarioId);
  params.push(id, d.rowVersion);

  const fila = await queryOne<{ id: string }>(
    `UPDATE registros SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND row_version = $${params.length}
      RETURNING id`,
    params,
  );
  if (!fila) throw new ErrorDominio('CONFLICTO', 'El registro cambio mientras se guardaba. Recargue.');

  return obtenerRegistro(sesion, id);
}
