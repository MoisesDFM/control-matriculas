import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { cambioEstadoSchema } from '@/lib/domain/schemas';
import { cambiarEstado } from '@/lib/domain/registros.repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/registros/:id/estado
 *
 * Aqui vive la aplicacion del BLOQUEO OBLIGATORIO POR RUNT. Si el registro
 * tiene RUNT = No, cualquier intento de pasar a EN_TRANSITO (o posterior)
 * devuelve 409 con codigo RUNT_BLOQUEADO, y el frontend despliega la alerta
 * roja. La misma regla esta replicada en el trigger fn_registro_flujo y en el
 * CHECK reg_runt_gate_ck: es imposible saltarla llamando a la API directamente.
 */
export const POST = ruta({ schema: cambioEstadoSchema }, async ({ sesion, params, body, auditar }) => {
  const id = z.string().uuid('Identificador invalido.').parse(params.id ?? "");
  const registro = await cambiarEstado(sesion, id, body.estado, body.rowVersion, body.nota);
  await auditar('REGISTRO_ESTADO', {
    entidad: 'registros',
    entidadId: id,
    metadata: { estado: body.estado, nota: body.nota || undefined },
  });
  return ok({ registro });
});
