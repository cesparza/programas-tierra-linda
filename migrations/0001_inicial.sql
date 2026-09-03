-- Migración 0001 — base de publicación directa
-- Se aplica con: npx wrangler d1 migrations apply programas-tl --remote
-- (o por API con /d1/database/<uuid>/query)

CREATE TABLE IF NOT EXISTS programa (
  fecha TEXT PRIMARY KEY,                -- '2026-09-19', derivada de la fecha del programa
  titulo TEXT NOT NULL DEFAULT '',
  json TEXT NOT NULL,                    -- el modelo completo, sin logos
  espacios INTEGER NOT NULL DEFAULT 0,
  publicado_por TEXT NOT NULL DEFAULT '',
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS autor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,       -- SHA-256 (hex) del token; el token no se guarda
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- intentos fallidos de autenticación, para el límite por IP
CREATE TABLE IF NOT EXISTS intento (
  ip TEXT NOT NULL,
  momento INTEGER NOT NULL               -- epoch en milisegundos
);
CREATE INDEX IF NOT EXISTS idx_intento ON intento (ip, momento);

-- configuración de la aplicación; hoy solo la clave del mantenedor (su SHA-256)
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
