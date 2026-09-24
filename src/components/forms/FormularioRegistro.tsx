'use client';

import clsx from 'clsx';
import { Alerta, Campo, Tarjeta } from '@/components/ui/primitivos';
import { aInputDate, hoy } from '@/lib/domain/fechas';
import type { PuntoVenta } from '@/lib/domain/mapeo';
import { useFormularioRegistro } from './useFormularioRegistro';

interface Props {
  rol: 'ASESOR' | 'ADMIN';
  puntosVenta: PuntoVenta[];
  codigos: { codigo: string; descripcion: string | null }[];
}

/**
 * Formulario de registro de venta (columnas A..P) con MAPEO AUTOMATICO: al
 * elegir CIUDAD CORRESPONDENCIA se resuelven Transito y Tramitador en el acto.
 * Los campos derivados son de solo lectura porque la autoridad del mapeo es la
 * base de datos (trigger fn_registro_normaliza), no el navegador.
 */
export default function FormularioRegistro({ rol, puntosVenta, codigos }: Props) {
  const { v, set, setV, errores, general, exito, enviando, pdv, unicoPdv, enviar, VACIO } =
    useFormularioRegistro({ puntosVenta });


  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {general && <Alerta tono="error">{general}</Alerta>}
      {exito && <Alerta tono="exito">{exito}</Alerta>}

      {/* ------------------ Cliente ------------------ */}
      <Tarjeta titulo="Datos del cliente">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="A · Numero de identificacion" requerido error={errores.numeroIdentificacion}>
            <input
              className={clsx('campo tnum', errores.numeroIdentificacion && 'campo-error')}
              inputMode="numeric"
              maxLength={20}
              value={v.numeroIdentificacion}
              onChange={(e) => set('numeroIdentificacion', e.target.value.toUpperCase())}
              required
            />
          </Campo>

          <Campo etiqueta="B · Nombre y apellidos" requerido error={errores.nombreCompleto}>
            <input
              className={clsx('campo sm:col-span-2', errores.nombreCompleto && 'campo-error')}
              maxLength={160}
              value={v.nombreCompleto}
              onChange={(e) => set('nombreCompleto', e.target.value)}
              required
            />
          </Campo>

          <Campo etiqueta="C · Fecha de apertura" requerido ayuda="Se almacena y muestra como YYYY/MM/DD" error={errores.fechaApertura}>
            <input
              type="date"
              className={clsx('campo tnum', errores.fechaApertura && 'campo-error')}
              value={v.fechaApertura}
              max={aInputDate(hoy())}
              onChange={(e) => set('fechaApertura', e.target.value)}
              required
            />
          </Campo>

          <Campo etiqueta="D · Codigo" requerido error={errores.codigo}>
            <select
              className={clsx('campo', errores.codigo && 'campo-error')}
              value={v.codigo}
              onChange={(e) => set('codigo', e.target.value)}
              required
            >
              <option value="">Seleccione…</option>
              {codigos.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo}
                  {c.descripcion ? ` · ${c.descripcion}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </Tarjeta>

      {/* ------------------ Mapeo automatico ------------------ */}
      <Tarjeta titulo="E · Ciudad correspondencia y asignacion automatica">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Ciudad correspondencia" requerido error={errores.puntoVentaId}>
            <select
              className={clsx('campo', errores.puntoVentaId && 'campo-error')}
              value={v.puntoVentaId}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : ('' as const);
                set('puntoVentaId', id);
                const nuevo = puntosVenta.find((p) => p.id === id);
                if (nuevo && !nuevo.permite_preasignacion) set('placaPreasignada', false);
              }}
              disabled={Boolean(unicoPdv)}
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

          <Campo etiqueta="Transito asignado" ayuda="Derivado automaticamente">
            <input className="campo bg-slate-100 font-semibold dark:bg-slate-800" value={pdv?.transito ?? ''} readOnly tabIndex={-1} />
          </Campo>

          <Campo etiqueta="Tramitador asignado" ayuda="Derivado automaticamente">
            <input className="campo bg-slate-100 font-semibold dark:bg-slate-800" value={pdv?.tramitador ?? ''} readOnly tabIndex={-1} />
          </Campo>
        </div>

        {unicoPdv && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Su usuario esta confinado al punto de venta <strong>{unicoPdv.ciudad_correspondencia}</strong>. No puede
            registrar ventas de otra sede.
          </p>
        )}
      </Tarjeta>

      {/* ------------------ Vehiculo ------------------ */}
      <Tarjeta titulo="Vehiculo">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="F · Prenda" error={errores.prenda}>
            <input className="campo" maxLength={80} value={v.prenda} onChange={(e) => set('prenda', e.target.value)} />
          </Campo>

          <Campo etiqueta="G · Marca" requerido error={errores.marca}>
            <input
              className={clsx('campo', errores.marca && 'campo-error')}
              maxLength={40}
              value={v.marca}
              onChange={(e) => set('marca', e.target.value.toUpperCase())}
              required
            />
          </Campo>

          <Campo etiqueta="H · Linea" requerido error={errores.linea}>
            <input
              className={clsx('campo', errores.linea && 'campo-error')}
              maxLength={60}
              value={v.linea}
              onChange={(e) => set('linea', e.target.value.toUpperCase())}
              required
            />
          </Campo>

          <Campo etiqueta="I · Modelo" requerido error={errores.modelo}>
            <input
              type="number"
              className={clsx('campo tnum', errores.modelo && 'campo-error')}
              min={1980}
              max={new Date().getFullYear() + 2}
              value={v.modelo}
              onChange={(e) => set('modelo', e.target.value)}
              required
            />
          </Campo>

          <Campo etiqueta="M · Chasis (VIN)" requerido ayuda="Unico en todo el sistema" error={errores.chasis}>
            <input
              className={clsx('campo font-mono', errores.chasis && 'campo-error')}
              maxLength={25}
              value={v.chasis}
              onChange={(e) => set('chasis', e.target.value.toUpperCase())}
              required
            />
          </Campo>

          <Campo etiqueta="N · Motor" requerido error={errores.motor}>
            <input
              className={clsx('campo font-mono', errores.motor && 'campo-error')}
              maxLength={25}
              value={v.motor}
              onChange={(e) => set('motor', e.target.value.toUpperCase())}
              required
            />
          </Campo>

          <Campo
            etiqueta="J · Placa"
            ayuda={pdv?.permite_preasignacion ? 'Admite preasignacion' : 'Formato ABC12D'}
            error={errores.placa}
          >
            <input
              className={clsx('campo font-mono uppercase', errores.placa && 'campo-error')}
              maxLength={6}
              placeholder="ABC12D"
              value={v.placa}
              onChange={(e) => set('placa', e.target.value.toUpperCase())}
            />
          </Campo>

          {pdv?.permite_preasignacion && (
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={v.placaPreasignada}
                onChange={(e) => set('placaPreasignada', e.target.checked)}
              />
              Placa preasignada
            </label>
          )}
        </div>
      </Tarjeta>

      {/* ------------------ Control central ------------------ */}
      {rol === 'ADMIN' && (
        <Tarjeta titulo="Fechas de gestion (control central)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="K · SOAT (fecha de expedicion)" ayuda="YYYY/MM/DD" error={errores.soatFechaExpedicion}>
              <input
                type="date"
                className="campo tnum"
                value={v.soatFechaExpedicion}
                onChange={(e) => set('soatFechaExpedicion', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="L · Fecha matricula (emision)" ayuda="YYYY/MM/DD" error={errores.fechaMatriculaEmision}>
              <input
                type="date"
                className="campo tnum"
                value={v.fechaMatriculaEmision}
                onChange={(e) => set('fechaMatriculaEmision', e.target.value)}
              />
            </Campo>
          </div>
        </Tarjeta>
      )}

      {/* ------------------ Observacion ------------------ */}
      <Tarjeta titulo="P · Observacion">
        <textarea
          className="campo min-h-24"
          maxLength={500}
          value={v.observacion}
          onChange={(e) => set('observacion', e.target.value)}
          placeholder="Detalles del tramite, documentos faltantes, acuerdos con el cliente…"
        />
        <p className="mt-1 text-right text-xs text-slate-400">{v.observacion.length}/500</p>
      </Tarjeta>

      <Alerta tono="aviso" titulo="O · RUNT">
        Todo registro nuevo nace con <strong>RUNT = No</strong> y queda bloqueado para tramite. Radique la solicitud de
        inscripcion desde el modulo <strong>Inscripciones RUNT</strong>; solo el administrador puede validarla.
      </Alerta>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="btn-secundario"
          onClick={() => setV({ ...VACIO, puntoVentaId: unicoPdv ? unicoPdv.id : ('' as number | '') })}
          disabled={enviando}
        >
          Limpiar
        </button>
        <button type="submit" className="btn-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Registrar venta'}
        </button>
      </div>
    </form>
  );
}
