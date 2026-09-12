import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { tx } from '@/lib/db';
import { validarSolicitudSchema } from '@/lib/domain/schemas';
import { ErrorDominio } from '@/lib/api/respuestas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/runt/solicitudes/:id  ·  SOLO ADMINISTRADOR
 *
 * Unico punto del sistema capaz de poner RUNT = 'Si'. Al aprobar, el trigger
 * fn_solicitud_aplica_runt actualiza el registro asociado en la misma
 * transaccion, de modo que no puede quedar una solicitud aprobada con el
 * registro aun bloqueado.
 */
export const PATCH = ruta({ rol: 'ADMIN', schema: validarSolicitudSchema }, async ({ sesion, params, body, auditar }) => {
  const id = z.string().uuid('Identificador invalido.').parse(params.id ?? "");

  const resultado = await tx(async (c) => {
    const { rows } = await c.query<{ estado: string; registro_id: string | null }>(
      `SELECT estado, registro_id FROM solicitudes_runt WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const actual = rows[0];
    if (!actual) throw new ErrorDominio('NO_ENCONTRADO', 'Solicitud no encontrada.');
    if (actual.estado !== 'PENDIENTE') {
      throw new ErrorDominio('CONFLICTO', `La solicitud ya fue ${actual.estado.toLowerCase()}.`);
    }

    const nuevoEstado = body.decision === 'APROBAR' ? 'APROBADA' : 'RECHAZADA';
    const { rows: out } = await c.query<{ id: string; estado: string; registro_id: string | null }>(
      `UPDATE solicitudes_runt
          SET estado = $1::estado_solicitud_runt,
              revisado_por = $2,
              revisado_en = now(),
              motivo_rechazo = $3
        WHERE id = $4
        RETURNING id, estado, registro_id`,
      [nuevoEstado, sesion.usuarioId, body.decision === 'RECHAZAR' ? body.motivo : null, id],
    );
    return out[0]!;
  });

  await auditar(body.decision === 'APROBAR' ? 'RUNT_APROBAR' : 'RUNT_RECHAZAR', {
    entidad: 'solicitudes_runt',
    entidadId: id,
    metadata: { registroId: resultado.registro_id },
  });

  return ok({
    solicitud: resultado,
    mensaje:
      body.decision === 'APROBAR'
        ? 'Inscripcion validada. El registro queda habilitado para tramite.'
        : 'Solicitud rechazada. El registro sigue bloqueado por RUNT.',
  });
});
