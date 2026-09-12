'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, qs, FalloApi } from '@/lib/client/api';
import { Alerta, Campo, Cargando, Insignia, Tarjeta, Vacio } from '@/components/ui/primitivos';
import type { PuntoVenta } from '@/lib/domain/mapeo';

interface Solicitud {
  id: string;
  numero_identificacion: string;
  nombre_completo: string;
  direccion_barrio: string;
  telefono: string;
  correo: string;
  cedula_url: string;
  cedula_mime: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  motivo_rechazo: string | null;
  punto_venta: string;
  fecha_solicitud: string;
  fecha_revision: string | null;
  solicitado_por: string;
  revisado_por: string | null;
}

/**
 * Modulo de inscripcion al RUNT (requisito 4.3).
 *  - Asesor: radica la solicitud (PDV, direccion/barrio, telefono, correo y
 *    adjunto de la cedula) y consulta el estado de las suyas.
 *  - Administrador: valida o rechaza. Aprobar es lo unico que pone RUNT = Si.
 */
export default function PanelRunt({
  rol,
  puntosVenta,
}: {
  rol: 'ASESOR' | 'ADMIN';
  puntosVenta: PuntoVenta[];
}) {
  const [filas, setFilas] = useState<Solicitud[] | null>(null);
  const [filtro, setFiltro] = useState<'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | ''>('PENDIENTE');
  const [aviso, setAviso] = useState<{ tono: 'error' | 'exito'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get<{ filas: Solicitud[] }>(`/api/runt/solicitudes${qs({ estado: filtro || undefined })}`);
      setFilas(r.filas);
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof FalloApi ? e.error.mensaje : 'No se pudo cargar el listado.' });
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function decidir(id: string, decision: 'APROBAR' | 'RECHAZAR') {
    let motivo = '';
    if (decision === 'RECHAZAR') {
      motivo = window.prompt('Motivo del rechazo (minimo 5 caracteres):')?.trim() ?? '';
      if (motivo.length < 5) return;
    }
    try {
      const r = await api.patch<{ mensaje: string }>(
        `/api/runt/solicitudes/${id}`,
        decision === 'APROBAR' ? { decision } : { decision, motivo },
      );
      setAviso({ tono: 'exito', texto: r.mensaje });
      await cargar();
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof FalloApi ? e.error.mensaje : 'No se pudo procesar.' });
    }
  }

  return (
    <div className="space-y-4">
      {aviso && <Alerta tono={aviso.tono}>{aviso.texto}</Alerta>}

      {rol === 'ASESOR' && <FormularioSolicitud puntosVenta={puntosVenta} onCreada={cargar} />}

      <Tarjeta
        titulo={rol === 'ADMIN' ? 'Solicitudes por validar' : 'Mis solicitudes'}
        accion={
          <select className="campo w-auto py-1 text-xs" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
            <option value="PENDIENTE">Pendientes</option>
            <option value="APROBADA">Aprobadas</option>
            <option value="RECHAZADA">Rechazadas</option>
            <option value="">Todas</option>
          </select>
        }
      >
        {filas === null ? (
          <Cargando />
        ) : filas.length === 0 ? (
          <Vacio mensaje="No hay solicitudes en este estado." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.nombre_completo}</p>
                  <p className="tnum text-xs text-slate-500">
                    CC {s.numero_identificacion} · {s.punto_venta} · radicada {s.fecha_solicitud}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {s.direccion_barrio} · Tel. {s.telefono} · {s.correo}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Radicada por {s.solicitado_por}</p>
                  {s.motivo_rechazo && (
                    <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
                      Rechazo: {s.motivo_rechazo}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <a
                    href={s.cedula_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn-secundario px-2 py-1 text-xs"
                  >
                    Ver cedula
                  </a>
                  {s.estado === 'PENDIENTE' ? (
                    rol === 'ADMIN' ? (
                      <>
                        <button onClick={() => decidir(s.id, 'APROBAR')} className="btn-primario px-2 py-1 text-xs">
                          Validar RUNT
                        </button>
                        <button onClick={() => decidir(s.id, 'RECHAZAR')} className="btn-peligro px-2 py-1 text-xs">
                          Rechazar
                        </button>
                      </>
                    ) : (
                      <Insignia tono="ambar">En revision</Insignia>
                    )
                  ) : (
                    <Insignia tono={s.estado === 'APROBADA' ? 'verde' : 'rojo'}>
                      {s.estado === 'APROBADA' ? 'RUNT validado' : 'Rechazada'}
                      {s.fecha_revision ? ` · ${s.fecha_revision}` : ''}
                    </Insignia>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

// ------------------------------------------------------------- formulario
function FormularioSolicitud({
  puntosVenta,
  onCreada,
}: {
  puntosVenta: PuntoVenta[];
  onCreada: () => void | Promise<void>;
}) {
  const unico = puntosVenta.length === 1 ? puntosVenta[0]! : null;
  const inicial = {
    puntoVentaId: unico ? unico.id : ('' as number | ''),
    numeroIdentificacion: '',
    nombreCompleto: '',
    direccionBarrio: '',
    telefono: '',
    correo: '',
    cedulaUrl: '',
  };

  const [v, setV] = useState(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tono: 'error' | 'exito'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErrores({});
    setEnviando(true);
    try {
      await api.post('/api/runt/solicitudes', v);
      setMsg({ tono: 'exito', texto: 'Solicitud radicada. Queda pendiente de validacion por el administrador.' });
      setV(inicial);
      await onCreada();
    } catch (err) {
      if (err instanceof FalloApi) {
        if (err.error.campos?.length) {
          setErrores(Object.fromEntries(err.error.campos.map((c) => [c.campo, c.mensaje])));
          setMsg({ tono: 'error', texto: 'Revise los campos marcados.' });
        } else {
          setMsg({ tono: 'error', texto: err.error.mensaje });
        }
      } else {
        setMsg({ tono: 'error', texto: 'No se pudo radicar la solicitud.' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta titulo="Solicitar inscripcion al RUNT">
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {msg && <Alerta tono={msg.tono}>{msg.texto}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta="Punto de venta" requerido error={errores.puntoVentaId}>
            <select
              className="campo"
              value={v.puntoVentaId}
              onChange={(e) => setV({ ...v, puntoVentaId: e.target.value ? Number(e.target.value) : '' })}
              disabled={Boolean(unico)}
              required
            >
              <option value="">Seleccione…</option>
              {puntosVenta.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ciudad_correspondencia}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Cedula del cliente" requerido error={errores.numeroIdentificacion}>
            <input
              className={clsx('campo tnum', errores.numeroIdentificacion && 'campo-error')}
              inputMode="numeric"
              maxLength={20}
              value={v.numeroIdentificacion}
              onChange={(e) => setV({ ...v, numeroIdentificacion: e.target.value.toUpperCase() })}
              required
            />
          </Campo>

          <Campo etiqueta="Nombre completo" requerido error={errores.nombreCompleto}>
            <input
              className={clsx('campo', errores.nombreCompleto && 'campo-error')}
              maxLength={160}
              value={v.nombreCompleto}
              onChange={(e) => setV({ ...v, nombreCompleto: e.target.value })}
              required
            />
          </Campo>

          <Campo etiqueta="Direccion y barrio" requerido error={errores.direccionBarrio}>
            <input
              className={clsx('campo', errores.direccionBarrio && 'campo-error')}
              maxLength={160}
              value={v.direccionBarrio}
              onChange={(e) => setV({ ...v, direccionBarrio: e.target.value })}
              required
            />
          </Campo>

          <Campo etiqueta="Telefono" requerido error={errores.telefono}>
            <input
              className={clsx('campo tnum', errores.telefono && 'campo-error')}
              inputMode="tel"
              maxLength={20}
              value={v.telefono}
              onChange={(e) => setV({ ...v, telefono: e.target.value })}
              required
            />
          </Campo>

          <Campo etiqueta="Correo del cliente" requerido error={errores.correo}>
            <input
              type="email"
              className={clsx('campo', errores.correo && 'campo-error')}
              maxLength={120}
              value={v.correo}
              onChange={(e) => setV({ ...v, correo: e.target.value })}
              required
            />
          </Campo>

          <Campo
            etiqueta="Foto de la cedula (enlace)"
            requerido
            ayuda="Suba la imagen al almacenamiento autorizado y pegue aqui el enlace"
            error={errores.cedulaUrl}
          >
            <input
              type="url"
              className={clsx('campo lg:col-span-2', errores.cedulaUrl && 'campo-error')}
              maxLength={600}
              placeholder="https://…"
              value={v.cedulaUrl}
              onChange={(e) => setV({ ...v, cedulaUrl: e.target.value })}
              required
            />
          </Campo>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primario" disabled={enviando}>
            {enviando ? 'Radicando…' : 'Radicar solicitud'}
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}
