'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, FalloApi } from '@/lib/client/api';
import { Alerta, Campo, Cargando, Insignia, Tarjeta, Vacio } from '@/components/ui/primitivos';
import type { UsuarioFila } from '@/lib/domain/admin.repo';

interface Props {
  puntosVenta: { id: number; ciudad_correspondencia: string }[];
  usuarioActualId: string;
}

const VACIO = {
  email: '',
  nombre: '',
  rol: 'ASESOR' as 'ASESOR' | 'ADMIN',
  puntoVentaId: '' as number | '',
  password: '',
};

/**
 * Gestion de cuentas. No hay autoregistro en la plataforma: este panel y el
 * script scripts/create-user.mjs son las unicas vias de alta.
 */
export default function PanelUsuarios({ puntosVenta, usuarioActualId }: Props) {
  const [filas, setFilas] = useState<UsuarioFila[] | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'error' | 'exito'; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get<{ filas: UsuarioFila[] }>('/api/admin/usuarios');
      setFilas(r.filas);
    } catch (e) {
      setAviso({ tono: 'error', texto: e instanceof FalloApi ? e.error.mensaje : 'No se pudo cargar el listado.' });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    setErrores({});
    setEnviando(true);
    try {
      await api.post('/api/admin/usuarios', {
        email: nuevo.email,
        nombre: nuevo.nombre,
        rol: nuevo.rol,
        puntoVentaId: nuevo.rol === 'ASESOR' ? nuevo.puntoVentaId : null,
        password: nuevo.password,
      });
      setAviso({
        tono: 'exito',
        texto: `Usuario ${nuevo.email} creado. Entreguele la contraseña por un canal seguro y pidale cambiarla.`,
      });
      setNuevo(VACIO);
      await cargar();
    } catch (err) {
      manejar(err, setErrores, setAviso);
    } finally {
      setEnviando(false);
    }
  }

  async function parchear(id: string, cambios: Record<string, unknown>, confirmacion?: string) {
    if (confirmacion && !window.confirm(confirmacion)) return;
    setAviso(null);
    try {
      const r = await api.patch<{ mensaje: string }>(`/api/admin/usuarios/${id}`, cambios);
      setAviso({ tono: 'exito', texto: r.mensaje });
      setEditando(null);
      await cargar();
    } catch (err) {
      setAviso({ tono: 'error', texto: err instanceof FalloApi ? err.error.mensaje : 'No se pudo actualizar.' });
    }
  }

  async function restablecerClave(u: UsuarioFila) {
    const clave = window.prompt(
      `Nueva contraseña para ${u.email}\n\nMinimo 10 caracteres, con mayuscula, minuscula y numero.\nAl guardarla se cerraran todas sus sesiones abiertas.`,
    );
    if (!clave) return;
    await parchear(u.id, { password: clave });
  }

  return (
    <div className="space-y-4">
      {aviso && <Alerta tono={aviso.tono}>{aviso.texto}</Alerta>}

      {/* ---------------- Alta ---------------- */}
      <Tarjeta titulo="Crear usuario">
        <form onSubmit={crear} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etiqueta="Correo institucional" requerido error={errores.email}>
              <input
                type="email"
                className={clsx('campo', errores.email && 'campo-error')}
                maxLength={120}
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                required
              />
            </Campo>

            <Campo etiqueta="Nombre completo" requerido error={errores.nombre}>
              <input
                className={clsx('campo', errores.nombre && 'campo-error')}
                maxLength={120}
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                required
              />
            </Campo>

            <Campo etiqueta="Rol" requerido error={errores.rol}>
              <select
                className="campo"
                value={nuevo.rol}
                onChange={(e) => {
                  const rol = e.target.value as 'ASESOR' | 'ADMIN';
                  setNuevo({ ...nuevo, rol, puntoVentaId: rol === 'ADMIN' ? '' : nuevo.puntoVentaId });
                }}
              >
                <option value="ASESOR">Asesor (solo su punto de venta)</option>
                <option value="ADMIN">Administrador (acceso global)</option>
              </select>
            </Campo>

            <Campo
              etiqueta="Punto de venta"
              requerido={nuevo.rol === 'ASESOR'}
              ayuda={nuevo.rol === 'ADMIN' ? 'El administrador no se ancla a una sede' : undefined}
              error={errores.puntoVentaId}
            >
              <select
                className={clsx('campo', errores.puntoVentaId && 'campo-error')}
                value={nuevo.puntoVentaId}
                onChange={(e) => setNuevo({ ...nuevo, puntoVentaId: e.target.value ? Number(e.target.value) : '' })}
                disabled={nuevo.rol === 'ADMIN'}
                required={nuevo.rol === 'ASESOR'}
              >
                <option value="">{nuevo.rol === 'ADMIN' ? 'No aplica' : 'Seleccione…'}</option>
                {puntosVenta.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ciudad_correspondencia}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              etiqueta="Contraseña inicial"
              requerido
              ayuda="Minimo 10 caracteres con mayuscula, minuscula y numero"
              error={errores.password}
            >
              <input
                type="text"
                className={clsx('campo font-mono', errores.password && 'campo-error')}
                maxLength={200}
                value={nuevo.password}
                onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
                autoComplete="new-password"
                required
              />
            </Campo>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primario" disabled={enviando}>
              {enviando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </Tarjeta>

      {/* ---------------- Listado ---------------- */}
      <Tarjeta titulo="Usuarios">
        {filas === null ? (
          <Cargando />
        ) : filas.length === 0 ? (
          <Vacio mensaje="Aun no hay usuarios." />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Usuario</th>
                  <th className="pb-2">Rol / alcance</th>
                  <th className="pb-2">Estado</th>
                  <th className="pb-2">Ultimo ingreso</th>
                  <th className="pb-2">Sesiones</th>
                  <th className="pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filas.map((u) => {
                  const esYo = u.id === usuarioActualId;
                  return (
                    <tr key={u.id} className={clsx(!u.activo && 'opacity-60')}>
                      <td className="py-2">
                        <p className="font-semibold">
                          {u.nombre}
                          {esYo && <span className="ml-1 text-xs font-normal text-slate-500">(usted)</span>}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>

                      <td className="py-2">
                        {editando === u.id ? (
                          <EditorAlcance
                            usuario={u}
                            puntosVenta={puntosVenta}
                            onGuardar={(cambios) => parchear(u.id, cambios)}
                            onCancelar={() => setEditando(null)}
                          />
                        ) : (
                          <>
                            <Insignia tono={u.rol === 'ADMIN' ? 'azul' : 'neutro'}>{u.rol}</Insignia>
                            <span className="ml-2 text-xs text-slate-500">
                              {u.rol === 'ADMIN' ? 'Acceso global' : (u.punto_venta ?? 'sin sede')}
                            </span>
                          </>
                        )}
                      </td>

                      <td className="py-2">
                        {!u.activo ? (
                          <Insignia tono="rojo">Inactivo</Insignia>
                        ) : u.bloqueado ? (
                          <Insignia tono="ambar">Bloqueado ({u.intentos_fallidos} fallos)</Insignia>
                        ) : (
                          <Insignia tono="verde">Activo</Insignia>
                        )}
                      </td>

                      <td className="tnum py-2 text-xs">{u.ultimo_login ?? 'nunca'}</td>
                      <td className="tnum py-2 text-xs">{u.sesiones_activas}</td>

                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button className="btn-secundario px-2 py-1 text-xs" onClick={() => setEditando(u.id)}>
                            Rol / sede
                          </button>
                          <button className="btn-secundario px-2 py-1 text-xs" onClick={() => restablecerClave(u)}>
                            Clave
                          </button>
                          {u.bloqueado && (
                            <button
                              className="btn-secundario px-2 py-1 text-xs"
                              onClick={() => parchear(u.id, { desbloquear: true })}
                            >
                              Desbloquear
                            </button>
                          )}
                          {u.activo ? (
                            <button
                              className="btn-peligro px-2 py-1 text-xs"
                              disabled={esYo}
                              title={esYo ? 'No puede desactivar su propia cuenta' : undefined}
                              onClick={() =>
                                parchear(
                                  u.id,
                                  { activo: false },
                                  `Desactivar a ${u.email}? Se cerraran sus sesiones y no podra ingresar.`,
                                )
                              }
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              className="btn-secundario px-2 py-1 text-xs"
                              onClick={() => parchear(u.id, { activo: true, desbloquear: true })}
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Alerta tono="info">
        Cambiar el rol, la sede o la contraseña de un usuario <strong>cierra sus sesiones abiertas</strong>: el rol y el
        punto de venta viajan firmados en el token, de modo que una sesion previa seguiria concediendo el alcance
        anterior. Siempre debe quedar al menos un administrador activo.
      </Alerta>
    </div>
  );
}

// ------------------------------------------------------------- sub-editor
function EditorAlcance({
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

function manejar(
  err: unknown,
  setErrores: (e: Record<string, string>) => void,
  setAviso: (a: { tono: 'error' | 'exito'; texto: string }) => void,
): void {
  if (err instanceof FalloApi) {
    if (err.error.campos?.length) {
      setErrores(Object.fromEntries(err.error.campos.map((c) => [c.campo, c.mensaje])));
      setAviso({ tono: 'error', texto: 'Revise los campos marcados.' });
    } else {
      setAviso({ tono: 'error', texto: err.error.mensaje });
    }
  } else {
    setAviso({ tono: 'error', texto: 'No se pudo completar la operacion.' });
  }
}
