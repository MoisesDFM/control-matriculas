import clsx from 'clsx';
import type { KpiResumen } from '@/lib/reports/kpis';

interface Tarjeta {
  etiqueta: string;
  valor: number | string;
  pie?: string;
  tono: 'neutro' | 'verde' | 'ambar' | 'rojo' | 'azul';
}

const TONOS = {
  neutro: 'border-slate-200 dark:border-slate-800',
  azul: 'border-brand-300 dark:border-brand-800',
  verde: 'border-emerald-300 dark:border-emerald-800',
  ambar: 'border-amber-300 dark:border-amber-800',
  rojo: 'border-red-400 bg-red-50 dark:bg-red-950/40 dark:border-red-800',
} as const;

const VALOR = {
  neutro: 'text-slate-900 dark:text-white',
  azul: 'text-brand-700 dark:text-brand-200',
  verde: 'text-emerald-700 dark:text-emerald-300',
  ambar: 'text-amber-700 dark:text-amber-300',
  rojo: 'text-red-700 dark:text-red-300',
} as const;

/** Resumen global del requisito 6.1, mas el indicador critico de bloqueos. */
export default function TarjetasKpi({ resumen, periodo }: { resumen: KpiResumen; periodo: string }) {
  const tarjetas: Tarjeta[] = [
    { etiqueta: 'Ventas realizadas', valor: resumen.totalVentas, pie: periodo, tono: 'azul' },
    {
      etiqueta: 'Matriculas ejecutadas',
      valor: resumen.matriculasEjecutadas,
      pie: `${resumen.pctCumplimiento}% de cumplimiento`,
      tono: 'verde',
    },
    { etiqueta: 'Pendientes', valor: resumen.pendientes, pie: `${resumen.enTransito} en transito`, tono: 'ambar' },
    { etiqueta: 'SOAT expedidos', valor: resumen.soatsExpedidos, tono: 'neutro' },
    {
      etiqueta: 'Bloqueadas por RUNT',
      valor: resumen.bloqueadosRunt,
      pie: resumen.bloqueadosRunt > 0 ? 'No se tramitan hasta validar' : 'Sin bloqueos',
      tono: resumen.bloqueadosRunt > 0 ? 'rojo' : 'verde',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tarjetas.map((t) => (
        <div key={t.etiqueta} className={clsx('tarjeta border p-4', TONOS[t.tono])}>
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">
            {t.etiqueta}
          </p>
          <p className={clsx('tnum mt-1 text-2xl font-black tabular-nums sm:text-3xl', VALOR[t.tono])}>{t.valor}</p>
          {t.pie && <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{t.pie}</p>}
        </div>
      ))}
    </div>
  );
}
