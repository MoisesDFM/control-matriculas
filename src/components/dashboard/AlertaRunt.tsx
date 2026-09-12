import Link from 'next/link';

/**
 * Alerta visual destacada en ROJO por bloqueo de RUNT (requisito 4.2).
 * Se muestra en el tablero cuando existe al menos una carpeta con RUNT = No.
 * role="alert" para que los lectores de pantalla la anuncien de inmediato.
 */
export default function AlertaRunt({
  bloqueadas,
  puntoVenta,
}: {
  bloqueadas: number;
  puntoVenta: string | null;
}) {
  if (bloqueadas === 0) return null;

  return (
    <div
      role="alert"
      className="animate-pulse-danger rounded-xl border-2 border-red-600 bg-red-50 p-4 dark:bg-red-950/60"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-600 text-xl font-black text-white">
          !
        </span>

        <div className="flex-1">
          <p className="text-sm font-black uppercase tracking-wide text-red-800 dark:text-red-200">
            Tramite bloqueado · RUNT no verificado
          </p>
          <p className="mt-0.5 text-sm text-red-800 dark:text-red-100">
            <strong className="tnum">{bloqueadas}</strong>{' '}
            {bloqueadas === 1 ? 'carpeta' : 'carpetas'}
            {puntoVenta ? ` en ${puntoVenta}` : ''} no pueden pasar a{' '}
            <strong>En transito</strong> ni a estados posteriores.{' '}
            <span className="font-semibold">Ninguna carpeta se tramita sin RUNT verificado.</span>
          </p>
        </div>

        <Link
          href="/registros?soloBloqueados=true"
          className="btn-peligro shrink-0 whitespace-nowrap text-xs"
        >
          Ver bloqueadas
        </Link>
      </div>
    </div>
  );
}
