import { ruta, ok } from '@/lib/api/handler';
import { query } from '@/lib/db';
import { listarPuntosVenta } from '@/lib/domain/mapeo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/catalogos
 * Alimenta los selectores del formulario. Para el asesor se devuelve unicamente
 * su punto de venta: el desplegable no puede ofrecer otra sede.
 */
export const GET = ruta({}, async ({ sesion }) => {
  const [puntosVenta, codigos, tramitadores] = await Promise.all([
    listarPuntosVenta(),
    query<{ codigo: string; descripcion: string | null }>(
      `SELECT codigo, descripcion FROM codigos WHERE activo ORDER BY codigo`,
    ),
    query<{ id: number; nombre: string; transito: string }>(
      `SELECT tr.id, tr.nombre, t.nombre AS transito
         FROM tramitadores tr JOIN transitos t ON t.id = tr.transito_id
        WHERE tr.activo ORDER BY t.nombre, tr.nombre`,
    ),
  ]);

  return ok({
    puntosVenta:
      sesion.rol === 'ADMIN' ? puntosVenta : puntosVenta.filter((p) => p.id === sesion.puntoVentaId),
    codigos,
    tramitadores: sesion.rol === 'ADMIN' ? tramitadores : [],
  });
});
