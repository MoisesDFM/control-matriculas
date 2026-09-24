'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { api, qs, FalloApi } from '@/lib/client/api';
import type { RegistroVista } from '@/lib/domain/registros.repo';
import { ETIQUETA_ESTADO, type Estado } from '@/lib/domain/estados';
import VistaTabla from './tablero/VistaTabla';
import VistaKanban from './tablero/VistaKanban';
import { Alerta, Cargando, Vacio } from '@/components/ui/primitivos';

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
