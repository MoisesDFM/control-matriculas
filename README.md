# NECHIMOTOS · Sistema de Matrículas, SOAT y RUNT

Plataforma web interna para registrar ventas de vehículos, controlar el trámite de matrícula
por punto de venta y bloquear cualquier carpeta sin inscripción al RUNT.

Infraestructura **100 % gratuita**: Next.js en Vercel (Hobby) + PostgreSQL en Supabase/Neon
(plan gratuito) + Google Sheets API con Service Account.

---

## 1. Stack

| Capa | Tecnología | Plan |
|---|---|---|
| Web + API | Next.js 15 (App Router, Route Handlers) | Vercel Hobby |
| Base de datos | PostgreSQL 15 | Supabase / Neon free |
| Autenticación | JWT (jose) en cookies `__Host-` HTTP-Only, SameSite=Strict | — |
| Validación | Zod en toda frontera HTTP | — |
| Excel / Drive | `exceljs` (.xlsx nativo) + `googleapis` (Service Account) | gratuito |
| UI | React 19 + Tailwind CSS | — |

---

## 2. Estructura de carpetas

```
nechimotos-matriculas-web/
├── middleware.ts                  # Edge: sesión, CSP+Helmet, HTTPS, zona ADMIN
├── next.config.mjs                # Cabeceras de seguridad (defensa en profundidad)
├── vercel.json                    # Cron diario de sincronización con Sheets
├── db/
│   ├── 001_schema.sql             # DDL: ENUMs, tablas, índices, triggers, vistas
│   └── 002_seed.sql               # Mapeo Ciudad → Tránsito → Tramitador + códigos
├── scripts/
│   ├── migrate.mjs                # Aplica db/*.sql con registro en _migraciones
│   └── create-user.mjs            # Única vía de alta de usuarios (no hay autoregistro)
└── src/
    ├── app/
    │   ├── layout.tsx  globals.css  page.tsx  robots.txt
    │   ├── login/page.tsx
    │   ├── (app)/                        # zona autenticada
    │   │   ├── layout.tsx                # resuelve la sesión en el servidor
    │   │   ├── dashboard/page.tsx        # tablero + KPIs + alerta RUNT
    │   │   ├── registros/page.tsx
    │   │   ├── registros/nuevo/page.tsx  # formulario A..P con mapeo automático
    │   │   ├── runt/page.tsx             # solicitudes e inscripción RUNT
    │   │   ├── reportes/page.tsx         # KPIs, SLA, sincronización, .xlsx
    │   │   └── admin/page.tsx            # SOLO ADMIN: usuarios y mapeo
    │   └── api/
    │       ├── auth/{login,logout,me}/route.ts
    │       ├── catalogos/route.ts
    │       ├── registros/route.ts                    # GET listado · POST crear
    │       ├── registros/[id]/route.ts               # GET detalle · PATCH editar
    │       ├── registros/[id]/estado/route.ts        # POST transición (bloqueo RUNT)
    │       ├── runt/solicitudes/route.ts             # GET · POST (asesor)
    │       ├── runt/solicitudes/[id]/route.ts        # PATCH validar (SOLO ADMIN)
    │       ├── sync/sheets/route.ts                  # POST manual · GET cron
    │       ├── reportes/kpis/route.ts
    │       ├── reportes/xlsx/route.ts
    │       ├── admin/usuarios/route.ts               # GET · POST (SOLO ADMIN)
    │       ├── admin/usuarios/[id]/route.ts          # PATCH · DELETE (desactiva)
    │       ├── admin/tramitadores/route.ts           # GET · POST
    │       ├── admin/tramitadores/[id]/route.ts      # PATCH
    │       ├── admin/puntos-venta/route.ts           # GET · POST
    │       ├── admin/puntos-venta/[id]/route.ts      # PATCH (reasignar tramitador)
    │       ├── admin/transitos/route.ts              # GET · POST
    │       └── health/route.ts
    ├── lib/
    │   ├── env.ts                 # valida la configuración al arrancar
    │   ├── db.ts                  # pool pg + query() siempre parametrizada + tx()
    │   ├── auth/
    │   │   ├── jwt.ts             # firma/verificación HS256 con iss/aud fijos
    │   │   ├── session.ts         # cookies __Host-, refresh rotativo, revocación
    │   │   └── password.ts        # bcrypt cost 12, comparación señuelo, política
    │   ├── security/
    │   │   ├── csrf.ts            # Origin/Referer + double-submit
    │   │   ├── rate-limit.ts      # atómico en PostgreSQL (sirve en serverless)
    │   │   └── sanitize.ts        # normalización + anti-inyección de fórmulas
    │   ├── api/
    │   │   ├── handler.ts         # middleware: límite → CSRF → sesión → rol → Zod
    │   │   ├── rbac.ts            # FILTRO POR PUNTO DE VENTA (alcance())
    │   │   └── respuestas.ts      # ok()/fallo()/ErrorDominio, no-store
    │   ├── domain/
    │   │   ├── fechas.ts          # contrato YYYY/MM/DD en todo el sistema
    │   │   ├── estados.ts         # máquina de estados + puedeTransicionar()
    │   │   ├── mapeo.ts           # mapeo canónico Ciudad → Tránsito/Tramitador
    │   │   ├── schemas.ts         # Zod de columnas A..P, filtros y RUNT
    │   │   ├── admin.schemas.ts   # Zod de usuarios, tramitadores y sedes
    │   │   ├── admin.repo.ts      # invariantes del panel de administración
    │   │   └── registros.repo.ts  # consultas con alcance RBAC inyectado
    │   ├── integrations/
    │   │   ├── google-sheets.ts   # Service Account, orden A..P inmutable
    │   │   └── sync.ts            # sincronización bidireccional por CHASIS
    │   ├── reports/
    │   │   ├── kpis.ts            # resumen, RUNT por PDV, SLA, serie semanal
    │   │   └── xlsx.ts            # libros .xlsx con fechas como texto
    │   └── client/api.ts          # fetch con CSRF y manejo uniforme de errores
    └── components/
        ├── ui/primitivos.tsx
        ├── layout/Navegacion.tsx
        ├── dashboard/{TarjetasKpi,AlertaRunt,Tablero}.tsx
        ├── forms/{FormularioLogin,FormularioRegistro,PanelRunt}.tsx
        ├── admin/{PanelAdmin,PanelUsuarios,PanelMapeo}.tsx
        └── reportes/PanelReportes.tsx
```

---

## 3. Puesta en marcha

```bash
npm install
cp .env.example .env.local     # completar valores reales
npm run db:migrate             # crea esquema + datos maestros
npm run user:create -- --email paula@nechimotos.com --nombre "Paula" --rol ADMIN
npm run dev
```

Alta de un asesor (queda confinado a su sede):

```bash
npm run user:create -- --email nechi@nechimotos.com --nombre "Asesor Nechí" --rol ASESOR --pdv "NECHI"
```

### Google Sheets (gratuito)

1. Google Cloud Console → nuevo proyecto → habilitar **Google Sheets API**.
2. IAM → Cuentas de servicio → crear → Claves → **JSON**.
3. Copiar `client_email` y `private_key` a `GOOGLE_SERVICE_ACCOUNT_EMAIL` y
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (con `\n` escapados).
4. Compartir la hoja de Drive con ese correo como **Editor**.
5. `GOOGLE_SHEETS_SPREADSHEET_ID` es el tramo entre `/d/` y `/edit` de la URL.

### Despliegue en Vercel

1. Importar el repositorio; el framework se detecta solo.
2. Cargar todas las variables de `.env.example` en *Settings → Environment Variables*.
3. `APP_ORIGIN` debe ser **exactamente** el dominio público (la validación CSRF lo compara).
4. `vercel.json` ya define el cron diario que sincroniza con Sheets y purga sesiones
   caducadas (el plan Hobby permite ejecuciones diarias).

---

## 4. Panel de administración (`/admin`, solo ADMIN)

Triple puerta: el middleware de borde bloquea `/admin` y `/api/admin`, la página vuelve a
comprobar la sesión en el servidor, y cada route handler declara `rol: 'ADMIN'`.

**Usuarios y accesos**

- Alta de cuentas con política de contraseña (≥10 caracteres, mayúscula, minúscula y número);
  no existe autoregistro.
- Cambio de rol y de sede, restablecimiento de contraseña, desbloqueo tras intentos fallidos,
  desactivación y reactivación. `DELETE` no borra: desactiva y conserva la autoría.
- Cambiar rol, sede, contraseña o desactivar **revoca las sesiones abiertas** del usuario: el
  rol y el punto de venta viajan firmados en el JWT, así que un token previo seguiría
  concediendo el alcance anterior.
- Invariantes que ni el administrador puede romper: nadie se desactiva ni se quita el rol a sí
  mismo, siempre queda al menos un ADMIN activo, y un ASESOR nunca queda sin sede.
- Nunca se devuelve `password_hash`; la contraseña jamás entra en la auditoría.

**Tramitadores y mapeo**

- Reasignación de tramitador por ciudad de correspondencia — la regla 4.1 es dato, no código.
  El tránsito se hereda del tramitador, por lo que el trigger `trg_pdv_valida_tramitador`
  nunca puede quedar en contradicción.
- Las carpetas ya matriculadas o entregadas conservan su tramitador histórico. Las abiertas se
  re-mapean solo si se marca la casilla: al tocar la fila, `fn_registro_normaliza` vuelve a
  derivar el mapeo (esto incrementa `row_version`, así que un formulario abierto en otra
  pestaña pedirá recargar).
- Alta y baja de tramitadores, tránsitos y puntos de venta; conmutador de preasignación de
  placa por sede.
- Bajas protegidas: no se desactiva un tramitador con sedes activas asignadas, ni una sede con
  asesores activos.
- Panel con los últimos movimientos de administración y los accesos fallidos.

---

## 5. Modelo de seguridad

| Control | Implementación |
|---|---|
| Autenticación | JWT HS256 (`iss`/`aud` fijos, algoritmo fijado) en cookie `__Host-nm_at`, HTTP-Only, Secure, SameSite=Strict |
| Sesión revocable | Cada JWT lleva `sid`; se comprueba contra `sesiones` en cada petición |
| Refresh | Token opaco de 48 bytes, solo su SHA-256 en BD, rotación de un uso; el reuso revoca toda la familia |
| Aislamiento por sede | `alcance()` inyecta `punto_venta_id = $n` desde el JWT en **toda** consulta; el asesor no puede ampliarlo por querystring |
| RBAC | `rol: 'ADMIN'` en las rutas del control central + `exigirAdmin()` + `usuarios_scope_ck` en la BD |
| SQL Injection | Únicamente `query()` parametrizada; los identificadores de orden salen de un mapa cerrado |
| XSS | React escapa por defecto, cero `dangerouslySetInnerHTML`, CSP con nonce y `strict-dynamic` |
| CSRF | Origin/Referer == `APP_ORIGIN` **y** double-submit `X-CSRF-Token` vs cookie |
| Rate limiting | Por IP y por usuario, atómico en PostgreSQL: 5 logins/5 min, 60 escrituras/min, 4 sync/5 min |
| Fuerza bruta | Bloqueo de cuenta 15 min a los 5 fallos + comparación señuelo contra enumeración por tiempo |
| Cabeceras | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, COOP/CORP, Permissions-Policy |
| HTTPS | Redirección 308 desde `x-forwarded-proto: http` en producción |
| Fugas de datos | Respuestas `no-store`, `robots: noindex`, "no encontrado" indistinguible de "fuera de alcance" |
| Auditoría | Tabla `auditoria` con login, cambios de estado, aprobaciones RUNT y exportaciones |
| Exportación | `celdaSegura()` neutraliza `=`/`+`/`@` para evitar inyección de fórmulas en Excel/Sheets |

---

## 6. Reglas de negocio implementadas

**Mapeo automático** (tabla `puntos_venta`, aplicado por el trigger `fn_registro_normaliza`;
editable desde datos sin desplegar):

| Ciudad correspondencia | Tránsito | Tramitador | Preasignación |
|---|---|---|---|
| PLANETA RICA | Planeta Rica | Richar Zapata | — |
| PUERTO LIBERTADOR · MONTELIBANO MOBILITY · MONTELIBANO TVS | Planeta Rica | Richar Barroso | — |
| AYAPEL · NECHI · ZARAGOZA | Caucasia | Mirna Gutiérrez | ✔ |
| GUARANDA · MAJAGUAL · SAN MARCOS · SUCRE | Sincelejo | Yuliana | — |

**Bloqueo por RUNT** — verificado en tres capas independientes:

1. `puedeTransicionar()` deshabilita el botón en la UI y explica el motivo.
2. La API devuelve `409 RUNT_BLOQUEADO` en `POST /api/registros/[id]/estado`.
3. La BD lo impide con el trigger `fn_registro_flujo` y el `CHECK reg_runt_gate_ck`.

**Inscripción al RUNT** — el asesor radica (PDV, dirección/barrio, teléfono, correo y adjunto
de la cédula); solo el ADMIN aprueba, y aprobar es lo único que pone `RUNT = Si`
(trigger `fn_solicitud_aplica_runt`, que además exige rol ADMIN en el revisor).

**Fechas** — `DATE` en la base, `YYYY/MM/DD` en toda entrada, salida, hoja de cálculo y
archivo `.xlsx` (escritas como texto para que ningún Excel regional las reinterprete).

---

## 7. Correspondencia con el Excel

| Col. | Encabezado | Campo |
|---|---|---|
| A | NUMERO DE IDENTIFICACION | `numero_identificacion` |
| B | NOMBRE Y NOMBRES (APELLIDOS) | `nombre_completo` |
| C | FECHA DE APERTURA | `fecha_apertura` · YYYY/MM/DD |
| D | CODIGOS | `codigo` → `codigos` |
| E | CIUDAD CORRESPONDENCIA | `punto_venta_id` → `puntos_venta` |
| F | PRENDA | `prenda` |
| G | MARCA | `marca` |
| H | LINEA | `linea` |
| I | MODELO | `modelo` |
| J | PLACA | `placa` + `placa_preasignada` |
| K | SOAT | `soat_fecha_expedicion` · YYYY/MM/DD |
| L | FECHA MATRICULA | `fecha_matricula_emision` · YYYY/MM/DD |
| M | CHASIS | `chasis` · **único** (clave de reconciliación) |
| N | MOTOR | `motor` |
| O | RUNT | `runt` (Si/No) |
| P | OBSERVACION | `observacion` |

---

## 8. Comandos

```bash
npm run dev          # desarrollo
npm run build        # compilación de producción
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run db:migrate   # aplicar db/*.sql
npm run user:create  # crear o reactivar un usuario
```
