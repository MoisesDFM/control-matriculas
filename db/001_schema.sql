-- =====================================================================
--  NECHIMOTOS · Sistema de Matriculas, SOAT y RUNT
--  Esquema PostgreSQL 15+  (Supabase / Neon - plan gratuito)
--  Convencion de fechas: se ALMACENA como DATE y se PRESENTA como YYYY/MM/DD
--  (ver funcion fmt_fecha() y las vistas de salida).
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busqueda difusa por nombre/placa

-- ---------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ---------------------------------------------------------------------
DO $do$ BEGIN
  CREATE TYPE rol_usuario AS ENUM ('ASESOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  -- Maquina de estados del tramite (el orden del ENUM es la progresion)
  CREATE TYPE estado_registro AS ENUM (
    'REGISTRADO',      -- venta capturada en el PDV
    'DOC_COMPLETA',    -- documentacion fisica completa
    'EN_TRANSITO',     -- carpeta radicada en el organismo de transito <- BLOQUEADO SIN RUNT
    'MATRICULADO',     -- placa / matricula emitida
    'ENTREGADO',       -- entregado al cliente
    'ANULADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE respuesta_runt AS ENUM ('SI', 'NO');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE estado_solicitud_runt AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE origen_sync AS ENUM ('APP', 'SHEETS', 'IMPORT_XLSX');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ---------------------------------------------------------------------
-- 2. UTILIDADES
-- ---------------------------------------------------------------------

-- Formato obligatorio de presentacion de TODAS las fechas del sistema.
CREATE OR REPLACE FUNCTION fmt_fecha(d date)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN d IS NULL THEN NULL ELSE to_char(d, 'YYYY/MM/DD') END;
$fn$;

-- Parser tolerante para la ingesta desde Sheets / XLSX. Acepta YYYY/MM/DD,
-- YYYY-MM-DD, DD/MM/YYYY y el serial numerico de Excel. NULL si no es legible.
CREATE OR REPLACE FUNCTION parse_fecha(txt text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE s text := btrim(coalesce(txt, ''));
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  IF s ~ '^[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}$' THEN
    RETURN to_date(replace(s, '-', '/'), 'YYYY/MM/DD');
  ELSIF s ~ '^[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4}$' THEN
    RETURN to_date(replace(s, '-', '/'), 'DD/MM/YYYY');
  ELSIF s ~ '^[0-9]{5}$' THEN                  -- serial de Excel (base 1899-12-30)
    RETURN DATE '1899-12-30' + s::int;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- ---------------------------------------------------------------------
-- 3. CATALOGOS: TRANSITOS, TRAMITADORES, PUNTOS DE VENTA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transitos (
  id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transitos_nombre_uk UNIQUE (nombre),
  CONSTRAINT transitos_nombre_ck CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS tramitadores (
  id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      text NOT NULL,
  transito_id smallint NOT NULL REFERENCES transitos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  telefono    text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tramitadores_nombre_uk UNIQUE (nombre)
);
CREATE INDEX IF NOT EXISTS ix_tramitadores_transito ON tramitadores (transito_id) WHERE activo;

-- Un punto de venta == un valor de "CIUDAD CORRESPONDENCIA" (columna E del Excel).
-- El mapeo Transito/Tramitador vive aqui como DATO, no como codigo: se puede
-- reasignar desde el panel de administracion sin volver a desplegar.
CREATE TABLE IF NOT EXISTS puntos_venta (
  id                     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ciudad_correspondencia text NOT NULL,                 -- clave de negocio (columna E)
  transito_id            smallint NOT NULL REFERENCES transitos(id)    ON UPDATE CASCADE ON DELETE RESTRICT,
  tramitador_id          smallint NOT NULL REFERENCES tramitadores(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  permite_preasignacion  boolean NOT NULL DEFAULT false, -- preasignacion de placa
  activo                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_ciudad_uk UNIQUE (ciudad_correspondencia),
  CONSTRAINT pdv_ciudad_ck CHECK (ciudad_correspondencia = upper(btrim(ciudad_correspondencia)))
);
CREATE TRIGGER trg_pdv_updated BEFORE UPDATE ON puntos_venta
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Coherencia: el tramitador asignado debe pertenecer al transito del PDV.
CREATE OR REPLACE FUNCTION fn_pdv_valida_tramitador()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE t_id smallint;
BEGIN
  SELECT transito_id INTO t_id FROM tramitadores WHERE id = NEW.tramitador_id;
  IF t_id IS DISTINCT FROM NEW.transito_id THEN
    RAISE EXCEPTION 'El tramitador % no pertenece al transito % del punto de venta %',
      NEW.tramitador_id, NEW.transito_id, NEW.ciudad_correspondencia
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_pdv_valida_tramitador BEFORE INSERT OR UPDATE ON puntos_venta
  FOR EACH ROW EXECUTE FUNCTION fn_pdv_valida_tramitador();

-- Catalogo de codigos comerciales (columna D)
CREATE TABLE IF NOT EXISTS codigos (
  codigo      text PRIMARY KEY,
  descripcion text,
  activo      boolean NOT NULL DEFAULT true,
  CONSTRAINT codigos_ck CHECK (codigo = upper(btrim(codigo)) AND codigo <> '')
);

-- ---------------------------------------------------------------------
-- 4. USUARIOS, SESIONES Y RBAC
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  password_hash       text NOT NULL,            -- bcrypt cost 12
  nombre              text NOT NULL,
  rol                 rol_usuario NOT NULL,
  -- Aislamiento por sede: obligatorio para ASESOR, nulo para ADMIN (acceso global)
  punto_venta_id      smallint REFERENCES puntos_venta(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  activo              boolean NOT NULL DEFAULT true,
  intentos_fallidos   smallint NOT NULL DEFAULT 0,
  bloqueado_hasta     timestamptz,
  ultimo_login        timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_email_ck CHECK (email = lower(btrim(email)) AND email LIKE '%@%'),
  CONSTRAINT usuarios_scope_ck CHECK (
    (rol = 'ASESOR' AND punto_venta_id IS NOT NULL) OR
    (rol = 'ADMIN'  AND punto_venta_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (email);
CREATE INDEX IF NOT EXISTS ix_usuarios_pdv ON usuarios (punto_venta_id) WHERE activo;
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Refresh tokens rotativos. Solo se almacena el SHA-256 del token.
CREATE TABLE IF NOT EXISTS sesiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash      text NOT NULL,
  ip              inet,
  user_agent      text,
  expira_en       timestamptz NOT NULL,
  revocada_en     timestamptz,
  reemplazada_por uuid REFERENCES sesiones(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sesiones_token_uk UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id, expira_en DESC);
CREATE INDEX IF NOT EXISTS ix_sesiones_vivas   ON sesiones (expira_en) WHERE revocada_en IS NULL;

-- Rate limiting distribuido (necesario en Vercel: la memoria no se comparte).
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket      text PRIMARY KEY,          -- p.ej. 'login:ip:181.x.x.x'
  hits        integer NOT NULL DEFAULT 0,
  ventana_fin timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rate_limit_ventana ON rate_limit (ventana_fin);

-- ---------------------------------------------------------------------
-- 5. REGISTROS (nucleo · columnas A..P del Excel)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A
  numero_identificacion    text NOT NULL,
  -- B
  nombre_completo          text NOT NULL,
  -- C
  fecha_apertura           date NOT NULL,
  -- D
  codigo                   text NOT NULL REFERENCES codigos(codigo) ON UPDATE CASCADE ON DELETE RESTRICT,
  -- E (define el aislamiento RBAC y el mapeo automatico)
  punto_venta_id           smallint NOT NULL REFERENCES puntos_venta(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  -- F
  prenda                   text,
  -- G / H / I
  marca                    text NOT NULL,
  linea                    text NOT NULL,
  modelo                   smallint NOT NULL,
  -- J (NULL mientras no se asigna; preasignada = reservada antes de matricular)
  placa                    text,
  placa_preasignada        boolean NOT NULL DEFAULT false,
  -- K / L
  soat_fecha_expedicion    date,
  fecha_matricula_emision  date,
  -- M / N
  chasis                   text NOT NULL,       -- VIN, unico
  motor                    text NOT NULL,
  -- O
  runt                     respuesta_runt NOT NULL DEFAULT 'NO',
  runt_validado_por        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  runt_validado_en         timestamptz,
  -- P
  observacion              text,

  -- Derivados del mapeo automatico (trigger). Persistidos para reportes rapidos.
  transito_id              smallint NOT NULL REFERENCES transitos(id)    ON UPDATE CASCADE ON DELETE RESTRICT,
  tramitador_id            smallint NOT NULL REFERENCES tramitadores(id) ON UPDATE CASCADE ON DELETE RESTRICT,

  -- Flujo / SLA
  estado                   estado_registro NOT NULL DEFAULT 'REGISTRADO',
  en_transito_en           timestamptz,
  matriculado_en           timestamptz,
  entregado_en             timestamptz,

  -- Trazabilidad y sincronizacion
  creado_por               uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por          uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  origen                   origen_sync NOT NULL DEFAULT 'APP',
  sheets_row               integer,             -- fila espejo en Google Sheets
  sheets_synced_at         timestamptz,
  row_version              integer NOT NULL DEFAULT 1,  -- concurrencia optimista
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reg_chasis_uk    UNIQUE (chasis),
  CONSTRAINT reg_ident_ck     CHECK (numero_identificacion ~ '^[0-9A-Z-]{5,20}$'),
  CONSTRAINT reg_nombre_ck    CHECK (char_length(btrim(nombre_completo)) >= 5),
  CONSTRAINT reg_chasis_ck    CHECK (chasis = upper(btrim(chasis)) AND char_length(chasis) BETWEEN 6 AND 25),
  CONSTRAINT reg_motor_ck     CHECK (motor  = upper(btrim(motor))  AND char_length(motor)  BETWEEN 4 AND 25),
  CONSTRAINT reg_placa_ck     CHECK (placa IS NULL OR placa ~ '^[A-Z]{3}[0-9]{2}[A-Z0-9]$'),
  CONSTRAINT reg_modelo_ck    CHECK (modelo BETWEEN 1980 AND 2100),
  CONSTRAINT reg_apertura_ck  CHECK (fecha_apertura <= CURRENT_DATE + 1),
  CONSTRAINT reg_matricula_ck CHECK (fecha_matricula_emision IS NULL OR fecha_matricula_emision >= fecha_apertura),
  -- Regla de oro: ningun estado de tramite o posterior sin RUNT verificado.
  CONSTRAINT reg_runt_gate_ck CHECK (
    estado NOT IN ('EN_TRANSITO', 'MATRICULADO', 'ENTREGADO') OR runt = 'SI'
  ),
  -- No se puede declarar matriculado sin placa definitiva ni fecha de matricula.
  CONSTRAINT reg_matriculado_ck CHECK (
    estado NOT IN ('MATRICULADO', 'ENTREGADO')
    OR (placa IS NOT NULL AND fecha_matricula_emision IS NOT NULL AND placa_preasignada = false)
  )
);

-- Placa unica entre registros vigentes (permite varios NULL y excluye anulados)
CREATE UNIQUE INDEX IF NOT EXISTS ux_registros_placa
  ON registros (placa) WHERE placa IS NOT NULL AND estado <> 'ANULADO';

-- Indices B-Tree de rendimiento alineados con las consultas reales del app
CREATE INDEX IF NOT EXISTS ix_reg_pdv_fecha      ON registros (punto_venta_id, fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS ix_reg_pdv_estado     ON registros (punto_venta_id, estado);
CREATE INDEX IF NOT EXISTS ix_reg_estado_fecha   ON registros (estado, fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS ix_reg_tramitador     ON registros (tramitador_id, estado);
CREATE INDEX IF NOT EXISTS ix_reg_transito       ON registros (transito_id, estado);
CREATE INDEX IF NOT EXISTS ix_reg_identificacion ON registros (numero_identificacion);
CREATE INDEX IF NOT EXISTS ix_reg_runt_pendiente ON registros (punto_venta_id) WHERE runt = 'NO' AND estado <> 'ANULADO';
CREATE INDEX IF NOT EXISTS ix_reg_sin_soat       ON registros (punto_venta_id) WHERE soat_fecha_expedicion IS NULL;
CREATE INDEX IF NOT EXISTS ix_reg_sheets_row     ON registros (sheets_row) WHERE sheets_row IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_reg_updated        ON registros (updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_reg_nombre_trgm    ON registros USING gin (nombre_completo gin_trgm_ops);

-- 5.1 Normalizacion + MAPEO AUTOMATICO Transito / Tramitador
CREATE OR REPLACE FUNCTION fn_registro_normaliza()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE pdv RECORD;
BEGIN
  NEW.numero_identificacion := upper(btrim(NEW.numero_identificacion));
  NEW.nombre_completo       := btrim(regexp_replace(NEW.nombre_completo, '[[:space:]]+', ' ', 'g'));
  NEW.chasis                := upper(btrim(NEW.chasis));
  NEW.motor                 := upper(btrim(NEW.motor));
  NEW.marca                 := upper(btrim(NEW.marca));
  NEW.linea                 := upper(btrim(NEW.linea));
  NEW.codigo                := upper(btrim(NEW.codigo));
  NEW.placa                 := nullif(upper(btrim(coalesce(NEW.placa, ''))), '');
  NEW.observacion           := nullif(btrim(coalesce(NEW.observacion, '')), '');

  -- El valor de CIUDAD CORRESPONDENCIA manda: nunca se confia en el cliente.
  SELECT transito_id, tramitador_id, permite_preasignacion
    INTO pdv
    FROM puntos_venta WHERE id = NEW.punto_venta_id;

  NEW.transito_id   := pdv.transito_id;
  NEW.tramitador_id := pdv.tramitador_id;

  IF NEW.placa_preasignada AND NOT pdv.permite_preasignacion THEN
    RAISE EXCEPTION 'PREASIGNACION_NO_PERMITIDA: el punto de venta no admite preasignacion de placa.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_registro_normaliza BEFORE INSERT OR UPDATE ON registros
  FOR EACH ROW EXECUTE FUNCTION fn_registro_normaliza();

-- 5.2 Guardian de la maquina de estados + BLOQUEO POR RUNT + sellos de tiempo
CREATE OR REPLACE FUNCTION fn_registro_flujo()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  flujo text[] := ARRAY['REGISTRADO','DOC_COMPLETA','EN_TRANSITO','MATRICULADO','ENTREGADO'];
  orden_old int;
  orden_new int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    orden_old := array_position(flujo, OLD.estado::text);
    orden_new := array_position(flujo, NEW.estado::text);

    -- BLOQUEO OBLIGATORIO POR RUNT (todos los PDV y todos los transitos)
    IF NEW.estado IN ('EN_TRANSITO','MATRICULADO','ENTREGADO') AND NEW.runt <> 'SI' THEN
      RAISE EXCEPTION 'RUNT_BLOQUEADO: el registro % no tiene inscripcion RUNT verificada. Ninguna carpeta se tramita sin RUNT.', NEW.id
        USING ERRCODE = 'P0001';
    END IF;

    -- No se permiten retrocesos en el flujo (ANULADO queda fuera del arreglo)
    IF orden_old IS NOT NULL AND orden_new IS NOT NULL AND orden_new < orden_old THEN
      RAISE EXCEPTION 'TRANSICION_INVALIDA: no se puede pasar de % a %.', OLD.estado, NEW.estado
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.estado = 'EN_TRANSITO' AND NEW.en_transito_en IS NULL THEN NEW.en_transito_en := now(); END IF;
    IF NEW.estado = 'MATRICULADO' AND NEW.matriculado_en IS NULL THEN NEW.matriculado_en := now(); END IF;
    IF NEW.estado = 'ENTREGADO'   AND NEW.entregado_en   IS NULL THEN NEW.entregado_en   := now(); END IF;
  END IF;

  -- No se puede retirar el RUNT de una carpeta ya radicada.
  IF TG_OP = 'UPDATE' AND NEW.runt = 'NO' AND OLD.runt = 'SI'
     AND NEW.estado IN ('EN_TRANSITO','MATRICULADO','ENTREGADO') THEN
    RAISE EXCEPTION 'RUNT_BLOQUEADO: no se puede retirar el RUNT de una carpeta radicada.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.runt = 'SI' AND (TG_OP = 'INSERT' OR OLD.runt = 'NO') AND NEW.runt_validado_en IS NULL THEN
    NEW.runt_validado_en := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_registro_flujo BEFORE INSERT OR UPDATE ON registros
  FOR EACH ROW EXECUTE FUNCTION fn_registro_flujo();

-- 5.3 Historial inmutable de estados (auditoria y SLA por etapa)
CREATE TABLE IF NOT EXISTS registro_historial (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registro_id     uuid NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
  estado_anterior estado_registro,
  estado_nuevo    estado_registro NOT NULL,
  usuario_id      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nota            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_hist_registro ON registro_historial (registro_id, created_at DESC);

CREATE OR REPLACE FUNCTION fn_registro_historial()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO registro_historial (registro_id, estado_anterior, estado_nuevo, usuario_id)
    VALUES (NEW.id, NULL, NEW.estado, NEW.creado_por);
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO registro_historial (registro_id, estado_anterior, estado_nuevo, usuario_id)
    VALUES (NEW.id, OLD.estado, NEW.estado, NEW.actualizado_por);
  END IF;
  RETURN NULL;
END $fn$;
CREATE TRIGGER trg_registro_historial AFTER INSERT OR UPDATE ON registros
  FOR EACH ROW EXECUTE FUNCTION fn_registro_historial();

-- ---------------------------------------------------------------------
-- 6. SOLICITUDES DE INSCRIPCION AL RUNT
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitudes_runt (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id           uuid REFERENCES registros(id) ON DELETE CASCADE,
  punto_venta_id        smallint NOT NULL REFERENCES puntos_venta(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  numero_identificacion text NOT NULL,
  nombre_completo       text NOT NULL,
  direccion_barrio      text NOT NULL,
  telefono              text NOT NULL,
  correo                text NOT NULL,
  cedula_url            text NOT NULL,          -- adjunto foto cedula (Supabase Storage / Drive)
  cedula_mime           text NOT NULL DEFAULT 'image/jpeg',
  estado                estado_solicitud_runt NOT NULL DEFAULT 'PENDIENTE',
  solicitado_por        uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  revisado_por          uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  revisado_en           timestamptz,
  motivo_rechazo        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sol_tel_ck     CHECK (telefono ~ '^[0-9+ ()-]{7,20}$'),
  CONSTRAINT sol_correo_ck  CHECK (correo = lower(btrim(correo)) AND correo LIKE '%@%.%'),
  CONSTRAINT sol_mime_ck    CHECK (cedula_mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
  CONSTRAINT sol_rechazo_ck CHECK (estado <> 'RECHAZADA' OR btrim(coalesce(motivo_rechazo,'')) <> '')
);
CREATE INDEX IF NOT EXISTS ix_sol_pendientes ON solicitudes_runt (punto_venta_id, created_at DESC) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS ix_sol_registro   ON solicitudes_runt (registro_id);
-- Una sola solicitud viva por cedula
CREATE UNIQUE INDEX IF NOT EXISTS ux_sol_activa ON solicitudes_runt (numero_identificacion) WHERE estado = 'PENDIENTE';
CREATE TRIGGER trg_sol_updated BEFORE UPDATE ON solicitudes_runt
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Solo ADMIN valida. Se refuerza en el backend y se blinda aqui.
CREATE OR REPLACE FUNCTION fn_solicitud_aplica_runt()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE rol_rev rol_usuario;
BEGIN
  IF NEW.estado <> OLD.estado AND NEW.estado IN ('APROBADA','RECHAZADA') THEN
    SELECT u.rol INTO rol_rev FROM usuarios u WHERE u.id = NEW.revisado_por;
    IF rol_rev IS DISTINCT FROM 'ADMIN' THEN
      RAISE EXCEPTION 'SOLO_ADMIN: la validacion de la inscripcion RUNT es exclusiva del administrador.'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.revisado_en := coalesce(NEW.revisado_en, now());

    IF NEW.estado = 'APROBADA' AND NEW.registro_id IS NOT NULL THEN
      UPDATE registros
         SET runt = 'SI',
             runt_validado_por = NEW.revisado_por,
             runt_validado_en  = now(),
             actualizado_por   = NEW.revisado_por
       WHERE id = NEW.registro_id AND runt = 'NO';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_solicitud_aplica_runt BEFORE UPDATE ON solicitudes_runt
  FOR EACH ROW EXECUTE FUNCTION fn_solicitud_aplica_runt();

-- ---------------------------------------------------------------------
-- 7. SINCRONIZACION Y AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direccion          text NOT NULL CHECK (direccion IN ('DB_TO_SHEETS','SHEETS_TO_DB')),
  filas_leidas       integer NOT NULL DEFAULT 0,
  filas_creadas      integer NOT NULL DEFAULT 0,
  filas_actualizadas integer NOT NULL DEFAULT 0,
  filas_con_error    integer NOT NULL DEFAULT 0,
  detalle            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ejecutado_por      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  duracion_ms        integer,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sync_log_fecha ON sync_log (created_at DESC);

CREATE TABLE IF NOT EXISTS auditoria (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  accion     text NOT NULL,   -- LOGIN_OK, LOGIN_FAIL, REGISTRO_CREATE, RUNT_APPROVE, EXPORT_XLSX...
  entidad    text,
  entidad_id text,
  ip         inet,
  user_agent text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha   ON auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_usuario ON auditoria (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_accion  ON auditoria (accion, created_at DESC);

-- ---------------------------------------------------------------------
-- 8. VISTAS DE LECTURA (fechas SIEMPRE en YYYY/MM/DD)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_registros AS
SELECT
  r.id,
  r.numero_identificacion              AS col_a_identificacion,
  r.nombre_completo                    AS col_b_nombre,
  fmt_fecha(r.fecha_apertura)          AS col_c_fecha_apertura,
  r.codigo                             AS col_d_codigo,
  pdv.ciudad_correspondencia           AS col_e_ciudad_correspondencia,
  r.prenda                             AS col_f_prenda,
  r.marca                              AS col_g_marca,
  r.linea                              AS col_h_linea,
  r.modelo                             AS col_i_modelo,
  r.placa                              AS col_j_placa,
  fmt_fecha(r.soat_fecha_expedicion)   AS col_k_soat,
  fmt_fecha(r.fecha_matricula_emision) AS col_l_fecha_matricula,
  r.chasis                             AS col_m_chasis,
  r.motor                              AS col_n_motor,
  CASE r.runt WHEN 'SI' THEN 'Si' ELSE 'No' END AS col_o_runt,
  r.observacion                        AS col_p_observacion,
  -- Metadatos operativos
  r.punto_venta_id, r.estado, r.runt, r.placa_preasignada,
  r.transito_id, r.tramitador_id,
  t.nombre  AS transito,
  tr.nombre AS tramitador,
  (r.runt = 'NO' AND r.estado <> 'ANULADO')            AS bloqueado_runt,
  (CURRENT_DATE - r.fecha_apertura)                    AS dias_desde_apertura,
  CASE WHEN r.en_transito_en IS NOT NULL
       THEN (CURRENT_DATE - r.en_transito_en::date) END AS dias_en_transito,
  CASE
    WHEN r.estado IN ('MATRICULADO','ENTREGADO')    THEN 'OK'
    WHEN r.runt = 'NO'                              THEN 'BLOQUEADO'
    WHEN (CURRENT_DATE - r.fecha_apertura) > 20      THEN 'CRITICO'
    WHEN (CURRENT_DATE - r.fecha_apertura) > 10      THEN 'ALERTA'
    ELSE 'EN_TIEMPO'
  END                                                  AS semaforo,
  r.sheets_row, r.row_version, r.updated_at
FROM registros r
JOIN puntos_venta pdv ON pdv.id = r.punto_venta_id
JOIN transitos    t   ON t.id   = r.transito_id
JOIN tramitadores tr  ON tr.id  = r.tramitador_id;

-- KPI 1: resumen global (agrupado por PDV para poder filtrar por RBAC)
CREATE OR REPLACE VIEW vw_kpi_resumen AS
SELECT
  r.punto_venta_id,
  count(*)                                                                      AS total_ventas,
  count(*) FILTER (WHERE r.estado IN ('MATRICULADO','ENTREGADO'))                AS matriculas_ejecutadas,
  count(*) FILTER (WHERE r.estado NOT IN ('MATRICULADO','ENTREGADO','ANULADO'))  AS pendientes,
  count(*) FILTER (WHERE r.soat_fecha_expedicion IS NOT NULL)                    AS soats_expedidos,
  count(*) FILTER (WHERE r.runt = 'NO' AND r.estado <> 'ANULADO')                AS bloqueados_runt,
  count(*) FILTER (WHERE r.estado = 'EN_TRANSITO')                               AS en_transito
FROM registros r
GROUP BY r.punto_venta_id;

-- KPI 2: RUNT no inscrito por PDV (cantidad y porcentaje)
CREATE OR REPLACE VIEW vw_kpi_runt_pdv AS
SELECT
  pdv.id                                   AS punto_venta_id,
  pdv.ciudad_correspondencia,
  t.nombre                                 AS transito,
  count(r.id)                              AS total,
  count(r.id) FILTER (WHERE r.runt = 'NO') AS no_inscritos,
  round(100.0 * count(r.id) FILTER (WHERE r.runt = 'NO')
        / greatest(count(r.id), 1), 2)     AS pct_no_inscritos
FROM puntos_venta pdv
JOIN transitos t ON t.id = pdv.transito_id
LEFT JOIN registros r ON r.punto_venta_id = pdv.id AND r.estado <> 'ANULADO'
GROUP BY pdv.id, pdv.ciudad_correspondencia, t.nombre;

-- KPI 3: SLA - dias promedio por tramitador y transito
CREATE OR REPLACE VIEW vw_kpi_sla AS
SELECT
  tr.id     AS tramitador_id,
  tr.nombre AS tramitador,
  t.nombre  AS transito,
  count(r.id) AS carpetas,
  round(avg(coalesce(r.matriculado_en::date, CURRENT_DATE) - r.fecha_apertura)::numeric, 1) AS dias_prom_total,
  round(avg(CASE WHEN r.en_transito_en IS NOT NULL
            THEN coalesce(r.matriculado_en::date, CURRENT_DATE) - r.en_transito_en::date END)::numeric, 1) AS dias_prom_transito,
  count(r.id) FILTER (WHERE r.estado = 'EN_TRANSITO'
        AND (CURRENT_DATE - r.en_transito_en::date) > 15) AS demoradas
FROM tramitadores tr
JOIN transitos t ON t.id = tr.transito_id
LEFT JOIN registros r ON r.tramitador_id = tr.id AND r.estado <> 'ANULADO'
GROUP BY tr.id, tr.nombre, t.nombre;

COMMIT;
