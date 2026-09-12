import { queryOne, query } from '@/lib/db';
import { ruta, ok, fallo, auditar } from '@/lib/api/handler';
import { loginSchema } from '@/lib/domain/schemas';
import { verifyPassword, fakeCompare } from '@/lib/auth/password';
import { crearSesion } from '@/lib/auth/session';
import { LIMITES, rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

/**
 * POST /api/auth/login
 * Defensas: rate limit por IP y por correo, bloqueo temporal de la cuenta,
 * comparacion en tiempo constante y mensaje de error unico e indistinguible
 * (no revela si el correo existe).
 */
export const POST = ruta(
  { publica: true, schema: loginSchema, limite: LIMITES.login },
  async ({ body, ip, req }) => {
    // Segundo cubo por correo: impide rociar una misma cuenta desde varias IP.
    const porCorreo = await rateLimit(LIMITES.login, `e:${body.email}`);
    if (!porCorreo.permitido) {
      return fallo('RATE_LIMIT', 'Demasiados intentos para esta cuenta. Espere unos minutos.', {
        reintentarEn: porCorreo.reintentarEn,
      });
    }

    const u = await queryOne<{
      id: string;
      password_hash: string;
      nombre: string;
      rol: 'ASESOR' | 'ADMIN';
      punto_venta_id: number | null;
      activo: boolean;
      intentos_fallidos: number;
      bloqueado_hasta: Date | null;
      ciudad: string | null;
    }>(
      `SELECT u.id, u.password_hash, u.nombre, u.rol, u.punto_venta_id, u.activo,
              u.intentos_fallidos, u.bloqueado_hasta, pdv.ciudad_correspondencia AS ciudad
         FROM usuarios u
         LEFT JOIN puntos_venta pdv ON pdv.id = u.punto_venta_id
        WHERE u.email = $1`,
      [body.email],
    );

    const GENERICO = 'Credenciales incorrectas.';

    if (!u) {
      await fakeCompare(body.password); // iguala el tiempo de respuesta
      await auditar({ usuarioId: null, accion: 'LOGIN_FAIL', ip, metadata: { email: body.email, motivo: 'inexistente' } });
      return fallo('NO_AUTENTICADO', GENERICO);
    }

    if (u.bloqueado_hasta && u.bloqueado_hasta > new Date()) {
      await auditar({ usuarioId: u.id, accion: 'LOGIN_BLOQUEADO', ip });
      return fallo('NO_AUTENTICADO', `Cuenta bloqueada temporalmente. Intente en ${BLOQUEO_MIN} minutos.`);
    }

    const valida = await verifyPassword(body.password, u.password_hash);

    if (!valida || !u.activo) {
      const intentos = u.intentos_fallidos + 1;
      await query(
        `UPDATE usuarios
            SET intentos_fallidos = $1,
                bloqueado_hasta = CASE WHEN $1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_hasta END
          WHERE id = $4`,
        [intentos, MAX_INTENTOS, String(BLOQUEO_MIN), u.id],
      );
      await auditar({
        usuarioId: u.id,
        accion: 'LOGIN_FAIL',
        ip,
        metadata: { intentos, motivo: u.activo ? 'password' : 'inactivo' },
      });
      return fallo('NO_AUTENTICADO', GENERICO);
    }

    await query(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = now() WHERE id = $1`,
      [u.id],
    );

    await crearSesion(
      { id: u.id, rol: u.rol, punto_venta_id: u.punto_venta_id, nombre: u.nombre },
      { ip, userAgent: req.headers.get('user-agent') },
    );

    await auditar({ usuarioId: u.id, accion: 'LOGIN_OK', ip, metadata: { rol: u.rol } });

    return ok({
      nombre: u.nombre,
      rol: u.rol,
      puntoVentaId: u.punto_venta_id,
      puntoVenta: u.ciudad,
    });
  },
);
