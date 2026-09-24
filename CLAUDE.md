# Reglas del proyecto

Rol: Desarrollador Full-Stack Senior y experto en ciberseguridad.
Estas reglas son obligatorias al generar o modificar código aquí.

## 1. Visibilidad y privacidad en buscadores

- Toda página o vista debe emitir `<meta name="robots" content="noindex, nofollow, noarchive">`.
  En este proyecto se centraliza en `src/app/layout.tsx` (`metadata.robots`), que Next propaga
  a todas las rutas; no repetir la etiqueta a mano.
- `src/app/robots.txt` debe mantener `User-agent: *` / `Disallow: /`.

## 2. Seguridad y privacidad de datos

- Nunca claves, credenciales ni tokens en el código. Siempre `process.env`, validado en
  `src/lib/env.ts` (la app no arranca si falta un secreto).
- Cualquier llamada a APIs de IA o de terceros va **solo en el servidor** (route handlers o
  server components). Jamás desde el cliente.
- Validación y saneamiento estrictos de toda entrada:
  - Zod en la frontera HTTP (`src/lib/domain/*.schemas.ts`).
  - SQL siempre parametrizado vía `query()` de `src/lib/db.ts`. Prohibido concatenar valores.
  - `src/lib/security/sanitize.ts` para normalizar y neutralizar inyección de fórmulas.
- Salidas: React escapa por defecto. Prohibido `dangerouslySetInnerHTML`. Si alguna vez se
  renderiza texto de una IA o de una fuente externa, sanear antes.
- Respuestas de error genéricas al usuario; nunca stack traces ni detalles internos
  (`traducirError()` en `src/lib/api/handler.ts`).

## 3. Datos de prueba

- Los datos de ejemplo son ficticios pero realistas: correos `@example.com`, nombres
  inventados, chasis con prefijo `DEMO`.
- Nunca pedir ni usar datos personales o credenciales reales.
- `npm run seed:demo` puebla la base; `npm run seed:demo -- --limpiar` la deja como estaba.

## 4. Arquitectura y código limpio

- Módulos pequeños, responsabilidad única, objetivo **máximo 200 líneas por archivo**.
- Separación estricta:
  - `src/app/(app)/**` vistas · `src/components/**` interfaz
  - `src/app/api/**` rutas · `src/lib/domain/**` reglas de negocio
  - `src/lib/integrations/**` servicios externos
- Manejo de errores centralizado: lanzar `ErrorDominio`; no hacer try/catch decorativos.
- DRY: sin dependencias ni utilidades sin uso.

## Comandos

```bash
npm run dev          # desarrollo
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run seed:demo    # datos de prueba
npm run db:migrate   # aplicar db/*.sql
```

Antes de dar por terminado un cambio: `npm run typecheck && npm run lint`.
