/**
 * MejoraNucleo - Modelo y Repositorio Canónico: Usuario / Identidad
 * Gestión de identidades, roles y credenciales para el ecosistema Mejora Suite.
 */
import crypto from 'node:crypto';
import { getDb } from '../db/connection.mjs';

const ROLES_VALIDOS = new Set(['admin', 'dueno', 'gerente', 'vendedor', 'operador']);

/**
 * Valida y normaliza el payload canónico de Usuario/Identidad.
 * @param {object} raw Payload recibido.
 * @param {boolean} isUpdate Si es una actualización parcial.
 * @returns {object} Objeto validado.
 */
export function parseUsuarioCanonical(raw, isUpdate = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El payload de Usuario debe ser un objeto JSON válido');
  }

  const parsed = {};

  // Nombre
  if (!isUpdate || raw.nombre !== undefined) {
    if (typeof raw.nombre !== 'string' || raw.nombre.trim().length === 0) {
      throw new Error('El campo "nombre" es obligatorio y debe ser una cadena no vacía');
    }
    parsed.nombre = raw.nombre.trim();
  }

  // Email
  if (!isUpdate || raw.email !== undefined) {
    if (typeof raw.email !== 'string' || !raw.email.includes('@')) {
      throw new Error('El campo "email" es obligatorio y debe contener un correo electrónico válido');
    }
    parsed.email = raw.email.trim().toLowerCase();
  }

  // Password Hash (o PIN)
  if (!isUpdate || raw.password_hash !== undefined || raw.pin !== undefined) {
    const rawPass = raw.password_hash || raw.pin || raw.password;
    if (!rawPass || typeof rawPass !== 'string' || rawPass.length < 4) {
      throw new Error('Se requiere un password_hash o clave de al menos 4 caracteres');
    }
    // Si viene en texto plano, generar hash criptográfico SHA-256 para almacenamiento seguro
    parsed.password_hash = rawPass.startsWith('$') || rawPass.length === 64
      ? rawPass
      : crypto.createHash('sha256').update(rawPass).digest('hex');
  }

  // Rol
  if (raw.rol !== undefined) {
    const rolNorm = String(raw.rol).trim().toLowerCase();
    if (!ROLES_VALIDOS.has(rolNorm)) {
      throw new Error(`Rol inválido: ${raw.rol}. Válidos: ${Array.from(ROLES_VALIDOS).join(', ')}`);
    }
    parsed.rol = rolNorm;
  } else if (!isUpdate) {
    parsed.rol = 'vendedor';
  }

  // Activo
  if (raw.activo !== undefined) {
    parsed.activo = raw.activo ? 1 : 0;
  } else if (!isUpdate) {
    parsed.activo = 1;
  }

  // UUID
  if (!isUpdate) {
    parsed.uuid = typeof raw.uuid === 'string' && raw.uuid.trim().length > 0
      ? raw.uuid.trim()
      : crypto.randomUUID();
  }

  return parsed;
}

export const UsuarioRepository = {
  /**
   * Crea un nuevo usuario en MejoraNucleo.
   * @param {object} rawData
   * @returns {object} Usuario creado sin exponer el password_hash plano.
   */
  create(rawData) {
    const db = getDb();
    const data = parseUsuarioCanonical(rawData, false);

    const stmt = db.prepare(`
      INSERT INTO usuarios (
        uuid, nombre, email, password_hash, rol, activo
      ) VALUES (
        ?, ?, ?, ?, ?, ?
      )
    `);

    const result = stmt.run(
      data.uuid,
      data.nombre,
      data.email,
      data.password_hash,
      data.rol,
      data.activo
    );

    const insertedId = Number(result.lastInsertRowid);
    return this.findById(insertedId);
  },

  /**
   * Busca usuario por ID.
   * @param {number} id
   * @returns {object|null}
   */
  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT id, uuid, nombre, email, rol, activo, creado_el, actualizado_el FROM usuarios WHERE id = ?');
    const row = stmt.get(Number(id));
    return row || null;
  },

  /**
   * Busca usuario por Email.
   * @param {string} email
   * @returns {object|null}
   */
  findByEmail(email) {
    const db = getDb();
    const stmt = db.prepare('SELECT id, uuid, nombre, email, rol, activo, creado_el, actualizado_el FROM usuarios WHERE email = ?');
    const row = stmt.get(String(email).trim().toLowerCase());
    return row || null;
  },

  /**
   * Lista todos los usuarios registrados.
   * @returns {object[]}
   */
  findAll() {
    const db = getDb();
    const stmt = db.prepare('SELECT id, uuid, nombre, email, rol, activo, creado_el, actualizado_el FROM usuarios ORDER BY id ASC');
    return stmt.all();
  },

  /**
   * Actualiza datos de un usuario.
   * @param {number} id
   * @param {object} rawData
   * @returns {object|null}
   */
  update(id, rawData) {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const parsed = parseUsuarioCanonical(rawData, true);
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return existing;
    }

    const setClauses = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => parsed[k]);

    const sql = `
      UPDATE usuarios
      SET ${setClauses}, actualizado_el = datetime('now')
      WHERE id = ?
    `;

    const db = getDb();
    const stmt = db.prepare(sql);
    stmt.run(...values, Number(id));

    return this.findById(id);
  },

  /**
   * Elimina un usuario por ID.
   * @param {number} id
   * @returns {boolean}
   */
  delete(id) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM usuarios WHERE id = ?');
    const res = stmt.run(Number(id));
    return res.changes > 0;
  }
};
