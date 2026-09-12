import { z } from 'zod';
import { ruta, ok } from '@/lib/api/handler';
import { usuarioActualizarSchema } from '@/lib/domain/admin.schemas';
import { actualizarUsuario } from '@/lib/domain/admin.repo';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid('Identificador invalido.');

/**
 * PATCH /api/admin/usuarios/:id · SOLO ADMIN.
 * Cambiar contraseña, rol, sede o desactivar revoca las sesiones abiertas del
 * usuario: el rol y el punto de venta viajan firmados en el JWT, por lo que un
 * token anterior seguiria concediendo el alcance viejo.
 */
export const PATCH = ruta({ rol: 'ADMIN', schema: usuarioActualizarSchema }, async ({ sesion, params, body, auditar }) => {
  const id = uuid.parse(params.id ?? '');
  const { sesionesRevocadas } = await actualizarUsuario(sesion, id, body);

  await auditar('USUARIO_UPDATE', {
    entidad: 'usuarios',
    entidadId: id,
    metadata: {
      campos: Object.keys(body).filter((k) => k !== 'password'),
      cambioPassword: body.password !== undefined,
      sesionesRevocadas,
    },
  });

  return ok({
    id,
    sesionesRevocadas,
    mensaje:
      sesionesRevocadas > 0
        ? `Usuario actualizado. Se cerraron ${sesionesRevocadas} sesion(es) abiertas.`
        : 'Usuario actualizado.',
  });
});

/**
 * DELETE /api/admin/usuarios/:id · SOLO ADMIN.
 * No borra: desactiva y revoca sesiones. Los registros creados por el usuario
 * conservan su autoria para la auditoria.
 */
export const DELETE = ruta({ rol: 'ADMIN' }, async ({ sesion, params, auditar }) => {
  const id = uuid.parse(params.id ?? '');
  const { sesionesRevocadas } = await actualizarUsuario(sesion, id, { activo: false });
  await query(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1`, [id]);
  await auditar('USUARIO_DESACTIVAR', { entidad: 'usuarios', entidadId: id, metadata: { sesionesRevocadas } });
  return ok({ id, activo: false, sesionesRevocadas });
});
