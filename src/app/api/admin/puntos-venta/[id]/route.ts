import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { puntoVentaActualizarSchema } from '@/lib/domain/admin.schemas';
import { actualizarPuntoVenta } from '@/lib/domain/admin.repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/puntos-venta/:id · SOLO ADMIN.
 *
 * Aqui vive la ASIGNACION DE TRAMITADORES del requisito operativo: el mapeo
 * CIUDAD CORRESPONDENCIA → TRANSITO → TRAMITADOR es dato, no codigo, de modo
 * que se reasigna sin volver a desplegar. Las carpetas ya matriculadas o
 * entregadas conservan su tramitador historico; las abiertas se re-mapean solo
 * si se marca `reasignarAbiertas`.
 */
export const PATCH = ruta({ rol: 'ADMIN', schema: puntoVentaActualizarSchema }, async ({ sesion, params, body, auditar }) => {
  const id = z.coerce.number().int().positive('Identificador invalido.').parse(params.id ?? '');
  const { carpetasReasignadas } = await actualizarPuntoVenta(sesion, id, body);

  await auditar('PDV_UPDATE', {
    entidad: 'puntos_venta',
    entidadId: String(id),
    metadata: { campos: Object.keys(body), carpetasReasignadas },
  });

  return ok({
    id,
    carpetasReasignadas,
    mensaje:
      carpetasReasignadas > 0
        ? `Punto de venta actualizado. ${carpetasReasignadas} carpeta(s) abierta(s) adoptaron el nuevo tramitador.`
        : 'Punto de venta actualizado. Las carpetas existentes conservan su tramitador.',
  });
});
