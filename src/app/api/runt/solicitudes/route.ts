import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { query, queryOne } from '@/lib/db';
import { alcance, pdvParaEscritura } from '@/lib/api/rbac';
import { solicitudRuntSchema } from '@/lib/domain/schemas';
import { ErrorDominio } from '@/lib/api/respuestas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const filtro = z.object({
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});

/**
 * GET /api/runt/solicitudes
 * El asesor ve las solicitudes de su punto de venta; el administrador, todas.
 */
export const GET = ruta({ schema: filtro }, async ({ sesion, body }) => {
  const al = alcance(sesion, 's');
  const params: unknown[] = [...al.params];
  let where = al.where;
  if (body.estado) {
    params.push(body.estado);
    where += ` AND s.estado = $${params.length}::estado_solicitud_runt`;
  }
  params.push(50, (body.pagina - 1) * 50);

  const filas = await query(
    `SELECT s.id, s.numero_identificacion, s.nombre_completo, s.direccion_barrio,
            s.telefono, s.correo, s.cedula_url, s.cedula_mime, s.estado, s.motivo_rechazo,
            s.registro_id,
            pdv.ciudad_correspondencia AS punto_venta,
            to_char(s.created_at, 'YYYY/MM/DD') AS fecha_solicitud,
            to_char(s.revisado_en, 'YYYY/MM/DD') AS fecha_revision,
            sol.nombre AS solicitado_por,
            rev.nombre AS revisado_por
       FROM solicitudes_runt s
       JOIN puntos_venta pdv ON pdv.id = s.punto_venta_id
       JOIN usuarios sol     ON sol.id = s.solicitado_por
       LEFT JOIN usuarios rev ON rev.id = s.revisado_por
      WHERE ${where}
      ORDER BY (s.estado = 'PENDIENTE') DESC, s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const pendientes = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM solicitudes_runt s WHERE ${al.where} AND s.estado = 'PENDIENTE'`,
    al.params,
  );

  return ok({ filas, pendientes: Number(pendientes?.n ?? 0) });
});

/**
 * POST /api/runt/solicitudes
 * Modulo de solicitud de inscripcion (regla 4.3). El asesor envia PDV,
 * direccion/barrio, telefono, correo del cliente y el adjunto de la cedula.
 * Crearla NO habilita el RUNT: eso solo lo hace el administrador al validar.
 */
export const POST = ruta({ schema: solicitudRuntSchema }, async ({ sesion, body, auditar }) => {
  const puntoVentaId = pdvParaEscritura(sesion, body.puntoVentaId);

  // Si se asocia a un registro, debe pertenecer al alcance del solicitante.
  if (body.registroId) {
    const al = alcance(sesion, 'r');
    const existe = await queryOne<{ id: string }>(
      `SELECT r.id FROM registros r WHERE ${al.where} AND r.id = $${al.siguiente}`,
      [...al.params, body.registroId],
    );
    if (!existe) throw new ErrorDominio('NO_ENCONTRADO', 'El registro asociado no existe en su punto de venta.');
  }

  const fila = await queryOne<{ id: string }>(
    `INSERT INTO solicitudes_runt (
        registro_id, punto_venta_id, numero_identificacion, nombre_completo,
        direccion_barrio, telefono, correo, cedula_url, cedula_mime, solicitado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      body.registroId ?? null,
      puntoVentaId,
      body.numeroIdentificacion,
      body.nombreCompleto,
      body.direccionBarrio,
      body.telefono,
      body.correo,
      body.cedulaUrl,
      body.cedulaMime,
      sesion.usuarioId,
    ],
  );

  await auditar('RUNT_SOLICITUD_CREATE', {
    entidad: 'solicitudes_runt',
    entidadId: fila?.id,
    metadata: { cedula: body.numeroIdentificacion },
  });

  return ok({ id: fila?.id, estado: 'PENDIENTE' }, { status: 201 });
});
