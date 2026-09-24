'use client';

import { useState } from 'react';
import type { UsuarioFila } from '@/lib/domain/admin.repo';

/** Edicion en linea del par (rol, punto de venta), que deben ser coherentes. */
export default function EditorAlcance({
  usuario,
  puntosVenta,
  onGuardar,
  onCancelar,
}: {
  usuario: UsuarioFila;
  puntosVenta: { id: number; ciudad_correspondencia: string }[];
  onGuardar: (cambios: Record<string, unknown>) => void;
  onCancelar: () => void;
}) {
  const [rol, setRol] = useState(usuario.rol);
  const [pdv, setPdv] = useState<number | ''>(usuario.punto_venta_id ?? '');

  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        className="campo w-auto py-1 text-xs"
        value={rol}
        onChange={(e) => {
          const r = e.target.value as 'ASESOR' | 'ADMIN';
          setRol(r);
          if (r === 'ADMIN') setPdv('');
        }}
      >
        <option value="ASESOR">ASESOR</option>
        <option value="ADMIN">ADMIN</option>
      </select>

      <select
        className="campo w-auto py-1 text-xs"
        value={pdv}
        onChange={(e) => setPdv(e.target.value ? Number(e.target.value) : '')}
        disabled={rol === 'ADMIN'}
      >
        <option value="">{rol === 'ADMIN' ? 'global' : 'Seleccione…'}</option>
        {puntosVenta.map((p) => (
          <option key={p.id} value={p.id}>
            {p.ciudad_correspondencia}
          </option>
        ))}
      </select>

      <button
        className="btn-primario px-2 py-1 text-xs"
        disabled={rol === 'ASESOR' && pdv === ''}
        onClick={() => onGuardar({ rol, puntoVentaId: rol === 'ADMIN' ? null : pdv })}
      >
        Guardar
      </button>
      <button className="btn-secundario px-2 py-1 text-xs" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}
