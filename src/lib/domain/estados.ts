export const ESTADOS = [
  'REGISTRADO',
  'DOC_COMPLETA',
  'EN_TRANSITO',
  'MATRICULADO',
  'ENTREGADO',
  'ANULADO',
] as const;

export type Estado = (typeof ESTADOS)[number];

/** Estados que exigen RUNT verificado (regla de negocio 4.2). */
export const ESTADOS_EXIGEN_RUNT: readonly Estado[] = ['EN_TRANSITO', 'MATRICULADO', 'ENTREGADO'];

export const FLUJO: readonly Estado[] = ['REGISTRADO', 'DOC_COMPLETA', 'EN_TRANSITO', 'MATRICULADO', 'ENTREGADO'];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  REGISTRADO: 'Registrado',
  DOC_COMPLETA: 'Documentacion completa',
  EN_TRANSITO: 'En transito',
  MATRICULADO: 'Matriculado',
  ENTREGADO: 'Entregado',
  ANULADO: 'Anulado',
};

export type Semaforo = 'OK' | 'EN_TIEMPO' | 'ALERTA' | 'CRITICO' | 'BLOQUEADO';

export interface ResultadoTransicion {
  permitido: boolean;
  motivo?: string;
  codigo?: 'RUNT_BLOQUEADO' | 'TRANSICION_INVALIDA' | 'SIN_PERMISO' | 'DATOS_FALTANTES';
}

/**
 * Unica fuente de verdad de la maquina de estados en el servidor. El mismo
 * predicado se evalua en la UI (para deshabilitar botones), en la API (para
 * rechazar la peticion) y en la base de datos (trigger + CHECK).
 */
export function puedeTransicionar(args: {
  actual: Estado;
  destino: Estado;
  runt: 'SI' | 'NO';
  rol: 'ASESOR' | 'ADMIN';
  placa: string | null;
  placaPreasignada: boolean;
  fechaMatricula: string | null;
}): ResultadoTransicion {
  const { actual, destino, runt, rol, placa, placaPreasignada, fechaMatricula } = args;

  if (actual === destino) return { permitido: false, motivo: 'El registro ya esta en ese estado.', codigo: 'TRANSICION_INVALIDA' };

  if (actual === 'ANULADO') {
    return { permitido: false, motivo: 'Un registro anulado no puede reactivarse.', codigo: 'TRANSICION_INVALIDA' };
  }

  if (destino === 'ANULADO') {
    return rol === 'ADMIN'
      ? { permitido: true }
      : { permitido: false, motivo: 'Solo el administrador puede anular un registro.', codigo: 'SIN_PERMISO' };
  }

  // ---- BLOQUEO OBLIGATORIO POR RUNT: aplica a TODOS los PDV y transitos ----
  if (ESTADOS_EXIGEN_RUNT.includes(destino) && runt !== 'SI') {
    return {
      permitido: false,
      codigo: 'RUNT_BLOQUEADO',
      motivo:
        'RUNT NO VERIFICADO. Ninguna carpeta se tramita sin inscripcion al RUNT. ' +
        'Radique la solicitud de inscripcion y espere la validacion del administrador.',
    };
  }

  const i = FLUJO.indexOf(actual);
  const j = FLUJO.indexOf(destino);
  if (i === -1 || j === -1) return { permitido: false, motivo: 'Estado no reconocido.', codigo: 'TRANSICION_INVALIDA' };
  if (j < i) return { permitido: false, motivo: 'El flujo no admite retrocesos.', codigo: 'TRANSICION_INVALIDA' };
  if (j > i + 1) {
    return {
      permitido: false,
      motivo: `Debe pasar primero por ${ETIQUETA_ESTADO[FLUJO[i + 1]!]}.`,
      codigo: 'TRANSICION_INVALIDA',
    };
  }

  if ((destino === 'MATRICULADO' || destino === 'ENTREGADO') && (!placa || placaPreasignada || !fechaMatricula)) {
    return {
      permitido: false,
      codigo: 'DATOS_FALTANTES',
      motivo: 'Para matricular se requiere placa definitiva (no preasignada) y fecha de matricula.',
    };
  }

  // El asesor del PDV solo acompaña hasta documentacion completa; radicar en
  // transito y matricular son actos del control central.
  if (rol === 'ASESOR' && destino !== 'DOC_COMPLETA') {
    return { permitido: false, motivo: 'Su rol solo puede marcar documentacion completa.', codigo: 'SIN_PERMISO' };
  }

  return { permitido: true };
}

export function colorSemaforo(s: Semaforo): string {
  switch (s) {
    case 'BLOQUEADO':
      return 'bg-red-100 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200';
    case 'CRITICO':
      return 'bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-950 dark:text-orange-200';
    case 'ALERTA':
      return 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-100';
    case 'OK':
      return 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200';
  }
}
