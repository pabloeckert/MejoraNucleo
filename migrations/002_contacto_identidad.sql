-- ==============================================================================
-- MEJORA NUCLEO - MIGRACIÓN 002: MODELOS CENTRALIZADOS CONTACTO E IDENTIDAD
-- Base de datos centralizada de persistencia para Mejora Suite
-- ==============================================================================

-- 1. Tabla Centralizada: Contactos
CREATE TABLE IF NOT EXISTS contactos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT,
  telefono TEXT NOT NULL,
  email TEXT,
  empresa TEXT,
  cargo TEXT,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'whatsapp', 'import_excel', 'frontdesk', 'crm', 'web')),
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'activo', 'inactivo', 'prospecto', 'cliente', 'archivado')),
  notas TEXT,
  creado_el TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_el TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contactos_uuid ON contactos(uuid);
CREATE INDEX IF NOT EXISTS idx_contactos_telefono ON contactos(telefono);
CREATE INDEX IF NOT EXISTS idx_contactos_email ON contactos(email);

-- 2. Tabla Centralizada: Usuarios / Identidad
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'dueno', 'gerente', 'vendedor', 'operador')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_el TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_el TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_uuid ON usuarios(uuid);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- 3. Vistas de compatibilidad canónica para singular/plural
CREATE VIEW IF NOT EXISTS v_contactos AS SELECT * FROM contactos;
CREATE VIEW IF NOT EXISTS v_usuarios_identidad AS SELECT * FROM usuarios;
