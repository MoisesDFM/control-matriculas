import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * ============== MIDDLEWARE DE BORDE (Edge) ==============
 * Primera linea de defensa, se ejecuta antes de cualquier pagina o API:
 *   1. Redirige a /login todo lo que no tenga cookie de sesion valida.
 *   2. Aplica cabeceras de seguridad, incluida una CSP estricta con nonce.
 *   3. Fuerza HTTPS en produccion.
 *   4. Bloquea /admin/* para quien no sea ADMIN (el rol viaja firmado en el JWT).
 *
 * La verificacion definitiva de permisos vive en el backend (src/lib/api).
 * Esto es defensa en profundidad, no el unico control.
 */

const ACCESS_COOKIE = '__Host-nm_at';
// Rutas que no exigen cookie de sesion en el borde. /api/sync/sheets entra aqui
// porque el cron se autentica con CRON_SECRET (Authorization: Bearer ...); su
// metodo POST sigue exigiendo rol ADMIN dentro de la propia ruta.
const PUBLICAS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/health', '/api/sync/sheets'];
// Zonas exclusivas del control central. La validacion de solicitudes RUNT no
// esta aqui porque los asesores SI pueden crearlas: ese permiso se decide por
// metodo en la propia ruta (rol: 'ADMIN' solo en el PATCH de validacion).
const RUTAS_ADMIN = ['/admin', '/api/admin', '/api/sync'];

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

export const config = {
  // Se excluyen estaticos para no gastar invocaciones del plan gratuito.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;

  // --- 3. HTTPS obligatorio -------------------------------------------
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers.get('x-forwarded-proto') === 'http'
  ) {
    return NextResponse.redirect(`https://${req.headers.get('host')}${pathname}`, 308);
  }

  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const esApi = pathname.startsWith('/api');

  let rol: string | null = null;
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret, {
        issuer: 'nechimotos-matriculas',
        audience: 'nechimotos-web',
        algorithms: ['HS256'],
      });
      rol = typeof payload.rol === 'string' ? payload.rol : null;
    } catch {
      rol = null;
    }
  }

  // --- 1. Puerta de entrada -------------------------------------------
  if (!esPublica && !rol) {
    if (esApi) {
      return json({ ok: false, error: { codigo: 'NO_AUTENTICADO', mensaje: 'Sesion requerida.' } }, 401);
    }
    const destino = new URL('/login', origin);
    destino.searchParams.set('volver', pathname);
    return NextResponse.redirect(destino);
  }

  // Un usuario ya autenticado no deberia ver el login.
  if (pathname === '/login' && rol) {
    return NextResponse.redirect(new URL('/dashboard', origin));
  }

  // --- 4. Zona exclusiva del control central --------------------------
  if (RUTAS_ADMIN.some((p) => pathname.startsWith(p)) && rol !== 'ADMIN') {
    return esApi
      ? json({ ok: false, error: { codigo: 'SIN_PERMISO', mensaje: 'Zona exclusiva del administrador.' } }, 403)
      : NextResponse.redirect(new URL('/dashboard', origin));
  }

  // --- 2. Cabeceras de seguridad (Helmet equivalente) -----------------
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const res = NextResponse.next({
    request: { headers: nuevosHeaders(req, nonce) },
  });
  aplicarCabeceras(res.headers, nonce);
  return res;
}

function nuevosHeaders(req: NextRequest, nonce: string): Headers {
  const h = new Headers(req.headers);
  h.set('x-nonce', nonce);
  return h;
}

function aplicarCabeceras(h: Headers, nonce: string): void {
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' ${dev ? `'unsafe-eval'` : `'strict-dynamic'`}`,
    `style-src 'self' 'unsafe-inline'`,          // Tailwind inyecta estilos en dev
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    ...(dev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ');

  h.set('Content-Security-Policy', csp);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  h.set('X-DNS-Prefetch-Control', 'off');
  if (!dev) h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

function json(body: unknown, status: number): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
