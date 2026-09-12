'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, FalloApi } from '@/lib/client/api';
import { Alerta } from '@/components/ui/primitivos';

export default function FormularioLogin({ destino }: { destino: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.post('/api/auth/login', { email, password });
      router.replace(destino);
      router.refresh();
    } catch (err) {
      setError(err instanceof FalloApi ? err.error.mensaje : 'No se pudo iniciar sesion.');
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="tarjeta space-y-4 p-6" noValidate>
      {error && <Alerta tono="error">{error}</Alerta>}

      <label className="block">
        <span className="etiqueta">Correo institucional</span>
        <input
          type="email"
          name="email"
          className="campo"
          autoComplete="username"
          required
          autoFocus
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="asesor@nechimotos.com"
        />
      </label>

      <label className="block">
        <span className="etiqueta">Contraseña</span>
        <div className="relative">
          <input
            type={verClave ? 'text' : 'password'}
            name="password"
            className="campo pr-16"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {verClave ? 'Ocultar' : 'Ver'}
          </button>
        </div>
      </label>

      <button type="submit" className="btn-primario w-full" disabled={enviando}>
        {enviando ? 'Verificando...' : 'Ingresar'}
      </button>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.
      </p>
    </form>
  );
}
