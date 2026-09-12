import { z } from 'zod';
import { limpiarTexto } from '../security/sanitize';
import { passwordPolicy } from '../auth/password';

const texto = (max: number) => z.string().transform((v) => limpiarTexto(v, max));

const password = z
  .string()
  .max(200)
  .superRefine((v, ctx) => {
    const problema = passwordPolicy(v);
    if (problema) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problema });
  });

// ------------------------------------------------------------- USUARIOS
const baseUsuario = {
  nombre: texto(120).refine((v) => v.length >= 3, 'Nombre demasiado corto.'),
  rol: z.enum(['ASESOR', 'ADMIN']),
  /** Obligatorio para ASESOR, debe ir vacio para ADMIN (lo refuerza la BD). */
  puntoVentaId: z.coerce.number().int().positive().nullable().optional(),
};

export const usuarioCrearSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Correo invalido.').max(120),
    password,
    ...baseUsuario,
  })
  .superRefine((v, ctx) => {
    if (v.rol === 'ASESOR' && !v.puntoVentaId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['puntoVentaId'], message: 'Un asesor debe tener punto de venta.' });
    }
    if (v.rol === 'ADMIN' && v.puntoVentaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['puntoVentaId'],
        message: 'Un administrador tiene alcance global: no lleva punto de venta.',
      });
    }
  });

export const usuarioActualizarSchema = z
  .object({
    nombre: baseUsuario.nombre.optional(),
    rol: baseUsuario.rol.optional(),
    puntoVentaId: z.coerce.number().int().positive().nullable().optional(),
    activo: z.coerce.boolean().optional(),
    /** Restablecer contraseña: revoca todas las sesiones del usuario. */
    password: password.optional(),
    /** Desbloquear una cuenta frenada por intentos fallidos. */
    desbloquear: z.coerce.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.rol === 'ASESOR' && v.puntoVentaId === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['puntoVentaId'], message: 'Un asesor debe tener punto de venta.' });
    }
    if (v.rol === 'ADMIN' && typeof v.puntoVentaId === 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['puntoVentaId'],
        message: 'Un administrador no lleva punto de venta.',
      });
    }
  });

// --------------------------------------------------------- TRAMITADORES
export const tramitadorCrearSchema = z.object({
  nombre: texto(80).refine((v) => v.length >= 3, 'Nombre del tramitador requerido.'),
  transitoId: z.coerce.number().int().positive('Seleccione el transito.'),
  telefono: texto(20)
    .optional()
    .refine((v) => !v || /^[0-9+ ()-]{7,20}$/.test(v), 'Telefono invalido.'),
});

export const tramitadorActualizarSchema = z.object({
  nombre: texto(80).refine((v) => v.length >= 3, 'Nombre del tramitador requerido.').optional(),
  transitoId: z.coerce.number().int().positive().optional(),
  telefono: texto(20)
    .optional()
    .refine((v) => !v || /^[0-9+ ()-]{7,20}$/.test(v), 'Telefono invalido.'),
  activo: z.coerce.boolean().optional(),
});

// -------------------------------------------------------- PUNTOS DE VENTA
export const puntoVentaActualizarSchema = z.object({
  /** Reasignacion de tramitador. Su transito se adopta automaticamente. */
  tramitadorId: z.coerce.number().int().positive().optional(),
  permitePreasignacion: z.coerce.boolean().optional(),
  activo: z.coerce.boolean().optional(),
  /**
   * Si es true, las carpetas abiertas de la sede adoptan el nuevo tramitador.
   * Las ya matriculadas o entregadas conservan su historia.
   */
  reasignarAbiertas: z.coerce.boolean().optional().default(false),
});

export const puntoVentaCrearSchema = z.object({
  ciudadCorrespondencia: z
    .string()
    .transform((v) => limpiarTexto(v, 60).toUpperCase())
    .refine((v) => v.length >= 3, 'Nombre de la ciudad de correspondencia requerido.'),
  tramitadorId: z.coerce.number().int().positive('Seleccione el tramitador.'),
  permitePreasignacion: z.coerce.boolean().default(false),
});

export const transitoCrearSchema = z.object({
  nombre: texto(60).refine((v) => v.length >= 3, 'Nombre del transito requerido.'),
});
