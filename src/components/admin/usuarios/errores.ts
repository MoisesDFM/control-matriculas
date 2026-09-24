import { FalloApi } from '@/lib/client/api';

/** Reparte un fallo de la API entre errores por campo y aviso general. */
export function manejar(
  err: unknown,
  setErrores: (e: Record<string, string>) => void,
  setAviso: (a: { tono: 'error' | 'exito'; texto: string }) => void,
): void {
  if (err instanceof FalloApi) {
    if (err.error.campos?.length) {
      setErrores(Object.fromEntries(err.error.campos.map((c) => [c.campo, c.mensaje])));
      setAviso({ tono: 'error', texto: 'Revise los campos marcados.' });
    } else {
      setAviso({ tono: 'error', texto: err.error.mensaje });
    }
  } else {
    setAviso({ tono: 'error', texto: 'No se pudo completar la operacion.' });
  }
}
