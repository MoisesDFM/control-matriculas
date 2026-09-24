'use client';

import { useState } from 'react';

/** Alta de organismo de transito. */
export default function FormularioTransito({ onCrear }: { onCrear: (cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const [nombre, setNombre] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onCrear({ nombre })) setNombre('');
      }}
    >
      <input
        className="campo"
        maxLength={60}
        placeholder="Nombre del organismo de transito"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />
      <button type="submit" className="btn-secundario shrink-0 text-xs">
        Agregar
      </button>
    </form>
  );
}
