import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { query, queryOne } from '@/lib/db';
import { tramitadorActualizarSchema } from '@/lib/domain/admin.schemas';
import { desactivarTramitadorSeguro } from '@/lib/domain/admin.repo';
import { ErrorDominio } from '@/lib/api/respuestas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.coerce.number().int().positive('Identificador invalido.');

/**
 * PATCH /api/admin/tramitadores/:id · SOLO ADMIN.
 *
 * Cambiar el transito de un tramitador arrastra a las sedes que lo tienen
 * asignado (el trigger trg_pdv_valida_tramitador exige coherencia), por eso se
 * actualizan ambas cosas en la misma sentencia logica.
 */
export const PATCH = ruta({ rol: 'ADMIN', schema: tramitadorActualizarSchema }, async ({ params, body, auditar }) => {
  const id = idSchema.parse(params.id ?? '');

  if (body.activo === false) await desactivarTramitadorSeguro(id);

  const sets: string[] = [];
  const valores: unknown[] = [];
  const set = (col: string, valor: unknown) => {
    valores.push(valor);
    sets.push(`${col} = $${valores.length}`);
  };

  if (body.nombre !== undefined) set('nombre', body.nombre);
  if (body.telefono !== undefined) set('telefono', body.telefono || null);
  if (body.activo !== undefined) set('activo', body.activo);
  if (body.transitoId !== undefined) {
    const t = await queryOne<{ id: number }>(`SELECT id FROM transitos WHERE id = $1 AND activo`, [body.transitoId]);
    if (!t) throw new ErrorDominio('VALIDACION', 'El transito indicado no existe o esta inactivo.');
    set('transito_id', body.transitoId);
  }

  if (sets.length === 0) return ok({ id });

  valores.push(id);
  const fila = await queryOne<{ id: number }>(
    `UPDATE tramitadores SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING id`,
    valores,
  );
  if (!fila) throw new ErrorDominio('NO_ENCONTRADO', 'Tramitador no encontrado.');

  // Las sedes asignadas deben seguir al transito del tramitador.
  let sedesAlineadas = 0;
  if (body.transitoId !== undefined) {
    const res = await query<{ id: number }>(
      `UPDATE puntos_venta SET transito_id = $1 WHERE tramitador_id = $2 AND transito_id <> $1 RETURNING id`,
      [body.transitoId, id],
    );
    sedesAlineadas = res.length;
  }

  await auditar('TRAMITADOR_UPDATE', {
    entidad: 'tramitadores',
    entidadId: String(id),
    metadata: { campos: Object.keys(body), sedesAlineadas },
  });

  return ok({
    id,
    sedesAlineadas,
    mensaje:
      sedesAlineadas > 0
        ? `Tramitador actualizado. ${sedesAlineadas} punto(s) de venta adoptaron el nuevo transito.`
        : 'Tramitador actualizado.',
  });
});
