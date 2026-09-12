import { NextResponse } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { getSesion, type Sesion } from '../auth/session';
import { verificarCsrf } from '../security/csrf';
import { rateLimit, ipDe, LIMITES, type LimiteConfig } from '../security/rate-limit';
import { query } from '../db';
import { ErrorDominio, fallo, ok, type CodigoError } from './respuestas';
import { isProd } from '../env';

export interface Contexto<B = unknown> {
  req: Request;
  sesion: Sesion;
  /** Cuerpo ya validado y saneado por el esquema Zod. */
  body: B;
  params: Record<string, string | undefined>;
  ip: string;
  /** Registra la accion en la tabla de auditoria. */
  auditar: (accion: string, datos?: { entidad?: string; entidadId?: string; metadata?: unknown }) => Promise<void>;
}

interface Opciones<B> {
  /** Rol minimo exigido. 'ADMIN' == solo control central. */
  rol?: 'ASESOR' | 'ADMIN';
  /** Esquema de validacion del cuerpo (o de la querystring en GET). */
  schema?: ZodType<B, ZodTypeDef, unknown>;
  /** Politica de rate limiting. Por defecto: lectura en GET, escritura en el resto. */
  limite?: LimiteConfig;
  /** Ruta publica (solo para login). Omite sesion pero conserva CSRF y limites. */
  publica?: boolean;
}

type Manejador<B> = (ctx: Contexto<B>) => Promise<NextResponse> | NextResponse;

/** Segundo argumento que Next entrega a un route handler (params dinamicos). */
type CtxRuta = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * ============== MIDDLEWARE DE AUTENTICACION + SEGURIDAD ==============
 * Cadena aplicada a TODA ruta de API, en este orden:
 *   1. Rate limiting por IP (y por usuario si hay sesion)
 *   2. Verificacion CSRF (Origin/Referer + double-submit) en metodos mutantes
 *   3. Autenticacion por cookie HTTP-Only -> JWT verificado -> sesion viva en BD
 *   4. Autorizacion por rol
 *   5. Validacion y saneamiento de la entrada con Zod
 *   6. Traduccion homogenea de errores (nunca se filtran stack traces)
 */
export function ruta<B = unknown>(opciones: Opciones<B>, handler: Manejador<B>) {
  return async function (req: Request, ctx: CtxRuta): Promise<NextResponse> {
    const ip = ipDe(req);
    const esLectura = req.method === 'GET' || req.method === 'HEAD';

    try {
      // 1. Rate limiting -------------------------------------------------
      const cfg = opciones.limite ?? (esLectura ? LIMITES.lectura : LIMITES.escritura);
      const rl = await rateLimit(cfg, ip);
      if (!rl.permitido) {
        return NextResponse.json(
          { ok: false, error: { codigo: 'RATE_LIMIT', mensaje: 'Demasiadas peticiones. Intente mas tarde.' } },
          { status: 429, headers: { 'Retry-After': String(rl.reintentarEn), 'Cache-Control': 'no-store' } },
        );
      }

      // 2. CSRF ----------------------------------------------------------
      const csrf = await verificarCsrf(req, { soloOrigen: opciones.publica === true });
      if (csrf) return fallo('CSRF', csrf);

      // 3 y 4. Sesion y rol ---------------------------------------------
      let sesion: Sesion | null = null;
      if (!opciones.publica) {
        sesion = await getSesion();
        if (!sesion) return fallo('NO_AUTENTICADO', 'Sesion expirada o inexistente. Vuelva a iniciar sesion.');
        if (opciones.rol === 'ADMIN' && sesion.rol !== 'ADMIN') {
          return fallo('SIN_PERMISO', 'Accion reservada al control central (administrador).');
        }
        // Segundo limitador por usuario: una IP compartida no debe ahogar al PDV
        // y una cuenta robada no puede abusar rotando de IP.
        const rlUsuario = await rateLimit(cfg, `u:${sesion.usuarioId}`);
        if (!rlUsuario.permitido) {
          return fallo('RATE_LIMIT', 'Demasiadas peticiones para este usuario.', { reintentarEn: rlUsuario.reintentarEn });
        }
      }

      // 5. Validacion de entrada ----------------------------------------
      const params = (ctx?.params ? await ctx.params : {}) as Record<string, string | undefined>;
      let body = undefined as B;
      if (opciones.schema) {
        const crudo = esLectura
          ? Object.fromEntries(new URL(req.url).searchParams.entries())
          : await leerJson(req);
        body = opciones.schema.parse(crudo);
      }

      const sesionSegura = sesion ?? ({ usuarioId: '', rol: 'ASESOR', puntoVentaId: null, nombre: '', sid: '' } as Sesion);

      return await handler({
        req,
        sesion: sesionSegura,
        body,
        params,
        ip,
        auditar: (accion, datos) =>
          auditar({
            usuarioId: sesion?.usuarioId ?? null,
            accion,
            ip,
            userAgent: req.headers.get('user-agent'),
            ...datos,
          }),
      });
    } catch (e) {
      return traducirError(e);
    }
  };
}

async function leerJson(req: Request): Promise<unknown> {
  const tipo = req.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    throw new ErrorDominio('VALIDACION', 'Se espera Content-Type: application/json.');
  }
  const texto = await req.text();
  if (texto.length > 200_000) throw new ErrorDominio('VALIDACION', 'Cuerpo de la peticion demasiado grande.');
  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErrorDominio('VALIDACION', 'JSON malformado.');
  }
}

export async function auditar(a: {
  usuarioId: string | null;
  accion: string;
  entidad?: string;
  entidadId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5::inet, $6, $7::jsonb)`,
      [
        a.usuarioId,
        a.accion,
        a.entidad ?? null,
        a.entidadId ?? null,
        a.ip ?? null,
        a.userAgent?.slice(0, 400) ?? null,
        JSON.stringify(a.metadata ?? {}),
      ],
    );
  } catch {
    // La auditoria nunca debe tumbar la operacion del usuario.
  }
}

/** Traduce errores de Zod, de dominio y de PostgreSQL a respuestas estables. */
function traducirError(e: unknown): NextResponse {
  if (e instanceof ErrorDominio) return fallo(e.codigo, e.message, e.extra);

  if (e instanceof ZodError) {
    return fallo('VALIDACION', 'Revise los datos del formulario.', {
      campos: e.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }

  const pg = e as { code?: string; message?: string; constraint?: string };

  // Excepciones RAISE de los triggers de negocio
  if (pg.code === 'P0001' && pg.message) {
    const codigo: CodigoError = pg.message.includes('RUNT_BLOQUEADO')
      ? 'RUNT_BLOQUEADO'
      : pg.message.includes('TRANSICION_INVALIDA')
        ? 'TRANSICION_INVALIDA'
        : 'CONFLICTO';
    return fallo(codigo, pg.message.replace(/^[A-Z_]+:\s*/, ''));
  }

  if (pg.code === '40001' || pg.code === '40P01') {
    return fallo('CONFLICTO', 'Conflicto de concurrencia. Recargue e intente de nuevo.');
  }

  if (pg.code === '23505') {
    const mapa: Record<string, string> = {
      reg_chasis_uk: 'Ya existe un registro con ese numero de chasis (VIN).',
      ux_registros_placa: 'Esa placa ya esta asignada a otro registro vigente.',
      ux_usuarios_email: 'Ese correo ya esta registrado.',
      ux_sol_activa: 'Ya hay una solicitud de RUNT pendiente para esa cedula.',
    };
    return fallo('CONFLICTO', mapa[pg.constraint ?? ''] ?? 'Registro duplicado.');
  }

  if (pg.code === '23502') return fallo('VALIDACION', 'Falta un campo obligatorio.');

  if (pg.code === '23503') return fallo('VALIDACION', 'Referencia inexistente (codigo o punto de venta).');

  if (pg.code === '23514') {
    if (pg.constraint === 'reg_runt_gate_ck') {
      return fallo('RUNT_BLOQUEADO', 'El registro no puede avanzar sin inscripcion RUNT verificada.');
    }
    if (pg.constraint === 'reg_matriculado_ck') {
      return fallo('VALIDACION', 'Para matricular se requiere placa definitiva y fecha de matricula.');
    }
    return fallo('VALIDACION', 'Los datos no cumplen una regla del sistema.');
  }

  if (pg.code === '22P02' || pg.code === '22007' || pg.code === '22003') {
    return fallo('VALIDACION', 'Dato con formato invalido.');
  }

  if (!isProd) console.error('[API] error no controlado:', e);
  return fallo('ERROR_INTERNO', 'Ocurrio un error inesperado. El incidente quedo registrado.');
}

export { ok, fallo };
