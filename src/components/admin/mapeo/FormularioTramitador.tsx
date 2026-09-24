'use client';

import { useState } from 'react';
import { Campo } from '@/components/ui/primitivos';
import type { Transito } from './tipos';

/** Alta de tramitador dentro de un organismo de transito. */
export default function FormularioTramitador({
  transitos,
  onCrear,
}: {
  transitos: Transito[];
  onCrear: (cuerpo: Record<string, unknown>) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState('');
  const [transitoId, setTransitoId] = useState<number | ''>('');
  const [telefono, setTelefono] = useState('');

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onCrear({ nombre, transitoId, telefono })) {
          setNombre('');
          setTelefono('');
          setTransitoId('');
        }
      }}
    >
      <Campo etiqueta="Nombre" requerido>
        <input className="campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Transito" requerido>
        <select
          className="campo"
          value={transitoId}
          onChange={(e) => setTransitoId(e.target.value ? Number(e.target.value) : '')}
          required
        >
          <option value="">Seleccione…</option>
          {transitos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Telefono">
        <input className="campo tnum" maxLength={20} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </Campo>
      <div className="flex items-end">
        <button type="submit" className="btn-primario w-full text-xs">
          Agregar tramitador
        </button>
      </div>
    </form>
  );
}
