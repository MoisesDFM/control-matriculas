import { ruta, ok } from '@/lib/api/handler';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Perfil de la sesion activa. El cliente NUNCA deduce el rol por si mismo. */
export const GET = ruta({}, async ({ sesion }) => {
  const pdv = sesion.puntoVentaId
    ? await queryOne<{ ciudad_correspondencia: string; transito: string; tramitador: string }>(
        `SELECT pdv.ciudad_correspondencia, t.nombre AS transito, tr.nombre AS tramitador
           FROM puntos_venta pdv
           JOIN transitos t     ON t.id  = pdv.transito_id
           JOIN tramitadores tr ON tr.id = pdv.tramitador_id
          WHERE pdv.id = $1`,
        [sesion.puntoVentaId],
      )
    : null;

  return ok({
    nombre: sesion.nombre,
    rol: sesion.rol,
    puntoVentaId: sesion.puntoVentaId,
    puntoVenta: pdv?.ciudad_correspondencia ?? null,
    transito: pdv?.transito ?? null,
    tramitador: pdv?.tramitador ?? null,
  });
});
