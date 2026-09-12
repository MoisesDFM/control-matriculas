import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { env, isProd } from '../env';
import { query, queryOne } from '../db';
import { signAccessToken, verifyAccessToken, type AccessClaims } from './jwt';

export const ACCESS_COOKIE = '__Host-nm_at';
export const REFRESH_COOKIE = '__Host-nm_rt';
export const CSRF_COOKIE = '__Host-nm_csrf';

/**
 * Cookies HTTP-Only + SameSite=Strict + Secure + prefijo __Host-
 * El prefijo __Host- obliga a Secure, Path=/ y prohibe el atributo Domain:
 * ningun subdominio comprometido puede sobrescribirlas.
 */
const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict' as const,
  path: '/',
};

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface Sesion {
  usuarioId: string;
  rol: 'ASESOR' | 'ADMIN';
  /** null = ADMIN (alcance global). number = asesor confinado a ese PDV. */
  puntoVentaId: number | null;
  nombre: string;
  sid: string;
}

function aSesion(c: AccessClaims): Sesion {
  return { usuarioId: c.sub, rol: c.rol, puntoVentaId: c.pdv ?? null, nombre: c.nombre, sid: c.sid };
}

/** Lee y valida la sesion del request actual. NUNCA confia en headers del cliente. */
export async function getSesion(): Promise<Sesion | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  // El access token es corto, pero igual comprobamos que la sesion siga viva:
  // permite revocacion inmediata (logout global, usuario desactivado).
  const viva = await queryOne<{ ok: boolean }>(
    `SELECT true AS ok
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = $1 AND s.usuario_id = $2
        AND s.revocada_en IS NULL AND s.expira_en > now() AND u.activo`,
    [claims.sid, claims.sub],
  );
  if (!viva) return null;

  return aSesion(claims);
}

/** Crea sesion: refresh token opaco en BD + access JWT + token CSRF. */
export async function crearSesion(
  u: { id: string; rol: 'ASESOR' | 'ADMIN'; punto_venta_id: number | null; nombre: string },
  ctx: { ip: string | null; userAgent: string | null },
): Promise<void> {
  const refresh = randomBytes(48).toString('base64url');
  const expira = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO sesiones (usuario_id, token_hash, ip, user_agent, expira_en)
     VALUES ($1, $2, $3::inet, $4, $5) RETURNING id`,
    [u.id, sha256(refresh), ctx.ip, ctx.userAgent?.slice(0, 400) ?? null, expira],
  );
  if (!row) throw new Error('No se pudo crear la sesion');

  const access = await signAccessToken({
    sub: u.id,
    rol: u.rol,
    pdv: u.punto_venta_id,
    nombre: u.nombre,
    sid: row.id,
  });

  const jar = await cookies();
  jar.set(ACCESS_COOKIE, access, { ...baseCookie, maxAge: env.ACCESS_TOKEN_TTL_MIN * 60 });
  jar.set(REFRESH_COOKIE, refresh, { ...baseCookie, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400 });
  // Double-submit: legible por JS a proposito, se compara con el header X-CSRF-Token.
  jar.set(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
    ...baseCookie,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
  });
}

/** Rotacion de refresh token (un uso por token; reuso => revocacion en cadena). */
export async function rotarSesion(): Promise<Sesion | null> {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  const s = await queryOne<{
    id: string; usuario_id: string; rol: 'ASESOR' | 'ADMIN'; punto_venta_id: number | null;
    nombre: string; revocada_en: Date | null;
  }>(
    `SELECT s.id, s.usuario_id, s.revocada_en, u.rol, u.punto_venta_id, u.nombre
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_en > now() AND u.activo`,
    [sha256(refresh)],
  );
  if (!s) return null;

  if (s.revocada_en) {
    // Token ya usado: posible robo. Se cierra toda la familia de sesiones.
    await query(`UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL`, [s.usuario_id]);
    await destruirCookies();
    return null;
  }

  await query(`UPDATE sesiones SET revocada_en = now() WHERE id = $1`, [s.id]);
  await crearSesion(
    { id: s.usuario_id, rol: s.rol, punto_venta_id: s.punto_venta_id, nombre: s.nombre },
    { ip: null, userAgent: null },
  );
  return { usuarioId: s.usuario_id, rol: s.rol, puntoVentaId: s.punto_venta_id, nombre: s.nombre, sid: s.id };
}

export async function cerrarSesion(): Promise<void> {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await query(`UPDATE sesiones SET revocada_en = now() WHERE token_hash = $1 AND revocada_en IS NULL`, [
      sha256(refresh),
    ]);
  }
  await destruirCookies();
}

async function destruirCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    jar.set(name, '', { ...baseCookie, httpOnly: name !== CSRF_COOKIE, maxAge: 0 });
  }
}
