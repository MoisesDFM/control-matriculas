import { NextResponse } from 'next/server';

export type CodigoError =
  | 'NO_AUTENTICADO'
  | 'SIN_PERMISO'
  | 'FUERA_DE_ALCANCE'
  | 'CSRF'
  | 'RATE_LIMIT'
  | 'VALIDACION'
  | 'CONFLICTO'
  | 'NO_ENCONTRADO'
  | 'RUNT_BLOQUEADO'
  | 'TRANSICION_INVALIDA'
  | 'ERROR_INTERNO';

const HTTP: Record<CodigoError, number> = {
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  FUERA_DE_ALCANCE: 403,
  CSRF: 403,
  RATE_LIMIT: 429,
  VALIDACION: 422,
  CONFLICTO: 409,
  NO_ENCONTRADO: 404,
  RUNT_BLOQUEADO: 409,
  TRANSICION_INVALIDA: 409,
  ERROR_INTERNO: 500,
};

/** Cabeceras que impiden cachear datos personales en proxies o en el navegador. */
const SIN_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { ...init, headers: { ...SIN_CACHE, ...init?.headers } });
}

export function fallo(
  codigo: CodigoError,
  mensaje: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { codigo, mensaje, ...extra } },
    { status: HTTP[codigo], headers: SIN_CACHE },
  );
}

/** Error de dominio lanzable desde cualquier capa; el handler lo traduce a HTTP. */
export class ErrorDominio extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}
