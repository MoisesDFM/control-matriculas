import type { Sesion } from '../auth/session';
import { ErrorDominio } from './respuestas';

/**
 * ================= FILTRO RBAC POR PUNTO DE VENTA =================
 *
 * Todo SELECT/UPDATE/DELETE sobre datos de clientes pasa por aqui. El filtro
 * NO es opcional ni depende de lo que envie el cliente: se deriva del JWT.
 *
 * - ASESOR: se inyecta `punto_venta_id = $n` con el PDV del token. Aunque el
 *   asesor manipule la querystring, nunca vera otra sede.
 * - ADMIN: alcance global; puede filtrar voluntariamente por un PDV.
 *
 * Uso:
 *   const al = alcance(sesion, 'r');
 *   const params = [...al.params, otro];
 *   `SELECT ... FROM vw_registros r WHERE ${al.where} AND r.estado = $${params.length}`
 */
export interface Alcance {
  where: string;
  params: unknown[];
  /** Siguiente indice de parametro disponible ($n). */
  siguiente: number;
  esGlobal: boolean;
}

export function alcance(sesion: Sesion, alias = 'r', desde = 1): Alcance {
  if (sesion.rol === 'ADMIN') {
    return { where: 'TRUE', params: [], siguiente: desde, esGlobal: true };
  }
  if (sesion.puntoVentaId === null) {
    // Un asesor sin PDV es un estado imposible por CHECK en la BD. Si ocurre,
    // se niega el acceso en lugar de degradar a "ver todo".
    throw new ErrorDominio('SIN_PERMISO', 'Su usuario no tiene un punto de venta asignado.');
  }
  return {
    where: `${alias}.punto_venta_id = $${desde}`,
    params: [sesion.puntoVentaId],
    siguiente: desde + 1,
    esGlobal: false,
  };
}

/** Verifica que un PDV solicitado explicitamente esta dentro del alcance. */
export function exigirPdvPermitido(sesion: Sesion, puntoVentaId: number): number {
  if (sesion.rol === 'ADMIN') return puntoVentaId;
  if (sesion.puntoVentaId !== puntoVentaId) {
    throw new ErrorDominio(
      'FUERA_DE_ALCANCE',
      'No puede operar sobre un punto de venta distinto al suyo.',
    );
  }
  return sesion.puntoVentaId;
}

/** PDV efectivo al crear: el asesor queda siempre anclado a su sede. */
export function pdvParaEscritura(sesion: Sesion, solicitado: number | undefined): number {
  if (sesion.rol === 'ASESOR') {
    if (sesion.puntoVentaId === null) {
      throw new ErrorDominio('SIN_PERMISO', 'Su usuario no tiene un punto de venta asignado.');
    }
    return sesion.puntoVentaId;
  }
  if (!solicitado) {
    throw new ErrorDominio('VALIDACION', 'Debe indicar la ciudad de correspondencia.');
  }
  return solicitado;
}

export function exigirAdmin(sesion: Sesion): void {
  if (sesion.rol !== 'ADMIN') {
    throw new ErrorDominio('SIN_PERMISO', 'Accion reservada al control central (administrador).');
  }
}
