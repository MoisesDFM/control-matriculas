'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { api, FalloApi } from '@/lib/client/api';
import { Alerta, Campo, Tarjeta } from '@/components/ui/primitivos';
import type { PuntoVenta } from '@/lib/domain/mapeo';

/**
 * Radicacion de la inscripcion al RUNT por parte del asesor. Crearla NO
 * habilita el RUNT: eso solo lo hace el administrador al validar.
 */
export default function FormularioSolicitud({
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
