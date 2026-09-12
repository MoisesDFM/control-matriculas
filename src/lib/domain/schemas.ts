import { z } from 'zod';
import { ESTADOS } from './estados';
import { normalizarFecha } from './fechas';
import { limpiarTexto, limpiarMayusculas } from '../security/sanitize';

/** Fecha obligatoria en formato YYYY/MM/DD (acepta variantes y normaliza). */
const fecha = z
  .union([z.string(), z.number(), z.date()])
  .transform((v, ctx) => {
    const n = normalizarFecha(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Fecha invalida. Formato esperado YYYY/MM/DD.' });
      return z.NEVER;
    }
    return n;
  });

const fechaOpcional = z
  .union([z.string(), z.number(), z.date(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = normalizarFecha(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Fecha invalida. Formato esperado YYYY/MM/DD.' });
      return z.NEVER;
    }
    return n;
  });

const texto = (max: number) => z.string().transform((v) => limpiarTexto(v, max));
const mayus = (max: number) => z.string().transform((v) => limpiarMayusculas(v, max));

export const placaSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    const p = limpiarMayusculas(v ?? '', 6);
    if (p === '') return null;
    if (!/^[A-Z]{3}[0-9]{2}[A-Z0-9]$/.test(p)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Placa invalida. Formato colombiano: ABC12D.' });
      return z.NEVER;
    }
    return p;
  });

// ---------------------------------------------------------------- LOGIN
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo invalido.').max(120),
  password: z.string().min(8, 'Contraseña demasiado corta.').max(200),
});

// ------------------------------------------------------- REGISTRO (A..P)
export const registroCrearSchema = z.object({
  // A
  numeroIdentificacion: mayus(20).refine((v) => /^[0-9A-Z-]{5,20}$/.test(v), 'Identificacion invalida.'),
  // B
  nombreCompleto: texto(160).refine((v) => v.length >= 5, 'Nombre y apellidos completos.'),
  // C
  fechaApertura: fecha,
  // D
  codigo: mayus(30).refine((v) => v.length > 0, 'Seleccione un codigo.'),
  // E - unica fuente del mapeo automatico; el backend valida el alcance RBAC
  puntoVentaId: z.coerce.number().int().positive('Seleccione la ciudad de correspondencia.'),
  // F
  prenda: texto(80).optional().default(''),
  // G / H / I
  marca: mayus(40).refine((v) => v.length >= 2, 'Marca requerida.'),
  linea: mayus(60).refine((v) => v.length >= 1, 'Linea requerida.'),
  modelo: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 2),
  // J
  placa: placaSchema,
  placaPreasignada: z.coerce.boolean().default(false),
  // K / L
  soatFechaExpedicion: fechaOpcional,
  fechaMatriculaEmision: fechaOpcional,
  // M / N
  chasis: mayus(25).refine((v) => /^[A-Z0-9]{6,25}$/.test(v), 'Chasis (VIN) invalido.'),
  motor: mayus(25).refine((v) => /^[A-Z0-9-]{4,25}$/.test(v), 'Numero de motor invalido.'),
  // O - el asesor NUNCA puede fijar RUNT = SI; solo el administrador valida.
  runt: z.enum(['SI', 'NO']).default('NO'),
  // P
  observacion: texto(500).optional().default(''),
});

export const registroActualizarSchema = registroCrearSchema.partial().extend({
  rowVersion: z.coerce.number().int().positive(),
});

export const cambioEstadoSchema = z.object({
  estado: z.enum(ESTADOS),
  nota: texto(300).optional().default(''),
  rowVersion: z.coerce.number().int().positive(),
});

// ------------------------------------------------------------ FILTROS
export const filtrosSchema = z.object({
  q: texto(60).optional().default(''),
  estado: z.enum(ESTADOS).optional(),
  puntoVentaId: z.coerce.number().int().positive().optional(),
  transitoId: z.coerce.number().int().positive().optional(),
  tramitadorId: z.coerce.number().int().positive().optional(),
  runt: z.enum(['SI', 'NO']).optional(),
  desde: fechaOpcional,
  hasta: fechaOpcional,
  soloBloqueados: z.coerce.boolean().optional().default(false),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
  porPagina: z.coerce.number().int().min(10).max(200).default(50),
  orden: z.enum(['fecha_apertura', 'updated_at', 'nombre_completo']).default('fecha_apertura'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

export type Filtros = z.infer<typeof filtrosSchema>;

// --------------------------------------------- SOLICITUD DE INSCRIPCION RUNT
export const solicitudRuntSchema = z.object({
  registroId: z.string().uuid().optional(),
  puntoVentaId: z.coerce.number().int().positive(),
  numeroIdentificacion: mayus(20).refine((v) => /^[0-9A-Z-]{5,20}$/.test(v), 'Identificacion invalida.'),
  nombreCompleto: texto(160).refine((v) => v.length >= 5, 'Nombre completo requerido.'),
  direccionBarrio: texto(160).refine((v) => v.length >= 5, 'Direccion y barrio requeridos.'),
  telefono: z
    .string()
    .transform((v) => limpiarTexto(v, 20))
    .refine((v) => /^[0-9+ ()-]{7,20}$/.test(v), 'Telefono invalido.'),
  correo: z.string().trim().toLowerCase().email('Correo del cliente invalido.').max(120),
  cedulaUrl: z.string().url('Debe adjuntar la foto de la cedula.').max(600),
  cedulaMime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']).default('image/jpeg'),
});

export const validarSolicitudSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APROBAR') }),
  z.object({ decision: z.literal('RECHAZAR'), motivo: texto(300).refine((v) => v.length >= 5, 'Indique el motivo del rechazo.') }),
]);

export type RegistroCrear = z.infer<typeof registroCrearSchema>;
export type SolicitudRunt = z.infer<typeof solicitudRuntSchema>;
