/**
 * MejoraNucleo - Modelo y Repositorio Canónico: Contacto
 * Validación estricta, parseo canónico y persistencia en SQLite.
 */
import crypto from 'node:crypto';
import { getDb } from '../db/connection.mjs';

const ORIGENES_VALIDOS = new Set(['manual', 'whatsapp', 'import_excel', 'frontdesk', 'crm', 'web']);
const ESTADOS_VALIDOS = new Set(['nuevo', 'activo', 'inactivo', 'prospecto', 'cliente', 'archivado']);

/**
 * Valida y transforma un payload crudo a una estructura canónica de Contacto.
 * @param {object} raw Payload crudo recibido.
 * @param {boolean} isUpdate Si es una actualización parcial.
 * @returns {object} Estructura canónica validada.
 */
export function parseContactoCanonical(raw, isUpdate = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El payload de Contacto debe ser un objeto JSON válido');
  }

  const parsed = {};

  // Campo Nombre
  if (!isUpdate || raw.nombre !== undefined) {
    if (typeof raw.nombre !== 'string' || raw.nombre.trim().length === 0) {
      throw new Error('El campo "nombre" es obligatorio y debe ser una cadena no vacía');
    }
    parsed.nombre = raw.nombre.trim();
  }

  // Campo Telefono
  if (!isUpdate || raw.telefono !== undefined) {
    if (typeof raw.telefono !== 'string' || raw.telefono.trim().length === 0) {
      throw new Error('El campo "telefono" es obligatorio y debe ser una cadena no vacía');
    }
    parsed.telefono = raw.telefono.trim();
  }

  // Apellido
  if (raw.apellido !== undefined) {
    parsed.apellido = typeof raw.apellido === 'string' ? raw.apellido.trim() : null;
  } else if (!isUpdate) {
    parsed.apellido = null;
  }

  // Email
  if (raw.email !== undefined) {
    parsed.email = typeof raw.email === 'string' && raw.email.trim().length > 0 ? raw.email.trim() : null;
  } else if (!isUpdate) {
    parsed.email = null;
  }

  // Empresa
  if (raw.empresa !== undefined) {
    parsed.empresa = typeof raw.empresa === 'string' ? raw.empresa.trim() : null;
  } else if (!isUpdate) {
    parsed.empresa = null;
  }

  // Cargo
  if (raw.cargo !== undefined) {
    parsed.cargo = typeof raw.cargo === 'string' ? raw.cargo.trim() : null;
  } else if (!isUpdate) {
    parsed.cargo = null;
  }

  // Origen
  if (raw.origen !== undefined) {
    const origenNorm = String(raw.origen).trim().toLowerCase();
    if (!ORIGENES_VALIDOS.has(origenNorm)) {
      throw new Error(`Origen inválido: ${raw.origen}. Válidos: ${Array.from(ORIGENES_VALIDOS).join(', ')}`);
    }
    parsed.origen = origenNorm;
  } else if (!isUpdate) {
    parsed.origen = 'manual';
  }

  // Estado
  if (raw.estado !== undefined) {
    const estadoNorm = String(raw.estado).trim().toLowerCase();
    if (!ESTADOS_VALIDOS.has(estadoNorm)) {
      throw new Error(`Estado inválido: ${raw.estado}. Válidos: ${Array.from(ESTADOS_VALIDOS).join(', ')}`);
    }
    parsed.estado = estadoNorm;
  } else if (!isUpdate) {
    parsed.estado = 'nuevo';
  }

  // Notas
  if (raw.notas !== undefined) {
    parsed.notas = typeof raw.notas === 'string' ? raw.notas.trim() : null;
  } else if (!isUpdate) {
    parsed.notas = null;
  }

  // UUID
  if (!isUpdate) {
    parsed.uuid = typeof raw.uuid === 'string' && raw.uuid.trim().length > 0
      ? raw.uuid.trim()
      : crypto.randomUUID();
  }

  return parsed;
}

export const ContactoRepository = {
  /**
   * Crea y persiste un nuevo Contacto en MejoraNucleo.
   * @param {object} rawData Datos crudos del contacto.
   * @returns {object} Contacto persistido completo.
   */
  create(rawData) {
    const db = getDb();
    const data = parseContactoCanonical(rawData, false);

    const stmt = db.prepare(`
      INSERT INTO contactos (
        uuid, nombre, apellido, telefono, email, empresa, cargo, origen, estado, notas
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const result = stmt.run(
      data.uuid,
      data.nombre,
      data.apellido,
      data.telefono,
      data.email,
      data.empresa,
      data.cargo,
      data.origen,
      data.estado,
      data.notas
    );

    const insertedId = Number(result.lastInsertRowid);
    return this.findById(insertedId);
  },

  /**
   * Obtiene un contacto por su identificador numérico interno.
   * @param {number} id ID del contacto.
   * @returns {object|null}
   */
  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM contactos WHERE id = ?');
    const row = stmt.get(Number(id));
    return row || null;
  },

  /**
   * Obtiene un contacto por su UUID único.
   * @param {string} uuid UUID del contacto.
   * @returns {object|null}
   */
  findByUuid(uuid) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM contactos WHERE uuid = ?');
    const row = stmt.get(String(uuid));
    return row || null;
  },

  /**
   * Lista contactos con paginación y búsqueda por texto.
   * @param {object} [options]
   * @returns {{ items: object[], total: number }}
   */
  findAll(options = {}) {
    const db = getDb();
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
    const offset = Math.max(0, Number(options.offset) || 0);
    const buscar = options.buscar ? String(options.buscar).trim() : null;

    if (buscar) {
      const term = `%${buscar}%`;
      const countStmt = db.prepare(`
        SELECT COUNT(*) as count FROM contactos
        WHERE nombre LIKE ? OR apellido LIKE ? OR telefono LIKE ? OR empresa LIKE ?
      `);
      const countRow = countStmt.get(term, term, term, term);
      const total = Number(countRow.count);

      const itemsStmt = db.prepare(`
        SELECT * FROM contactos
        WHERE nombre LIKE ? OR apellido LIKE ? OR telefono LIKE ? OR empresa LIKE ?
        ORDER BY id DESC LIMIT ? OFFSET ?
      `);
      const items = itemsStmt.all(term, term, term, term, limit, offset);

      return { items, total, limit, offset };
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM contactos').get();
    const total = Number(countRow.count);

    const itemsStmt = db.prepare('SELECT * FROM contactos ORDER BY id DESC LIMIT ? OFFSET ?');
    const items = itemsStmt.all(limit, offset);

    return { items, total, limit, offset };
  },

  /**
   * Actualiza un contacto existente.
   * @param {number} id ID del contacto a actualizar.
   * @param {object} rawData Campos a actualizar.
   * @returns {object|null} Contacto actualizado.
   */
  update(id, rawData) {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const parsed = parseContactoCanonical(rawData, true);
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return existing;
    }

    const setClauses = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => parsed[k]);

    const sql = `
      UPDATE contactos
      SET ${setClauses}, actualizado_el = datetime('now')
      WHERE id = ?
    `;

    const db = getDb();
    const stmt = db.prepare(sql);
    stmt.run(...values, Number(id));

    return this.findById(id);
  },

  /**
   * Elimina un contacto por su ID.
   * @param {number} id
   * @returns {boolean} True si fue eliminado.
   */
  delete(id) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM contactos WHERE id = ?');
    const res = stmt.run(Number(id));
    return res.changes > 0;
  }
};
