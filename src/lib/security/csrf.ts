import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '../env';
import { CSRF_COOKIE } from '../auth/session';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Doble barrera CSRF:
 *  1. El Origin (o Referer) debe coincidir exactamente con APP_ORIGIN.
 *  2. Double-submit: header X-CSRF-Token == cookie __Host-nm_csrf.
 * Con SameSite=Strict ya seria suficiente, pero no dependemos de un solo control.
 */
export async function verificarCsrf(
  req: Request,
  opciones: { soloOrigen?: boolean } = {},
): Promise<string | null> {
  if (METODOS_SEGUROS.has(req.method)) return null;

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const esperado = env.APP_ORIGIN.replace(/\/$/, '');

  if (origin) {
    if (origin.replace(/\/$/, '') !== esperado) return 'Origen no permitido.';
  } else if (referer) {
    try {
      if (new URL(referer).origin !== esperado) return 'Referer no permitido.';
    } catch {
      return 'Referer invalido.';
    }
  } else {
    return 'Peticion sin origen verificable.';
  }

  // En el login todavia no existe cookie CSRF: ahi basta la validacion de origen.
  if (opciones.soloOrigen) return null;

  const header = req.headers.get('x-csrf-token');
  const cookie = (await cookies()).get(CSRF_COOKIE)?.value;
  if (!header || !cookie || !igual(header, cookie)) return 'Token CSRF invalido o ausente.';

  return null;
}
