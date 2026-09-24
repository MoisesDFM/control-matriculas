'use client';

import { useState } from 'react';
import { Campo } from '@/components/ui/primitivos';
import type { TramitadorFila } from '@/lib/domain/admin.repo';

/** Alta de punto de venta. El transito se hereda del tramitador elegido. */
export default function FormularioPdv({
  tramitadores,
  onCrear,
}: {
  tramitadores: TramitadorFila[];
  onCrear: (cuerpo: Record<string, unknown>) => Promise<boolean>;
}) {
  const [ciudad, setCiudad] = useState('');
  const [tramitadorId, setTramitadorId] = useState<number | ''>('');
  const [pre, setPre] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onCrear({ ciudadCorrespondencia: ciudad, tramitadorId, permitePreasignacion: pre })) {
          setCiudad('');
          setTramitadorId('');
          setPre(false);
        }
      }}
    >
      <Campo etiqueta="Ciudad correspondencia" requerido ayuda="Debe coincidir con la columna E del Excel">
        <input
          className="campo uppercase"
          maxLength={60}
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value.toUpperCase())}
          required
        />
      </Campo>
      <Campo etiqueta="Tramitador" requerido ayuda="El transito se hereda del tramitador">
        <select
          className="campo"
          value={tramitadorId}
          onChange={(e) => setTramitadorId(e.target.value ? Number(e.target.value) : '')}
          required
        >
          <option value="">Seleccione…</option>
          {tramitadores.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} · {t.transito}
            </option>
          ))}
        </select>
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-600"
          checked={pre}
          onChange={(e) => setPre(e.target.checked)}
        />
        Permite preasignacion de placa
      </label>
      <button type="submit" className="btn-primario w-full text-xs">
        Crear punto de venta
      </button>
    </form>
  );
}
