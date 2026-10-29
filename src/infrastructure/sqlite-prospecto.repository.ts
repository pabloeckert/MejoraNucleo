import { DatabaseSync } from 'node:sqlite';
import { Prospecto } from '../domain/prospecto.entity.js';
import { EstadoProspecto } from '../domain/estado-prospecto.enum.js';
import type {
  IProspectoRepository,
  ProspectoFiltros,
  ProspectoEventoRecord
} from '../domain/prospecto.repository.js';

interface ProspectoRow {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canal_origen: string;
  estado: string;
  created_at: string;
  updated_at: string;
}

export class SqliteProspectoRepository implements IProspectoRepository {
  private readonly db: DatabaseSync;

  constructor(dbOrPath: DatabaseSync | string = ':memory:') {
    if (typeof dbOrPath === 'string') {
      this.db = new DatabaseSync(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
    this.inicializarEsquema();
  }

  private inicializarEsquema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prospectos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        telefono TEXT NOT NULL,
        canal_origen TEXT NOT NULL,
        estado TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prospectos_email ON prospectos(email);
      CREATE INDEX IF NOT EXISTS idx_prospectos_telefono ON prospectos(telefono);
      CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos(estado);

      CREATE TABLE IF NOT EXISTS prospecto_eventos_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prospecto_id TEXT NOT NULL,
        evento TEXT NOT NULL,
        estado_anterior TEXT,
        estado_nuevo TEXT NOT NULL,
        detalles TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (prospecto_id) REFERENCES prospectos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_prospecto_eventos_pid ON prospecto_eventos_log(prospecto_id);
    `);
  }

  public async guardar(prospecto: Prospecto): Promise<void> {
    // Detectar si es creación o mutación de estado para auditoría append-only
    const existing = await this.buscarPorId(prospecto.id);

    const stmt = this.db.prepare(`
      INSERT INTO prospectos (id, nombre, email, telefono, canal_origen, estado, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre,
        email = excluded.email,
        telefono = excluded.telefono,
        canal_origen = excluded.canal_origen,
        estado = excluded.estado,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      prospecto.id,
      prospecto.nombre,
      prospecto.email,
      prospecto.telefono,
      prospecto.canalOrigen,
      prospecto.estado,
      prospecto.createdAt.toISOString(),
      prospecto.updatedAt.toISOString()
    );

    if (!existing) {
      await this.registrarEvento({
        prospectoId: prospecto.id,
        evento: 'PROSPECTO_CREADO',
        estadoAnterior: null,
        estadoNuevo: prospecto.estado,
        detalles: `Prospecto capturado vía ${prospecto.canalOrigen}`,
        timestamp: prospecto.createdAt.toISOString()
      });
    } else if (existing.estado !== prospecto.estado) {
      await this.registrarEvento({
        prospectoId: prospecto.id,
        evento: 'TRANSICION_ESTADO',
        estadoAnterior: existing.estado,
        estadoNuevo: prospecto.estado,
        detalles: `Transición de estado: ${existing.estado} -> ${prospecto.estado}`,
        timestamp: prospecto.updatedAt.toISOString()
      });
    }
  }

  public async registrarEvento(evento: ProspectoEventoRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO prospecto_eventos_log (prospecto_id, evento, estado_anterior, estado_nuevo, detalles, timestamp)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    stmt.run(
      evento.prospectoId,
      evento.evento,
      evento.estadoAnterior ?? null,
      evento.estadoNuevo,
      evento.detalles ?? null,
      evento.timestamp
    );
  }

  public async listarEventos(prospectoId: string): Promise<ProspectoEventoRecord[]> {
    const stmt = this.db.prepare(`
      SELECT id, prospecto_id, evento, estado_anterior, estado_nuevo, detalles, timestamp
      FROM prospecto_eventos_log
      WHERE prospecto_id = ?
      ORDER BY id ASC;
    `);
    const rows = stmt.all(prospectoId.trim()) as unknown as Array<{
      id: number;
      prospecto_id: string;
      evento: string;
      estado_anterior: string | null;
      estado_nuevo: string;
      detalles: string | null;
      timestamp: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      prospectoId: r.prospecto_id,
      evento: r.evento,
      estadoAnterior: r.estado_anterior,
      estadoNuevo: r.estado_nuevo,
      detalles: r.detalles,
      timestamp: r.timestamp
    }));
  }

  public async buscarPorId(id: string): Promise<Prospecto | null> {
    const stmt = this.db.prepare(`
      SELECT id, nombre, email, telefono, canal_origen, estado, created_at, updated_at
      FROM prospectos
      WHERE id = ?;
    `);

    const row = stmt.get(id.trim()) as unknown as ProspectoRow | undefined;
    if (!row) {
      return null;
    }

    return this.mapRowToEntity(row);
  }

  public async buscarPorEmail(email: string): Promise<Prospecto | null> {
    const stmt = this.db.prepare(`
      SELECT id, nombre, email, telefono, canal_origen, estado, created_at, updated_at
      FROM prospectos
      WHERE email = ?;
    `);

    const row = stmt.get(email.trim().toLowerCase()) as unknown as ProspectoRow | undefined;
    if (!row) {
      return null;
    }

    return this.mapRowToEntity(row);
  }

  public async buscarPorTelefono(telefono: string): Promise<Prospecto | null> {
    const stmt = this.db.prepare(`
      SELECT id, nombre, email, telefono, canal_origen, estado, created_at, updated_at
      FROM prospectos
      WHERE telefono = ?;
    `);

    const row = stmt.get(telefono.trim()) as unknown as ProspectoRow | undefined;
    if (!row) {
      return null;
    }

    return this.mapRowToEntity(row);
  }

  public async buscarTodos(filtros?: ProspectoFiltros): Promise<Prospecto[]> {
    let sql = `SELECT id, nombre, email, telefono, canal_origen, estado, created_at, updated_at FROM prospectos`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filtros?.estado) {
      conditions.push('estado = ?');
      params.push(filtros.estado);
    }

    if (filtros?.busqueda) {
      const pattern = `%${filtros.busqueda.trim()}%`;
      conditions.push('(nombre LIKE ? OR email LIKE ? OR telefono LIKE ? OR canal_origen LIKE ?)');
      params.push(pattern, pattern, pattern, pattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY rowid ASC LIMIT ? OFFSET ?;`;
    const limite = filtros?.limite ?? 50;
    const offset = filtros?.offset ?? 0;
    params.push(limite, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as ProspectoRow[];
    return rows.map((r) => this.mapRowToEntity(r));
  }

  public async eliminar(id: string): Promise<boolean> {
    const idNorm = id.trim();
    this.db.prepare(`DELETE FROM prospecto_eventos_log WHERE prospecto_id = ?;`).run(idNorm);
    const stmt = this.db.prepare(`DELETE FROM prospectos WHERE id = ?;`);
    const result = stmt.run(idNorm);
    return Number(result.changes) > 0;
  }

  public close(): void {
    if (this.db.isOpen) {
      this.db.close();
    }
  }

  private mapRowToEntity(row: ProspectoRow): Prospecto {
    return new Prospecto({
      id: row.id,
      nombre: row.nombre,
      email: row.email,
      telefono: row.telefono,
      canalOrigen: row.canal_origen,
      estado: row.estado as EstadoProspecto,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    });
  }
}
