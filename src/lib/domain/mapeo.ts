import { query } from '../db';

/**
 * MAPEO AUTOMATICO Transito / Tramitador segun CIUDAD CORRESPONDENCIA.
 *
 * La tabla `puntos_venta` es la fuente de verdad en produccion (se puede
 * reasignar un tramitador desde el panel de administracion sin desplegar).
 * Este objeto es el mapeo canonico de arranque: alimenta el seed, sirve de
 * respaldo para la UI cuando aun no hay red y documenta la regla 4.1.
 */
export const MAPEO_CANONICO = {
  'PLANETA RICA': { transito: 'Planeta Rica', tramitador: 'Richar Zapata', preasignacion: false },
  'PUERTO LIBERTADOR': { transito: 'Planeta Rica', tramitador: 'Richar Barroso', preasignacion: false },
  'MONTELIBANO MOBILITY': { transito: 'Planeta Rica', tramitador: 'Richar Barroso', preasignacion: false },
  'MONTELIBANO TVS': { transito: 'Planeta Rica', tramitador: 'Richar Barroso', preasignacion: false },
  AYAPEL: { transito: 'Caucasia', tramitador: 'Mirna Gutierrez', preasignacion: true },
  NECHI: { transito: 'Caucasia', tramitador: 'Mirna Gutierrez', preasignacion: true },
  ZARAGOZA: { transito: 'Caucasia', tramitador: 'Mirna Gutierrez', preasignacion: true },
  GUARANDA: { transito: 'Sincelejo', tramitador: 'Yuliana', preasignacion: false },
  MAJAGUAL: { transito: 'Sincelejo', tramitador: 'Yuliana', preasignacion: false },
  'SAN MARCOS': { transito: 'Sincelejo', tramitador: 'Yuliana', preasignacion: false },
  SUCRE: { transito: 'Sincelejo', tramitador: 'Yuliana', preasignacion: false },
} as const;

export type CiudadCorrespondencia = keyof typeof MAPEO_CANONICO;

export interface PuntoVenta {
  id: number;
  ciudad_correspondencia: string;
  transito: string;
  tramitador: string;
  permite_preasignacion: boolean;
}

/** Catalogo vivo desde la BD (lo consume el formulario de registro). */
export async function listarPuntosVenta(): Promise<PuntoVenta[]> {
  return query<PuntoVenta>(
    `SELECT pdv.id,
            pdv.ciudad_correspondencia,
            t.nombre  AS transito,
            tr.nombre AS tramitador,
            pdv.permite_preasignacion
       FROM puntos_venta pdv
       JOIN transitos    t  ON t.id  = pdv.transito_id
       JOIN tramitadores tr ON tr.id = pdv.tramitador_id
      WHERE pdv.activo
      ORDER BY t.nombre, pdv.ciudad_correspondencia`,
  );
}

/** Resolucion local e inmediata para la UI (sin esperar al servidor). */
export function resolverMapeo(ciudad: string): { transito: string; tramitador: string; preasignacion: boolean } | null {
  const clave = ciudad.trim().toUpperCase() as CiudadCorrespondencia;
  return MAPEO_CANONICO[clave] ?? null;
}
