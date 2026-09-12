/**
 * Contrato de fechas del sistema: TODA fecha se lee, procesa, transporta y
 * muestra como YYYY/MM/DD. Internamente PostgreSQL usa DATE; en la frontera
 * HTTP viaja como string 'YYYY/MM/DD' (nunca como Date de JS, para no
 * arrastrar husos horarios que corren el dia).
 */

export const FORMATO_FECHA = 'YYYY/MM/DD';
const RE_ISO_SLASH = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/** Valida y normaliza a YYYY/MM/DD. Devuelve null si no es una fecha real. */
export function normalizarFecha(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date) return deDate(v);

  if (typeof v === 'number') {
    // Serial de Excel (base 1899-12-30)
    const ms = Date.UTC(1899, 11, 30) + v * 86_400_000;
    return deDate(new Date(ms));
  }

  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;

  let a: number | undefined, m: number | undefined, d: number | undefined;

  const slash = RE_ISO_SLASH.exec(s);
  if (slash) {
    [, a, m, d] = slash.map(Number) as [number, number, number, number];
  } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    [a, m, d] = s.slice(0, 10).split('-').map(Number) as [number, number, number];
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) {
    const [dd, mm, aa] = s.split(/[/-]/).map(Number) as [number, number, number];
    a = aa; m = mm; d = dd;
  } else {
    return null;
  }

  if (!esFechaReal(a!, m!, d!)) return null;
  return `${pad(a!, 4)}/${pad(m!, 2)}/${pad(d!, 2)}`;
}

/** 'YYYY/MM/DD' -> 'YYYY-MM-DD' (formato que acepta el driver de PostgreSQL). */
export function aISO(fecha: string | null): string | null {
  if (!fecha) return null;
  const n = normalizarFecha(fecha);
  return n ? n.replace(/\//g, '-') : null;
}

/** DATE de PostgreSQL (Date o string) -> 'YYYY/MM/DD'. */
export function aTexto(v: Date | string | null): string | null {
  if (!v) return null;
  return v instanceof Date ? deDate(v) : normalizarFecha(v);
}

/** 'YYYY/MM/DD' -> 'YYYY-MM-DD' para <input type="date"> y vuelta. */
export const aInputDate = (f: string | null) => (f ? f.replace(/\//g, '-') : '');
export const deInputDate = (f: string) => normalizarFecha(f);

export function hoy(): string {
  return deDate(new Date());
}

export function diasEntre(desde: string, hasta: string = hoy()): number {
  const a = Date.parse(aISO(desde) ?? '');
  const b = Date.parse(aISO(hasta) ?? '');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function deDate(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}/${pad(d.getUTCMonth() + 1, 2)}/${pad(d.getUTCDate(), 2)}`;
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function esFechaReal(a: number, m: number, d: number): boolean {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
