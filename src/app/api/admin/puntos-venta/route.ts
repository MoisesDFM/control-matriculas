import { ruta, ok } from '@/lib/api/handler';
import { queryOne } from '@/lib/db';
import { puntoVentaCrearSchema } from '@/lib/domain/admin.schemas';
import { listarPuntosVentaAdmin } from '@/lib/domain/admin.repo';
import { ErrorDominio } from '@/lib/api/respuestas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/puntos-venta · SOLO ADMIN.
 * Devuelve el mapeo vigente CIUDAD CORRESPONDENCIA → TRANSITO → TRAMITADOR con
 * el volumen de carpetas de cada sede.
 */
export const GET = ruta({ rol: 'ADMIN' }, async () => {
  return ok({ filas: await listarPuntosVentaAdmin() });
});

/**
 * POST /api/admin/puntos-venta · SOLO ADMIN.
 * El transito se hereda del tramitador elegido, nunca se envia por separado:
 * asi es imposible crear una sede con un tramitador de otro transito.
 */
export const POST = ruta({ rol: 'ADMIN', schema: puntoVentaCrearSchema }, async ({ body, auditar }) => {
  const tram = await queryOne<{ transito_id: number; activo: boolean }>(
    `SELECT transito_id, activo FROM tramitadores WHERE id = $1`,
    [body.tramitadorId],
  );
  if (!tram) throw new ErrorDominio('VALIDACION', 'El tramitador indicado no existe.');
  if (!tram.activo) throw new ErrorDominio('VALIDACION', 'No se puede asignar un tramitador inactivo.');

  const fila = await queryOne<{ id: number }>(
    `INSERT INTO puntos_venta (ciudad_correspondencia, transito_id, tramitador_id, permite_preasignacion)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [body.ciudadCorrespondencia, tram.transito_id, body.tramitadorId, body.permitePreasignacion],
  );

  await auditar('PDV_CREATE', {
    entidad: 'puntos_venta',
    entidadId: String(fila?.id),
    metadata: { ciudad: body.ciudadCorrespondencia, tramitadorId: body.tramitadorId },
  });

  return ok({ id: fila?.id }, { status: 201 });
});
