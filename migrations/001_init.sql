-- Nucleo Mejora: schema base, seis entidades (ver .claude/skills/mejora-nucleo/SKILL.md)

CREATE TABLE Negocio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rubro TEXT NOT NULL,
  moneda TEXT NOT NULL,
  catalogo_activo TEXT NOT NULL CHECK (catalogo_activo IN ('producto', 'servicio', 'ambos'))
);

CREATE TABLE Usuario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('dueno', 'gerente', 'vendedor')),
  pin TEXT NOT NULL
);

CREATE TABLE TurnoCaja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES Usuario(id),
  monto_apertura REAL NOT NULL,
  monto_cierre REAL,
  fecha_apertura TEXT NOT NULL,
  fecha_cierre TEXT,
  diferencia REAL
);

CREATE TABLE Cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  whatsapp TEXT,
  instagram_tiktok TEXT,
  empresa TEXT,
  cargo TEXT,
  tag TEXT CHECK (tag IN ('frecuente', 'ocasional')),
  notas TEXT
);

CREATE TABLE Item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('producto', 'servicio')),
  nombre TEXT NOT NULL,
  categoria TEXT,
  descripcion TEXT,
  precio_costo REAL,
  precio_venta REAL NOT NULL,
  stock INTEGER,
  duracion TEXT,
  tiempo_entrega TEXT,
  alerta_stock_minimo INTEGER
);

CREATE TABLE Transaccion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER NOT NULL REFERENCES TurnoCaja(id),
  cliente_id INTEGER REFERENCES Cliente(id),
  fecha TEXT NOT NULL,
  lineas TEXT NOT NULL,
  total REAL NOT NULL,
  medio_pago TEXT NOT NULL CHECK (medio_pago IN ('efectivo', 'tarjeta', 'transferencia', 'QR')),
  forma_pago TEXT NOT NULL CHECK (forma_pago IN ('contado', 'financiado'))
);

CREATE TABLE MovimientoCaja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turno_id INTEGER NOT NULL REFERENCES TurnoCaja(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('venta', 'gasto', 'ajuste')),
  categoria TEXT CHECK (categoria IN ('servicios', 'proveedores', 'sueldos', 'caja_chica', 'operativo')),
  monto REAL NOT NULL,
  motivo TEXT,
  fecha TEXT NOT NULL
);
