'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { api, qs, FalloApi } from '@/lib/client/api';
import type { RegistroVista } from '@/lib/domain/registros.repo';
import { ETIQUETA_ESTADO, FLUJO, colorSemaforo, puedeTransicionar, type Estado } from '@/lib/domain/estados';
import { Alerta, Cargando, Insignia, Vacio } from '@/components/ui/primitivos';

interface Respuesta {
  filas: RegistroVista[];
  total: number;
  pagina: number;
  paginas: number;
}

interface Props {
  rol: 'ASESOR' | 'ADMIN';
  puntosVenta: { id: number; ciudad_correspondencia: string }[];
  filtroInicial?: { soloBloqueados?: boolean; estado?: Estado };
}

/**
 * Tablero interactivo con dos vistas (Tabla / Kanban), semaforos de SLA e
 * indicadores rojos para bloqueo por RUNT y demoras en transito.
 * Las acciones de avance se deshabilitan con el MISMO predicado que usa el
 * backend (puedeTransicionar), de modo que la UI nunca ofrece algo que la API
 * vaya a rechazar.
 */
export default function Tablero({ rol, puntosVenta, filtroInicial }: Props) {
  const [vista, setVista] = useState<'tabla' | 'kanban'>('tabla');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'error' | 'exito'; texto: string } | null>(null);

  const [filtros, setFiltros] = useState({
    q: '',
    estado: filtroInicial?.estado ?? ('' as Estado | ''),
    runt: '' as '' | 'SI' | 'NO',
    puntoVentaId: '' as number | '',
    soloBloqueados: filtroInicial?.soloBloqueados ?? false,
    pagina: 1,
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await api.get<Respuesta>(
        `/api/registros${qs({
          q: filtros.q,
          estado: filtros.estado || undefined,
          runt: filtros.runt || undefined,
          puntoVentaId: filtros.puntoVentaId || undefined,
          soloBloqueados: filtros.soloBloqueados || undefined,
          pagina: filtros.pagina,
          porPagina: 50,
        })}`,
      );
      setDatos(r);
    } catch (e) {
      setError(e instanceof FalloApi ? e.error.mensaje : 'No se pudo cargar el tablero.');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function avanzar(r: RegistroVista, destino: Estado) {
    setAviso(null);
    try {
      await api.post(`/api/registros/${r.id}/estado`, { estado: destino, rowVersion: r.row_version, nota: '' });
      setAviso({ tono: 'exito', texto: `Registro actualizado a ${ETIQUETA_ESTADO[destino]}.` });
      await cargar();
    } catch (e) {
      const err = e instanceof FalloApi ? e.error : null;
      setAviso({
        tono: 'error',
        texto:
          err?.codigo === 'RUNT_BLOQUEADO'
            ? `BLOQUEADO POR RUNT · ${err.mensaje}`
            : (err?.mensaje ?? 'No se pudo cambiar el estado.'),
      });
    }
  }

  const bloqueadas = useMemo(() => datos?.filas.filter((f) => f.bloqueado_runt).length ?? 0, [datos]);

  return (
    <div className="space-y-4">
      {/* ---------- Filtros ---------- */}
      <div className="tarjeta grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          className="campo lg:col-span-2"
          placeholder="Buscar por nombre, cedula, placa o chasis"
          value={filtros.q}
          onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value, pagina: 1 }))}
        />
        <select
          className="campo"
          value={filtros.estado}
          onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as Estado | '', pagina: 1 }))}
        >
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="campo"
          value={filtros.runt}
          onChange={(e) => setFiltros((f) => ({ ...f, runt: e.target.value as '' | 'SI' | 'NO', pagina: 1 }))}
        >
          <option value="">RUNT: todos</option>
          <option value="NO">RUNT: No inscritos</option>
          <option value="SI">RUNT: Inscritos</option>
        </select>
        {rol === 'ADMIN' ? (
          <select
            className="campo"
            value={filtros.puntoVentaId}
            onChange={(e) =>
              setFiltros((f) => ({ ...f, puntoVentaId: e.target.value ? Number(e.target.value) : '', pagina: 1 }))
            }
          >
            <option value="">Todos los puntos de venta</option>
            {puntosVenta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ciudad_correspondencia}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
            Ve unicamente su punto de venta
          </div>
        )}
      </div>

      {/* ---------- Barra de estado ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
          {(['tabla', 'kanban'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                'rounded-md px-3 py-1 text-xs font-semibold capitalize',
                vista === v ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-red-600"
            checked={filtros.soloBloqueados}
            onChange={(e) => setFiltros((f) => ({ ...f, soloBloqueados: e.target.checked, pagina: 1 }))}
          />
          Solo bloqueadas por RUNT
        </label>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {datos ? `${datos.total} registros` : ''}
          {bloqueadas > 0 && (
            <strong className="ml-2 text-red-600 dark:text-red-400">{bloqueadas} bloqueadas en esta pagina</strong>
          )}
        </span>
        <a href={`/api/reportes/xlsx${qs({ tipo: 'REGISTROS', q: filtros.q, estado: filtros.estado || undefined })}`} className="btn-secundario text-xs">
          Descargar .xlsx
        </a>
      </div>

      {aviso && <Alerta tono={aviso.tono}>{aviso.texto}</Alerta>}
      {error && <Alerta tono="error">{error}</Alerta>}

      {cargando && !datos ? (
        <Cargando texto="Cargando registros..." />
      ) : !datos || datos.filas.length === 0 ? (
        <Vacio mensaje="No hay registros que coincidan con el filtro." />
      ) : vista === 'tabla' ? (
        <VistaTabla filas={datos.filas} rol={rol} onAvanzar={avanzar} />
      ) : (
        <VistaKanban filas={datos.filas} rol={rol} onAvanzar={avanzar} />
      )}

      {datos && datos.paginas > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="btn-secundario text-xs"
            disabled={datos.pagina <= 1}
            onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}
          >
            Anterior
          </button>
          <span className="tnum text-xs text-slate-500">
            Pagina {datos.pagina} de {datos.paginas}
          </span>
          <button
            className="btn-secundario text-xs"
            disabled={datos.pagina >= datos.paginas}
            onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ TABLA
function VistaTabla({
  filas,
  rol,
  onAvanzar,
}: {
  filas: RegistroVista[];
  rol: 'ASESOR' | 'ADMIN';
  onAvanzar: (r: RegistroVista, e: Estado) => void;
}) {
  return (
    <div className="tarjeta scroll-x">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Identificacion</th>
            <th className="px-3 py-2">Nombre y apellidos</th>
            <th className="px-3 py-2">Apertura</th>
            <th className="px-3 py-2">Ciudad corresp.</th>
            <th className="px-3 py-2">Vehiculo</th>
            <th className="px-3 py-2">Placa</th>
            <th className="px-3 py-2">SOAT</th>
            <th className="px-3 py-2">Matricula</th>
            <th className="px-3 py-2">RUNT</th>
            <th className="px-3 py-2">Transito / Tramitador</th>
            <th className="px-3 py-2">SLA</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Accion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas.map((r) => (
            <tr
              key={r.id}
              className={clsx(
                'align-top',
                r.bloqueado_runt
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
              )}
            >
              <td className="tnum px-3 py-2 font-medium">{r.col_a_identificacion}</td>
              <td className="max-w-[220px] px-3 py-2">{r.col_b_nombre}</td>
              <td className="tnum px-3 py-2 whitespace-nowrap">{r.col_c_fecha_apertura}</td>
              <td className="px-3 py-2 text-xs">{r.col_e_ciudad_correspondencia}</td>
              <td className="px-3 py-2 text-xs">
                {r.col_g_marca} {r.col_h_linea}
                <span className="tnum block text-slate-500">Mod. {r.col_i_modelo}</span>
              </td>
              <td className="px-3 py-2">
                {r.col_j_placa ? (
                  <span className="tnum font-mono font-semibold">
                    {r.col_j_placa}
                    {r.placa_preasignada && (
                      <span className="ml-1 text-[10px] font-bold text-amber-600">PRE</span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="tnum px-3 py-2 whitespace-nowrap text-xs">{r.col_k_soat ?? '—'}</td>
              <td className="tnum px-3 py-2 whitespace-nowrap text-xs">{r.col_l_fecha_matricula ?? '—'}</td>
              <td className="px-3 py-2">
                {r.runt === 'SI' ? (
                  <Insignia tono="verde">Si</Insignia>
                ) : (
                  <Insignia tono="rojo">No</Insignia>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.transito}
                <span className="block text-slate-500">{r.tramitador}</span>
              </td>
              <td className="px-3 py-2">
                <span className={clsx('insignia tnum', colorSemaforo(r.semaforo))}>
                  {r.dias_desde_apertura}d
                  {r.dias_en_transito !== null && ` · ${r.dias_en_transito}d tr.`}
                </span>
              </td>
              <td className="px-3 py-2 text-xs font-semibold">{ETIQUETA_ESTADO[r.estado]}</td>
              <td className="px-3 py-2">
                <AccionesEstado registro={r} rol={rol} onAvanzar={onAvanzar} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------- KANBAN
function VistaKanban({
  filas,
  rol,
  onAvanzar,
}: {
  filas: RegistroVista[];
  rol: 'ASESOR' | 'ADMIN';
  onAvanzar: (r: RegistroVista, e: Estado) => void;
}) {
  return (
    <div className="scroll-x pb-2">
      <div className="flex gap-3" style={{ minWidth: `${FLUJO.length * 264}px` }}>
        {FLUJO.map((estado) => {
          const grupo = filas.filter((f) => f.estado === estado);
          const bloq = grupo.filter((f) => f.bloqueado_runt).length;
          return (
            <div key={estado} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wide">{ETIQUETA_ESTADO[estado]}</span>
                <span className="tnum text-xs font-bold text-slate-500">{grupo.length}</span>
              </div>
              {bloq > 0 && (
                <p className="mb-2 rounded-md bg-red-100 px-2 py-1 text-[11px] font-bold text-red-800 dark:bg-red-950 dark:text-red-200">
                  {bloq} sin RUNT
                </p>
              )}
              <div className="space-y-2">
                {grupo.map((r) => (
                  <article
                    key={r.id}
                    className={clsx(
                      'tarjeta border p-3',
                      r.bloqueado_runt ? 'border-red-400 bg-red-50 dark:bg-red-950/40' : '',
                    )}
                  >
                    <p className="truncate text-sm font-semibold">{r.col_b_nombre}</p>
                    <p className="tnum text-xs text-slate-500">{r.col_a_identificacion}</p>
                    <p className="mt-1 text-xs">
                      {r.col_g_marca} {r.col_h_linea}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className={clsx('insignia tnum', colorSemaforo(r.semaforo))}>
                        {r.dias_desde_apertura}d
                      </span>
                      {r.bloqueado_runt && <Insignia tono="rojo">RUNT No</Insignia>}
                      {r.col_j_placa && <Insignia tono="azul">{r.col_j_placa}</Insignia>}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {r.transito} · {r.tramitador}
                    </p>
                    <div className="mt-2">
                      <AccionesEstado registro={r} rol={rol} onAvanzar={onAvanzar} />
                    </div>
                  </article>
                ))}
                {grupo.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
                    Sin carpetas
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- ACCIONES
function AccionesEstado({
  registro,
  rol,
  onAvanzar,
}: {
  registro: RegistroVista;
  rol: 'ASESOR' | 'ADMIN';
  onAvanzar: (r: RegistroVista, e: Estado) => void;
}) {
  const indice = FLUJO.indexOf(registro.estado);
  const siguiente = indice >= 0 && indice < FLUJO.length - 1 ? FLUJO[indice + 1] : null;
  if (!siguiente) return <span className="text-xs text-slate-400">—</span>;

  const veredicto = puedeTransicionar({
    actual: registro.estado,
    destino: siguiente,
    runt: registro.runt,
    rol,
    placa: registro.col_j_placa,
    placaPreasignada: registro.placa_preasignada,
    fechaMatricula: registro.col_l_fecha_matricula,
  });

  return (
    <button
      onClick={() => onAvanzar(registro, siguiente)}
      disabled={!veredicto.permitido}
      title={veredicto.motivo}
      className={clsx(
        'btn w-full whitespace-nowrap px-2 py-1 text-[11px]',
        veredicto.permitido
          ? 'bg-brand-600 text-white hover:bg-brand-700'
          : veredicto.codigo === 'RUNT_BLOQUEADO'
            ? 'cursor-not-allowed border border-red-400 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
            : 'cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800',
      )}
    >
      {veredicto.codigo === 'RUNT_BLOQUEADO' ? 'Bloqueado: sin RUNT' : `→ ${ETIQUETA_ESTADO[siguiente]}`}
    </button>
  );
}
