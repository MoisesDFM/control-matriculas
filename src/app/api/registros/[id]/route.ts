import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { ErrorDominio } from '@/lib/api/respuestas';
import { registroActualizarSchema } from '@/lib/domain/schemas';
import { actualizarRegistro, obtenerRegistro } from '@/lib/domain/registros.repo';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid('Identificador invalido.');

export const GET = ruta({}, async ({ sesion, params }) => {
  const id = uuid.parse(params.id ?? "");
  const registro = await obtenerRegistro(sesion, id);
  const historial = await query<{ estado_nuevo: string; nota: string | null; fecha: string; usuario: string | null }>(
    `SELECT h.estado_nuevo,
            h.nota,
            to_char(h.created_at, 'YYYY/MM/DD HH24:MI') AS fecha,
            u.nombre AS usuario
       FROM registro_historial h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.registro_id = $1
      ORDER BY h.created_at DESC
      LIMIT 50`,
    [id],
  );
  return ok({ registro, historial });
});

/**
 * PATCH /api/registros/:id
 * Placa, fechas de SOAT/matricula y RUNT son exclusivos del control central
 * (se verifica en actualizarRegistro). Concurrencia optimista por rowVersion.
 */
export const PATCH = ruta({ schema: registroActualizarSchema }, async ({ sesion, params, body, auditar }) => {
  const id = uuid.parse(params.id ?? "");
  if (body.puntoVentaId !== undefined) {
    throw new ErrorDominio('SIN_PERMISO', 'La ciudad de correspondencia no se puede reasignar; anule y vuelva a registrar.');
  }
  const registro = await actualizarRegistro(sesion, id, body);
  await auditar('REGISTRO_UPDATE', { entidad: 'registros', entidadId: id, metadata: { campos: Object.keys(body) } });
  return ok({ registro });
});
