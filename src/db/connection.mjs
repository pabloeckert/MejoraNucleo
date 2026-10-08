/**
 * MejoraNucleo - Motor de Persistencia Centralizado SQLite
 * Conexión canónica con soporte WAL, Foreign Keys y Migraciones automáticas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio raíz de MejoraNucleo
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_DB_PATH = path.join(ROOT_DIR, 'data', 'nucleo.db');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');

let dbInstance = null;

/**
 * Obtiene o inicializa la conexión a la base de datos central de MejoraNucleo.
 * @param {string} [customPath] Ruta personalizada opcional para la base SQLite.
 * @returns {DatabaseSync} Instancia activa de DatabaseSync.
 */
export function getDb(customPath) {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.NUCLEO_DB_PATH || DEFAULT_DB_PATH;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new DatabaseSync(dbPath);

  // Pragmas de alta performance e integridad transaccional
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA synchronous = NORMAL;');
  dbInstance.exec('PRAGMA busy_timeout = 5000;');

  // Ejecución de migraciones automáticas
  applyMigrations(dbInstance, MIGRATIONS_DIR);

  return dbInstance;
}

/**
 * Aplica migraciones ordenadas de manera idempotente.
 * @param {DatabaseSync} db Instancia de la base de datos.
 * @param {string} migrationsDir Directorio con scripts SQL de migración.
 */
export function applyMigrations(db, migrationsDir = MIGRATIONS_DIR) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all();
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Ejecución segura de la migración
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec(sql);
      const insert = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
      insert.run(file);
      db.exec('COMMIT;');
      console.log(`[MejoraNucleo] Migración aplicada exitosamente: ${file}`);
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error(`[MejoraNucleo] Error crítico en migración ${file}:`, err);
      throw err;
    }
  }
}

/**
 * Retorna telemetría y estado de salud de la base de datos.
 * @returns {object} Estado de conexión y tablas persistidas.
 */
export function getDbStatus() {
  if (!dbInstance) {
    return { connected: false, tableCount: 0, tables: [] };
  }

  const rows = dbInstance
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name"
    )
    .all();

  return {
    connected: true,
    engine: 'node:sqlite (DatabaseSync WAL)',
    dbPath: process.env.NUCLEO_DB_PATH || DEFAULT_DB_PATH,
    tableCount: rows.length,
    tables: rows.map((r) => r.name)
  };
}

/**
 * Cierra la conexión activa a SQLite.
 */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
