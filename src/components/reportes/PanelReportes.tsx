'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, qs, FalloApi } from '@/lib/client/api';
import { Alerta, Cargando, Tarjeta, Vacio } from '@/components/ui/primitivos';
import TarjetasKpi from '@/components/dashboard/TarjetasKpi';
import type { KpiResumen, KpiRuntPdv, KpiSla } from '@/lib/reports/kpis';

interface Datos {
  periodo: { desde: string | null; hasta: string | null; etiqueta: string };
  resumen: KpiResumen;
  runtPorPdv: KpiRuntPdv[];
  sla: KpiSla[];
  serie: { semana: string; ventas: number; matriculas: number }[];
}

/** Dashboard de analitica para las revisiones de cada 8 dias y mensuales. */
export default function PanelReportes({ rol }: { rol: 'ASESOR' | 'ADMIN' }) {
  const [ventana, setVentana] = useState<'8' | '30' | 'todo'>('30');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await api.get<Datos>(`/api/reportes/kpis${qs({ ventana })}`));
    } catch (e) {
      setError(e instanceof FalloApi ? e.error.mensaje : 'No se pudieron cargar los indicadores.');
    }
  }, [ventana]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function sincronizar() {
    setSincronizando(true);
    setAvisoSync(null);
    try {
      const r = await api.post<{
        desdeSheets?: { leidas: number; creadas: number; actualizadas: number; errores: unknown[] };
        haciaSheets?: { actualizadas: number; creadas: number };
      }>('/api/sync/sheets', { direccion: 'AMBAS' });
      setAvisoSync(
        `Sincronizacion completa. Desde Sheets: ${r.desdeSheets?.creadas ?? 0} nuevas, ` +
          `${r.desdeSheets?.actualizadas ?? 0} actualizadas, ${r.desdeSheets?.errores.length ?? 0} con incidencia. ` +
          `Hacia Sheets: ${(r.haciaSheets?.creadas ?? 0) + (r.haciaSheets?.actualizadas ?? 0)} filas.`,
      );
      await cargar();
    } catch (e) {
      setAvisoSync(e instanceof FalloApi ? e.error.mensaje : 'La sincronizacion fallo.');
    } finally {
      setSincronizando(false);
    }
  }

  if (error) return <Alerta tono="error">{error}</Alerta>;
  if (!datos) return <Cargando texto="Calculando indicadores…" />;

  const maxSerie = Math.max(1, ...datos.serie.map((s) => s.ventas));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          {([
            ['8', 'Revision 8 dias'],
            ['30', 'Mensual'],
            ['todo', 'Historico'],
          ] as const).map(([k, txt]) => (
            <button
              key={k}
              onClick={() => setVentana(k)}
              className={clsx(
                'rounded-md px-3 py-1 text-xs font-semibold',
                ventana === k ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300',
              )}
            >
              {txt}
            </button>
          ))}
        </div>

        <a href={`/api/reportes/xlsx${qs({ tipo: 'KPIS' })}`} className="btn-secundario text-xs">
          Descargar indicadores .xlsx
        </a>

        {rol === 'ADMIN' && (
          <button onClick={sincronizar} className="btn-primario ml-auto text-xs" disabled={sincronizando}>
            {sincronizando ? 'Sincronizando…' : 'Sincronizar con Google Sheets'}
          </button>
        )}
      </div>

      {avisoSync && <Alerta tono="info">{avisoSync}</Alerta>}

      <TarjetasKpi resumen={datos.resumen} periodo={datos.periodo.etiqueta} />

      {/* ---------- RUNT por PDV ---------- */}
      <Tarjeta titulo="Clientes NO inscritos en RUNT por punto de venta">
        {datos.runtPorPdv.length === 0 ? (
          <Vacio mensaje="Sin datos." />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Ciudad correspondencia</th>
                  <th className="pb-2">Transito</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="pb-2 text-right">No inscritos</th>
                  <th className="pb-2">% no inscritos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {datos.runtPorPdv.map((f) => (
                  <tr key={f.puntoVentaId} className={f.pctNoInscritos >= 30 ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                    <td className="py-2 font-medium">{f.ciudadCorrespondencia}</td>
                    <td className="py-2 text-xs text-slate-500">{f.transito}</td>
                    <td className="tnum py-2 text-right">{f.total}</td>
                    <td className="tnum py-2 text-right font-bold text-red-700 dark:text-red-300">{f.noInscritos}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className={clsx(
                              'h-full rounded-full',
                              f.pctNoInscritos >= 30 ? 'bg-red-600' : f.pctNoInscritos >= 10 ? 'bg-amber-500' : 'bg-emerald-500',
                            )}
                            style={{ width: `${Math.min(100, f.pctNoInscritos)}%` }}
                          />
                        </div>
                        <span className="tnum text-xs font-bold">{f.pctNoInscritos}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {/* ---------- SLA ---------- */}
      <Tarjeta titulo="Tiempos promedio por tramitador y transito (SLA)">
        {datos.sla.length === 0 ? (
          <Vacio mensaje="Sin datos." />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Tramitador</th>
                  <th className="pb-2">Transito</th>
                  <th className="pb-2 text-right">Carpetas</th>
                  <th className="pb-2 text-right">Dias prom. total</th>
                  <th className="pb-2 text-right">Dias prom. transito</th>
                  <th className="pb-2 text-right">Demoradas (&gt;15d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {datos.sla.map((f) => (
                  <tr key={f.tramitadorId}>
                    <td className="py-2 font-medium">{f.tramitador}</td>
                    <td className="py-2 text-xs text-slate-500">{f.transito}</td>
                    <td className="tnum py-2 text-right">{f.carpetas}</td>
                    <td
                      className={clsx(
                        'tnum py-2 text-right font-semibold',
                        f.diasPromTotal > 20 ? 'text-red-700 dark:text-red-300' : f.diasPromTotal > 10 ? 'text-amber-700 dark:text-amber-300' : '',
                      )}
                    >
                      {f.diasPromTotal}
                    </td>
                    <td className="tnum py-2 text-right">{f.diasPromTransito}</td>
                    <td className="tnum py-2 text-right">
                      {f.demoradas > 0 ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800 dark:bg-red-950 dark:text-red-200">
                          {f.demoradas}
                        </span>
                      ) : (
                        0
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {/* ---------- Serie semanal ---------- */}
      <Tarjeta titulo="Ventas y matriculas por semana (ultimas 12)">
        {datos.serie.length === 0 ? (
          <Vacio mensaje="Sin datos." />
        ) : (
          <div className="scroll-x">
            <div className="flex min-w-[600px] items-end gap-3" style={{ height: 180 }}>
              {datos.serie.map((s) => (
                <div key={s.semana} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      className="w-3 rounded-t bg-brand-500"
                      style={{ height: `${(s.ventas / maxSerie) * 100}%` }}
                      title={`${s.ventas} ventas`}
                    />
                    <div
                      className="w-3 rounded-t bg-emerald-500"
                      style={{ height: `${(s.matriculas / maxSerie) * 100}%` }}
                      title={`${s.matriculas} matriculas`}
                    />
                  </div>
                  <span className="tnum text-[10px] text-slate-500">{s.semana.slice(5)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded bg-brand-500" /> Ventas
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded bg-emerald-500" /> Matriculas
              </span>
            </p>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
