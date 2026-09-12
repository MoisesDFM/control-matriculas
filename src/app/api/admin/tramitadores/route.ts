import { ruta, ok } from '@/lib/api/handler';
import { queryOne } from '@/lib/db';
import { tramitadorCrearSchema } from '@/lib/domain/admin.schemas';
import { listarTramitadores } from '@/lib/domain/admin.repo';
import { ErrorDominio } from '@/lib/api/respuestas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/tramitadores · SOLO ADMIN. Incluye carga de trabajo actual. */
export const GET = ruta({ rol: 'ADMIN' }, async () => {
  return ok({ filas: await listarTramitadores() });
});

/** POST /api/admin/tramitadores · SOLO ADMIN. */
export const POST = ruta({ rol: 'ADMIN', schema: tramitadorCrearSchema }, async ({ body, auditar }) => {
  const existe = await queryOne<{ id: number }>(`SELECT id FROM transitos WHERE id = $1 AND activo`, [body.transitoId]);
  if (!existe) throw new ErrorDominio('VALIDACION', 'El transito indicado no existe o esta inactivo.');

  const fila = await queryOne<{ id: number }>(
    `INSERT INTO tramitadores (nombre, transito_id, telefono) VALUES ($1, $2, $3) RETURNING id`,
    [body.nombre, body.transitoId, body.telefono || null],
  );

  await auditar('TRAMITADOR_CREATE', {
    entidad: 'tramitadores',
    entidadId: String(fila?.id),
    metadata: { nombre: body.nombre, transitoId: body.transitoId },
  });

  return ok({ id: fila?.id }, { status: 201 });
});
