'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, FalloApi } from '@/lib/client/api';
import { aInputDate, deInputDate, hoy } from '@/lib/domain/fechas';
import type { PuntoVenta } from '@/lib/domain/mapeo';

/**
 * Estado y envio del formulario de registro (columnas A..P).
 * Se separa del render para que la vista quede como plantilla y esta logica
 * pueda probarse por su cuenta.
 */
export type Errores = Record<string, string>;

const VACIO = {
  numeroIdentificacion: '',
  nombreCompleto: '',
  fechaApertura: aInputDate(hoy()),
  codigo: '',
  puntoVentaId: '' as number | '',
  prenda: '',
  marca: '',
  linea: '',
  modelo: String(new Date().getFullYear()),
  placa: '',
  placaPreasignada: false,
  soatFechaExpedicion: '',
  fechaMatriculaEmision: '',
  chasis: '',
  motor: '',
  observacion: '',
};

/**
 * Formulario de registro de venta (columnas A..P) con MAPEO AUTOMATICO:
 * al elegir CIUDAD CORRESPONDENCIA se resuelven Transito y Tramitador en el
 * acto. Los campos derivados son de solo lectura porque la autoridad del mapeo
 * es la base de datos (trigger fn_registro_normaliza), no el navegador.
 */
export function useFormularioRegistro({ puntosVenta }: { puntosVenta: PuntoVenta[] }) {
  const router = useRouter();
  const unicoPdv = puntosVenta.length === 1 ? puntosVenta[0]! : null;

  const [v, setV] = useState({ ...VACIO, puntoVentaId: unicoPdv ? unicoPdv.id : ('' as number | '') });
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const pdv = useMemo(() => puntosVenta.find((p) => p.id === v.puntoVentaId) ?? null, [puntosVenta, v.puntoVentaId]);

  const set = <K extends keyof typeof v>(k: K, valor: (typeof v)[K]) => {
    setV((prev) => ({ ...prev, [k]: valor }));
    setErrores((e) => {
      if (!e[k as string]) return e;
      const { [k as string]: _, ...resto } = e;
      return resto;
    });
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setGeneral(null);
    setExito(null);
    setErrores({});
    setEnviando(true);

    try {
      const carga = {
        numeroIdentificacion: v.numeroIdentificacion,
        nombreCompleto: v.nombreCompleto,
        fechaApertura: deInputDate(v.fechaApertura),
        codigo: v.codigo,
        puntoVentaId: v.puntoVentaId,
        prenda: v.prenda,
        marca: v.marca,
        linea: v.linea,
        modelo: v.modelo,
        placa: v.placa,
        placaPreasignada: v.placaPreasignada,
        soatFechaExpedicion: v.soatFechaExpedicion ? deInputDate(v.soatFechaExpedicion) : null,
        fechaMatriculaEmision: v.fechaMatriculaEmision ? deInputDate(v.fechaMatriculaEmision) : null,
        chasis: v.chasis,
        motor: v.motor,
        observacion: v.observacion,
      };

      const r = await api.post<{ registro: { id: string; col_b_nombre: string } }>('/api/registros', carga);
      setExito(`Venta registrada: ${r.registro.col_b_nombre}. El RUNT queda en "No" hasta que el administrador valide la inscripcion.`);
      setV({ ...VACIO, puntoVentaId: unicoPdv ? unicoPdv.id : ('' as number | '') });
      router.refresh();
    } catch (err) {
      if (err instanceof FalloApi) {
        if (err.error.campos?.length) {
          setErrores(Object.fromEntries(err.error.campos.map((c) => [c.campo, c.mensaje])));
          setGeneral('Revise los campos marcados.');
        } else {
          setGeneral(err.error.mensaje);
        }
      } else {
        setGeneral('No se pudo guardar el registro.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return { v, set, setV, errores, general, exito, enviando, pdv, unicoPdv, enviar, VACIO };
}
