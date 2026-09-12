import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Tarjeta({
  titulo,
  accion,
  children,
  className,
}: {
  titulo?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('tarjeta', className)}>
      {(titulo || accion) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {titulo && <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</h2>}
          {accion}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Insignia({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'rojo' | 'ambar' | 'verde' | 'azul' | 'naranja';
}) {
  const tonos = {
    neutro: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
    rojo: 'bg-red-100 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-900',
    ambar: 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900',
    naranja: 'bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-900',
    verde: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900',
    azul: 'bg-brand-100 text-brand-800 ring-brand-200 dark:bg-brand-900 dark:text-brand-100 dark:ring-brand-800',
  } as const;
  return <span className={clsx('insignia', tonos[tono])}>{children}</span>;
}

export function Alerta({
  tono = 'info',
  titulo,
  children,
  className,
}: {
  tono?: 'info' | 'error' | 'exito' | 'aviso';
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tonos = {
    info: 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-50',
    error: 'border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100',
    aviso: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100',
    exito: 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100',
  } as const;

  return (
    <div role={tono === 'error' ? 'alert' : 'status'} className={clsx('rounded-lg border px-4 py-3 text-sm', tonos[tono], className)}>
      {titulo && <p className="mb-0.5 font-bold">{titulo}</p>}
      {children}
    </div>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  requerido,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="etiqueta">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{ayuda}</span>
      ) : null}
    </label>
  );
}

export function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{mensaje}</p>
  );
}

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {texto}
    </div>
  );
}
