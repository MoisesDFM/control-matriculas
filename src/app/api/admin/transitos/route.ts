import { ruta, ok } from '@/lib/api/handler';
import { query, queryOne } from '@/lib/db';
import { transitoCrearSchema } from '@/lib/domain/admin.schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/transitos · SOLO ADMIN. */
export const GET = ruta({ rol: 'ADMIN' }, async () => {
  const filas = await query<{ id: number; nombre: string; activo: boolean; tramitadores: number }>(
    `SELECT t.id, t.nombre, t.activo,
            (SELECT count(*) FROM tramitadores tr WHERE tr.transito_id = t.id AND tr.activo)::int AS tramitadores
       FROM transitos t
      ORDER BY t.activo DESC, t.nombre`,
  );
  return ok({ filas });
});

/** POST /api/admin/transitos · SOLO ADMIN. */
export const POST = ruta({ rol: 'ADMIN', schema: transitoCrearSchema }, async ({ body, auditar }) => {
  const fila = await queryOne<{ id: number }>(`INSERT INTO transitos (nombre) VALUES ($1) RETURNING id`, [body.nombre]);
  await auditar('TRANSITO_CREATE', { entidad: 'transitos', entidadId: String(fila?.id), metadata: { nombre: body.nombre } });
  return ok({ id: fila?.id }, { status: 201 });
});
