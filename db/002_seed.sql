-- =====================================================================
--  Datos maestros: transitos, tramitadores y MAPEO AUTOMATICO por
--  CIUDAD CORRESPONDENCIA (regla de negocio 4.1). Idempotente.
-- =====================================================================
BEGIN;

INSERT INTO transitos (nombre) VALUES ('Planeta Rica'), ('Caucasia'), ('Sincelejo')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tramitadores (nombre, transito_id) VALUES
  ('Richar Zapata',   (SELECT id FROM transitos WHERE nombre = 'Planeta Rica')),
  ('Richar Barroso',  (SELECT id FROM transitos WHERE nombre = 'Planeta Rica')),
  ('Mirna Gutierrez', (SELECT id FROM transitos WHERE nombre = 'Caucasia')),
  ('Yuliana',         (SELECT id FROM transitos WHERE nombre = 'Sincelejo'))
ON CONFLICT (nombre) DO NOTHING;

-- CIUDAD CORRESPONDENCIA -> TRANSITO | TRAMITADOR | preasignacion de placa
INSERT INTO puntos_venta (ciudad_correspondencia, transito_id, tramitador_id, permite_preasignacion)
VALUES
  ('PLANETA RICA',         (SELECT id FROM transitos WHERE nombre='Planeta Rica'), (SELECT id FROM tramitadores WHERE nombre='Richar Zapata'),   false),
  ('PUERTO LIBERTADOR',    (SELECT id FROM transitos WHERE nombre='Planeta Rica'), (SELECT id FROM tramitadores WHERE nombre='Richar Barroso'),  false),
  ('MONTELIBANO MOBILITY', (SELECT id FROM transitos WHERE nombre='Planeta Rica'), (SELECT id FROM tramitadores WHERE nombre='Richar Barroso'),  false),
  ('MONTELIBANO TVS',      (SELECT id FROM transitos WHERE nombre='Planeta Rica'), (SELECT id FROM tramitadores WHERE nombre='Richar Barroso'),  false),
  ('AYAPEL',               (SELECT id FROM transitos WHERE nombre='Caucasia'),     (SELECT id FROM tramitadores WHERE nombre='Mirna Gutierrez'), true),
  ('NECHI',                (SELECT id FROM transitos WHERE nombre='Caucasia'),     (SELECT id FROM tramitadores WHERE nombre='Mirna Gutierrez'), true),
  ('ZARAGOZA',             (SELECT id FROM transitos WHERE nombre='Caucasia'),     (SELECT id FROM tramitadores WHERE nombre='Mirna Gutierrez'), true),
  ('GUARANDA',             (SELECT id FROM transitos WHERE nombre='Sincelejo'),    (SELECT id FROM tramitadores WHERE nombre='Yuliana'),         false),
  ('MAJAGUAL',             (SELECT id FROM transitos WHERE nombre='Sincelejo'),    (SELECT id FROM tramitadores WHERE nombre='Yuliana'),         false),
  ('SAN MARCOS',           (SELECT id FROM transitos WHERE nombre='Sincelejo'),    (SELECT id FROM tramitadores WHERE nombre='Yuliana'),         false),
  ('SUCRE',                (SELECT id FROM transitos WHERE nombre='Sincelejo'),    (SELECT id FROM tramitadores WHERE nombre='Yuliana'),         false)
ON CONFLICT (ciudad_correspondencia) DO UPDATE
  SET transito_id           = EXCLUDED.transito_id,
      tramitador_id         = EXCLUDED.tramitador_id,
      permite_preasignacion = EXCLUDED.permite_preasignacion;

-- Codigos comerciales (columna D). Ajustar a la realidad del negocio.
INSERT INTO codigos (codigo, descripcion) VALUES
  ('CONTADO',   'Venta de contado'),
  ('CREDITO',   'Venta a credito con prenda'),
  ('LEASING',   'Leasing / financiera'),
  ('TRASPASO',  'Traspaso de propiedad'),
  ('RETOMA',    'Vehiculo en retoma')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
