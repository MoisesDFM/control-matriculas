import { ruta, ok } from '@/lib/api/handler';
import { usuarioCrearSchema } from '@/lib/domain/admin.schemas';
import { crearUsuario, listarUsuarios } from '@/lib/domain/admin.repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/usuarios · SOLO ADMIN. Nunca devuelve hashes de contraseña. */
export const GET = ruta({ rol: 'ADMIN' }, async () => {
  return ok({ filas: await listarUsuarios() });
});

/**
 * POST /api/admin/usuarios · SOLO ADMIN.
 * Es la unica via de alta dentro de la aplicacion: no existe autoregistro.
 * La contraseña se exige con politica minima y se guarda con bcrypt cost 12.
 */
export const POST = ruta({ rol: 'ADMIN', schema: usuarioCrearSchema }, async ({ body, auditar }) => {
  const id = await crearUsuario(body);
  await auditar('USUARIO_CREATE', {
    entidad: 'usuarios',
    entidadId: id,
    // La contraseña jamas se registra en auditoria.
    metadata: { email: body.email, rol: body.rol, puntoVentaId: body.puntoVentaId ?? null },
  });
  return ok({ id }, { status: 201 });
});
