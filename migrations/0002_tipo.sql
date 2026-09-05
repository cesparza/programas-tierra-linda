-- Migración 0002 — una fecha puede tener varios programas
-- El culto del sábado en la mañana y la Sociedad de Jóvenes de esa tarde son dos
-- publicaciones distintas. La llave pasa de `fecha` a `fecha + tipo`.
-- El API la aplica solo en su primer arranque (functions/api/[[ruta]].js); este
-- archivo es la documentación del esquema y la forma de aplicarla a mano.
--
-- La tabla `programa` NO se borra: queda como respaldo de lo publicado antes.

CREATE TABLE IF NOT EXISTS publicacion (
  clave TEXT PRIMARY KEY,                -- '2026-09-05' o '2026-09-05-sociedad-de-jovenes'
  fecha TEXT NOT NULL,                   -- '2026-09-05'
  tipo TEXT NOT NULL DEFAULT '',         -- '' = el programa principal del día
  titulo TEXT NOT NULL DEFAULT '',
  json TEXT NOT NULL,
  espacios INTEGER NOT NULL DEFAULT 0,
  publicado_por TEXT NOT NULL DEFAULT '',
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_publicacion_fecha ON publicacion (fecha);

-- lo ya publicado pasa como programa principal de su fecha
INSERT OR IGNORE INTO publicacion (clave, fecha, tipo, titulo, json, espacios, publicado_por, actualizado_en)
  SELECT fecha, fecha, '', titulo, json, espacios, publicado_por, actualizado_en FROM programa;
