import { z } from 'zod';
import { query, queryOne, tx } from '../db';
import { ErrorDominio } from '../api/respuestas';
import { hashPassword } from '../auth/password';
import type { Sesion } from '../auth/session';
import type {
  usuarioActualizarSchema,
  usuarioCrearSchema,
  puntoVentaActualizarSchema,
} from './admin.schemas';

/**
 * Operaciones del panel de administracion. Todas asumen rol ADMIN ya verificado
 * por el middleware de ruta; aqui se concentran las invariantes que ni el
 * administrador debe poder romper (quedarse sin administradores, cerrarse la
 * puerta a si mismo, dejar un asesor sin sede).
 */

export interface UsuarioFila {
  id: string;
  email: string;
  nombre: string;
  rol: 'ASESOR' | 'ADMIN';
  punto_venta_id: number | null;
  punto_venta: string | null;
  activo: boolean;
  bloqueado: boolean;
  intentos_fallidos: number;
  ultimo_login: string | null;
  creado: string;
  sesiones_activas: number;
}

/** Listado de usuarios. Nunca expone password_hash. */
export async function listarUsuarios(): Promise<UsuarioFila[]> {
  return query<UsuarioFila>(
    `SELECT u.id, u.email, u.nombre, u.rol, u.punto_venta_id,
            pdv.ciudad_correspondencia AS punto_venta,
            u.activo,
            (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()) AS bloqueado,
            u.intentos_fallidos,
            to_char(u.ultimo_login, 'YYYY/MM/DD HH24:MI') AS ultimo_login,
            to_char(u.created_at, 'YYYY/MM/DD')           AS creado,
            (SELECT count(*) FROM sesiones s
              WHERE s.usuario_id = u.id AND s.revocada_en IS NULL AND s.expira_en > now())::int
              AS sesiones_activas
       FROM usuarios u
       LEFT JOIN puntos_venta pdv ON pdv.id = u.punto_venta_id
      ORDER BY u.activo DESC, u.rol, pdv.ciudad_correspondencia NULLS FIRST, u.nombre`,
  );
}

export async function crearUsuario(d: z.infer<typeof usuarioCrearSchema>): Promise<string> {
  const hash = await hashPassword(d.password);
  const fila = await queryOne<{ id: string }>(
    `INSERT INTO usuarios (email, password_hash, nombre, rol, punto_venta_id)
     VALUES ($1, $2, $3, $4::rol_usuario, $5)
     RETURNING id`,
    [d.email, hash, d.nombre, d.rol, d.rol === 'ASESOR' ? d.puntoVentaId : null],
  );
  if (!fila) throw new ErrorDominio('ERROR_INTERNO', 'No se pudo crear el usuario.');
  return fila.id;
}

export async function actualizarUsuario(
  sesion: Sesion,
  id: string,
  d: z.infer<typeof usuarioActualizarSchema>,
): Promise<{ sesionesRevocadas: number }> {
  return tx(async (c) => {
    const { rows } = await c.query<{
      rol: 'ASESOR' | 'ADMIN';
      activo: boolean;
      punto_venta_id: number | null;
    }>(`SELECT rol, activo, punto_venta_id FROM usuarios WHERE id = $1 FOR UPDATE`, [id]);

    const actual = rows[0];
    if (!actual) throw new ErrorDominio('NO_ENCONTRADO', 'Usuario no encontrado.');

    const rolFinal = d.rol ?? actual.rol;
    const activoFinal = d.activo ?? actual.activo;

    // Invariante 1: nadie se cierra la puerta a si mismo.
    if (id === sesion.usuarioId && (activoFinal === false || rolFinal !== 'ADMIN')) {
      throw new ErrorDominio(
        'SIN_PERMISO',
        'No puede desactivar su propia cuenta ni quitarse el rol de administrador. Pidalo a otro administrador.',
      );
    }

    // Invariante 2: siempre debe quedar al menos un administrador activo.
    if (actual.rol === 'ADMIN' && actual.activo && (rolFinal !== 'ADMIN' || !activoFinal)) {
      const { rows: r } = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM usuarios WHERE rol = 'ADMIN' AND activo AND id <> $1`,
        [id],
      );
      if (Number(r[0]?.n ?? 0) === 0) {
        throw new ErrorDominio('CONFLICTO', 'Debe existir al menos un administrador activo.');
      }
    }

    // Invariante 3: el par (rol, punto de venta) siempre coherente.
    let pdvFinal: number | null;
    if (rolFinal === 'ADMIN') {
      pdvFinal = null;
    } else if (d.puntoVentaId !== undefined && d.puntoVentaId !== null) {
      pdvFinal = d.puntoVentaId;
    } else if (actual.punto_venta_id !== null) {
      pdvFinal = actual.punto_venta_id;
    } else {
      throw new ErrorDominio('VALIDACION', 'Indique el punto de venta del asesor.');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, valor: unknown, cast = '') => {
      params.push(valor);
      sets.push(`${col} = $${params.length}${cast}`);
    };

    if (d.nombre !== undefined) set('nombre', d.nombre);
    if (d.rol !== undefined) set('rol', rolFinal, '::rol_usuario');
    if (d.rol !== undefined || d.puntoVentaId !== undefined) set('punto_venta_id', pdvFinal);
    if (d.activo !== undefined) set('activo', activoFinal);
    if (d.desbloquear) {
      sets.push('intentos_fallidos = 0', 'bloqueado_hasta = NULL');
    }
    if (d.password) {
      set('password_hash', await hashPassword(d.password));
      sets.push('password_changed_at = now()');
    }

    if (sets.length === 0) return { sesionesRevocadas: 0 };

    params.push(id);
    await c.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    // Cambiar clave, rol, sede o desactivar invalida las sesiones abiertas: el
    // JWT lleva rol y PDV firmados, asi que no puede seguir circulando.
    const invalidante =
      d.password !== undefined ||
      d.rol !== undefined ||
      d.puntoVentaId !== undefined ||
      d.activo === false;

    if (!invalidante) return { sesionesRevocadas: 0 };

    const res = await c.query(
      `UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL`,
      [id],
    );
    return { sesionesRevocadas: res.rowCount ?? 0 };
  });
}

// --------------------------------------------------------------- CATALOGOS
export interface TramitadorFila {
  id: number;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  transito_id: number;
  transito: string;
  puntos_venta: number;
  carpetas_abiertas: number;
}

export async function listarTramitadores(): Promise<TramitadorFila[]> {
  return query<TramitadorFila>(
    `SELECT tr.id, tr.nombre, tr.telefono, tr.activo, tr.transito_id, t.nombre AS transito,
            (SELECT count(*) FROM puntos_venta p WHERE p.tramitador_id = tr.id)::int AS puntos_venta,
            (SELECT count(*) FROM registros r
              WHERE r.tramitador_id = tr.id
                AND r.estado NOT IN ('MATRICULADO','ENTREGADO','ANULADO'))::int AS carpetas_abiertas
       FROM tramitadores tr
       JOIN transitos t ON t.id = tr.transito_id
      ORDER BY tr.activo DESC, t.nombre, tr.nombre`,
  );
}

export interface PuntoVentaAdmin {
  id: number;
  ciudad_correspondencia: string;
  transito_id: number;
  transito: string;
  tramitador_id: number;
  tramitador: string;
  permite_preasignacion: boolean;
  activo: boolean;
  registros: number;
  abiertas: number;
  asesores: number;
}

export async function listarPuntosVentaAdmin(): Promise<PuntoVentaAdmin[]> {
  return query<PuntoVentaAdmin>(
    `SELECT pdv.id, pdv.ciudad_correspondencia, pdv.transito_id, t.nombre AS transito,
            pdv.tramitador_id, tr.nombre AS tramitador,
            pdv.permite_preasignacion, pdv.activo,
            (SELECT count(*) FROM registros r WHERE r.punto_venta_id = pdv.id)::int AS registros,
            (SELECT count(*) FROM registros r
              WHERE r.punto_venta_id = pdv.id
                AND r.estado NOT IN ('MATRICULADO','ENTREGADO','ANULADO'))::int AS abiertas,
            (SELECT count(*) FROM usuarios u WHERE u.punto_venta_id = pdv.id AND u.activo)::int AS asesores
       FROM puntos_venta pdv
       JOIN transitos    t  ON t.id  = pdv.transito_id
       JOIN tramitadores tr ON tr.id = pdv.tramitador_id
      ORDER BY pdv.activo DESC, t.nombre, pdv.ciudad_correspondencia`,
  );
}

/**
 * Reasigna el tramitador de una sede. El transito se adopta del tramitador
 * elegido, porque el CHECK trg_pdv_valida_tramitador exige coherencia.
 */
export async function actualizarPuntoVenta(
  sesion: Sesion,
  id: number,
  d: z.infer<typeof puntoVentaActualizarSchema>,
): Promise<{ carpetasReasignadas: number }> {
  return tx(async (c) => {
    const { rows } = await c.query<{ tramitador_id: number; activo: boolean }>(
      `SELECT tramitador_id, activo FROM puntos_venta WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new ErrorDominio('NO_ENCONTRADO', 'Punto de venta no encontrado.');

    if (d.activo === false) {
      const { rows: u } = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM usuarios WHERE punto_venta_id = $1 AND activo`,
        [id],
      );
      if (Number(u[0]?.n ?? 0) > 0) {
        throw new ErrorDominio(
          'CONFLICTO',
          'Hay asesores activos asignados a esta sede. Reasignelos o desactivelos primero.',
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, valor: unknown) => {
      params.push(valor);
      sets.push(`${col} = $${params.length}`);
    };

    if (d.tramitadorId !== undefined) {
      const { rows: t } = await c.query<{ transito_id: number; activo: boolean }>(
        `SELECT transito_id, activo FROM tramitadores WHERE id = $1`,
        [d.tramitadorId],
      );
      const tram = t[0];
      if (!tram) throw new ErrorDominio('VALIDACION', 'El tramitador indicado no existe.');
      if (!tram.activo) throw new ErrorDominio('VALIDACION', 'No se puede asignar un tramitador inactivo.');
      set('tramitador_id', d.tramitadorId);
      set('transito_id', tram.transito_id);
    }
    if (d.permitePreasignacion !== undefined) set('permite_preasignacion', d.permitePreasignacion);
    if (d.activo !== undefined) set('activo', d.activo);

    if (sets.length === 0) return { carpetasReasignadas: 0 };

    params.push(id);
    await c.query(`UPDATE puntos_venta SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    // Las carpetas guardan transito/tramitador historicos. Solo se re-mapean
    // las abiertas y solo si el administrador lo pide: al tocar la fila, el
    // trigger fn_registro_normaliza vuelve a derivar el mapeo del PDV.
    if (d.tramitadorId === undefined || !d.reasignarAbiertas) return { carpetasReasignadas: 0 };

    const res = await c.query(
      `UPDATE registros SET actualizado_por = $1
        WHERE punto_venta_id = $2
          AND estado NOT IN ('MATRICULADO','ENTREGADO','ANULADO')`,
      [sesion.usuarioId, id],
    );
    return { carpetasReasignadas: res.rowCount ?? 0 };
  });
}

/** Un tramitador solo se desactiva si ninguna sede depende de el. */
export async function desactivarTramitadorSeguro(id: number): Promise<void> {
  const fila = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM puntos_venta WHERE tramitador_id = $1 AND activo`,
    [id],
  );
  if (Number(fila?.n ?? 0) > 0) {
    throw new ErrorDominio(
      'CONFLICTO',
      'Este tramitador esta asignado a puntos de venta activos. Reasigne esas sedes antes de desactivarlo.',
    );
  }
}
