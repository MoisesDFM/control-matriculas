'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, FalloApi } from '@/lib/client/api';
import { Alerta, Cargando, Insignia, Tarjeta, Vacio } from '@/components/ui/primitivos';
import SelectorTramitador from './mapeo/SelectorTramitador';
import FormularioTramitador from './mapeo/FormularioTramitador';
import FormularioPdv from './mapeo/FormularioPdv';
import FormularioTransito from './mapeo/FormularioTransito';
import type { Transito } from './mapeo/tipos';
import type { PuntoVentaAdmin, TramitadorFila } from '@/lib/domain/admin.repo';

/**
 * Mapeo CIUDAD CORRESPONDENCIA → TRANSITO → TRAMITADOR y catalogo de
 * tramitadores. Es la regla de negocio 4.1 editable como dato: reasignar un
 * tramitador no requiere desplegar.
 */
export default function PanelMapeo() {
  const [pdvs, setPdvs] = useState<PuntoVentaAdmin[] | null>(null);
  const [tramitadores, setTramitadores] = useState<TramitadorFila[] | null>(null);
  const [transitos, setTransitos] = useState<Transito[] | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'error' | 'exito'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [p, t, tr] = await Promise.all([
        api.get<{ filas: PuntoVentaAdmin[] }>('/api/admin/puntos-venta'),
        api.get<{ filas: TramitadorFila[] }>('/api/admin/tramitadores'),
        api.get<{ filas: Transito[] }>('/api/admin/transitos'),
      ]);
      setPdvs(p.filas);
      setTramitadores(t.filas);
      setTransitos(tr.filas);
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof FalloApi ? e.error.mensaje : 'No se pudo cargar la configuracion.' });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function enviar(url: string, metodo: 'post' | 'patch', cuerpo: Record<string, unknown>) {
    setAviso(null);
    try {
      const r = await api[metodo]<{ mensaje?: string }>(url, cuerpo);
      setAviso({ tono: 'exito', texto: r.mensaje ?? 'Cambios guardados.' });
      await cargar();
      return true;
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof FalloApi ? e.error.mensaje : 'No se pudo guardar.' });
      return false;
    }
  }

  if (pdvs === null || tramitadores === null || transitos === null) return <Cargando texto="Cargando configuracion…" />;

  const activos = tramitadores.filter((t) => t.activo);

  return (
    <div className="space-y-4">
      {aviso && <Alerta tono={aviso.tono}>{aviso.texto}</Alerta>}

      {/* ------------------- Mapeo por sede ------------------- */}
      <Tarjeta titulo="Mapeo por ciudad de correspondencia">
        {pdvs.length === 0 ? (
          <Vacio mensaje="No hay puntos de venta." />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Ciudad correspondencia</th>
                  <th className="pb-2">Transito</th>
                  <th className="pb-2">Tramitador asignado</th>
                  <th className="pb-2 text-right">Carpetas</th>
                  <th className="pb-2">Preasignacion</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pdvs.map((p) => (
                  <tr key={p.id} className={clsx(!p.activo && 'opacity-60')}>
                    <td className="py-2">
                      <p className="font-semibold">{p.ciudad_correspondencia}</p>
                      <p className="text-xs text-slate-500">
                        {p.asesores} asesor(es) activo(s)
                      </p>
                    </td>
                    <td className="py-2 text-xs">{p.transito}</td>
                    <td className="py-2">
                      <SelectorTramitador
                        puntoVenta={p}
                        tramitadores={activos}
                        onAsignar={(tramitadorId, reasignarAbiertas) =>
                          enviar(`/api/admin/puntos-venta/${p.id}`, 'patch', { tramitadorId, reasignarAbiertas })
                        }
                      />
                    </td>
                    <td className="tnum py-2 text-right text-xs">
                      {p.registros}
                      <span className="block text-slate-500">{p.abiertas} abiertas</span>
                    </td>
                    <td className="py-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                          checked={p.permite_preasignacion}
                          onChange={(e) =>
                            enviar(`/api/admin/puntos-venta/${p.id}`, 'patch', {
                              permitePreasignacion: e.target.checked,
                            })
                          }
                        />
                        {p.permite_preasignacion ? 'Permitida' : 'No'}
                      </label>
                    </td>
                    <td className="py-2">
                      {p.activo ? (
                        <button
                          className="btn-secundario px-2 py-1 text-xs"
                          onClick={() => enviar(`/api/admin/puntos-venta/${p.id}`, 'patch', { activo: false })}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          className="btn-secundario px-2 py-1 text-xs"
                          onClick={() => enviar(`/api/admin/puntos-venta/${p.id}`, 'patch', { activo: true })}
                        >
                          Reactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Al reasignar, las carpetas ya matriculadas o entregadas conservan su tramitador historico. Las abiertas se
          re-mapean solo si lo confirma.
        </p>
      </Tarjeta>

      {/* ------------------- Tramitadores ------------------- */}
      <Tarjeta titulo="Tramitadores">
        <FormularioTramitador
          transitos={transitos.filter((t) => t.activo)}
          onCrear={(cuerpo) => enviar('/api/admin/tramitadores', 'post', cuerpo)}
        />

        {tramitadores.length === 0 ? (
          <Vacio mensaje="No hay tramitadores." />
        ) : (
          <div className="scroll-x mt-4">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Tramitador</th>
                  <th className="pb-2">Transito</th>
                  <th className="pb-2">Telefono</th>
                  <th className="pb-2 text-right">Sedes</th>
                  <th className="pb-2 text-right">Carpetas abiertas</th>
                  <th className="pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tramitadores.map((t) => (
                  <tr key={t.id} className={clsx(!t.activo && 'opacity-60')}>
                    <td className="py-2 font-semibold">
                      {t.nombre}
                      {!t.activo && (
                        <span className="ml-2">
                          <Insignia tono="rojo">Inactivo</Insignia>
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <select
                        className="campo w-auto py-1 text-xs"
                        value={t.transito_id}
                        onChange={(e) =>
                          enviar(`/api/admin/tramitadores/${t.id}`, 'patch', { transitoId: Number(e.target.value) })
                        }
                      >
                        {transitos.map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="tnum py-2 text-xs">{t.telefono ?? '—'}</td>
                    <td className="tnum py-2 text-right text-xs">{t.puntos_venta}</td>
                    <td className="tnum py-2 text-right text-xs font-semibold">{t.carpetas_abiertas}</td>
                    <td className="py-2 text-right">
                      {t.activo ? (
                        <button
                          className="btn-peligro px-2 py-1 text-xs"
                          title={t.puntos_venta > 0 ? 'Reasigne primero las sedes que dependen de este tramitador' : undefined}
                          onClick={() => enviar(`/api/admin/tramitadores/${t.id}`, 'patch', { activo: false })}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          className="btn-secundario px-2 py-1 text-xs"
                          onClick={() => enviar(`/api/admin/tramitadores/${t.id}`, 'patch', { activo: true })}
                        >
                          Reactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {/* ------------------- Sedes y transitos ------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Nuevo punto de venta">
          <FormularioPdv
            tramitadores={activos}
            onCrear={(cuerpo) => enviar('/api/admin/puntos-venta', 'post', cuerpo)}
          />
        </Tarjeta>

        <Tarjeta titulo="Organismos de transito">
          <FormularioTransito onCrear={(cuerpo) => enviar('/api/admin/transitos', 'post', cuerpo)} />
          <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {transitos.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{t.nombre}</span>
                <span className="tnum text-xs text-slate-500">{t.tramitadores} tramitador(es)</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}
