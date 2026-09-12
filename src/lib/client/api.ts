'use client';

/**
 * Cliente HTTP del navegador. Adjunta automaticamente el token CSRF de la
 * cookie legible (double-submit) y normaliza la forma de los errores para que
 * la UI siempre reciba { codigo, mensaje }.
 */

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  campos?: { campo: string; mensaje: string }[];
  reintentarEn?: number;
}

export class FalloApi extends Error {
  constructor(readonly error: ErrorApi) {
    super(error.mensaje);
    this.name = 'FalloApi';
  }
}

function csrf(): string {
  const m = /(?:^|;\s*)__Host-nm_csrf=([^;]+)/.exec(document.cookie);
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET' ? { 'X-CSRF-Token': csrf() } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    // Sesion caida: se fuerza el reingreso en lugar de mostrar datos vacios.
    window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname)}`;
    throw new FalloApi({ codigo: 'NO_AUTENTICADO', mensaje: 'Sesion expirada.' });
  }

  const cuerpo = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: ErrorApi }
    | null;

  if (!res.ok || !cuerpo || cuerpo.ok === false) {
    throw new FalloApi(
      cuerpo && cuerpo.ok === false
        ? cuerpo.error
        : { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo completar la operacion.' },
    );
  }

  return cuerpo.data;
}

export const api = {
  get: <T>(url: string) => pedir<T>(url),
  post: <T>(url: string, body: unknown) => pedir<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) => pedir<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
};

/** Construye una querystring omitiendo valores vacios. */
export function qs(obj: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
