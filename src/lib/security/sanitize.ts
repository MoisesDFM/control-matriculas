/**
 * Saneamiento de entradas. React ya escapa por defecto al renderizar, y todas
 * las consultas van parametrizadas; esto es la tercera capa: normalizar y
 * rechazar basura antes de que llegue al dominio.
 *
 * Nota: en el proyecto NO se usa dangerouslySetInnerHTML en ningun componente.
 */

const CONTROL = /[\u0000-\u001F\u007F]/g;
/** Caracteres con los que empieza una formula en Excel/Sheets (CSV injection). */
const FORMULA = /^[=+\-@\t\r]/;

export function limpiarTexto(v: unknown, maxLen = 500): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export function limpiarMayusculas(v: unknown, maxLen = 60): string {
  return limpiarTexto(v, maxLen).toUpperCase();
}

/**
 * Neutraliza inyeccion de formulas al exportar a XLSX / escribir en Sheets:
 * un valor como =IMPORTXML(...) ejecutandose en la hoja del administrador
 * podria filtrar datos a un servidor externo.
 */
export function celdaSegura(v: string | number | null | undefined): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = v.replace(CONTROL, '');
  return FORMULA.test(s) ? `'${s}` : s;
}

/** Etiquetas seguras para mostrar texto libre proveniente de Sheets. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
