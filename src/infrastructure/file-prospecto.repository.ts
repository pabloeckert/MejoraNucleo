import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Prospecto } from '../domain/prospecto.entity.js';
import { EstadoProspecto } from '../domain/estado-prospecto.enum.js';
import type {
  IProspectoRepository,
  ProspectoFiltros,
  ProspectoEventoRecord
} from '../domain/prospecto.repository.js';

interface ProspectoRecord {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  estado: EstadoProspecto;
  createdAt: string;
  updatedAt: string;
}

export class FileProspectoRepository implements IProspectoRepository {
  private readonly filePath: string;
  private readonly eventosFilePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    const parsed = path.parse(this.filePath);
    this.eventosFilePath = path.join(parsed.dir, `${parsed.name}.eventos${parsed.ext}`);
  }

  public async guardar(prospecto: Prospecto): Promise<void> {
    await this.withLock(async () => {
      const records = await this.readRecords();
      const index = records.findIndex((r) => r.id === prospecto.id);
      const existing = index >= 0 ? records[index] : null;
      const record: ProspectoRecord = {
        id: prospecto.id,
        nombre: prospecto.nombre,
        email: prospecto.email,
        telefono: prospecto.telefono,
        canalOrigen: prospecto.canalOrigen,
        estado: prospecto.estado,
        createdAt: prospecto.createdAt.toISOString(),
        updatedAt: prospecto.updatedAt.toISOString()
      };

      if (index >= 0) {
        records[index] = record;
      } else {
        records.push(record);
      }
      await this.writeRecords(records);

      if (!existing) {
        await this.registrarEventoInternal({
          prospectoId: prospecto.id,
          evento: 'PROSPECTO_CREADO',
          estadoAnterior: null,
          estadoNuevo: prospecto.estado,
          detalles: `Prospecto capturado vía ${prospecto.canalOrigen}`,
          timestamp: prospecto.createdAt.toISOString()
        });
      } else if (existing.estado !== prospecto.estado) {
        await this.registrarEventoInternal({
          prospectoId: prospecto.id,
          evento: 'TRANSICION_ESTADO',
          estadoAnterior: existing.estado,
          estadoNuevo: prospecto.estado,
          detalles: `Transición de estado: ${existing.estado} -> ${prospecto.estado}`,
          timestamp: prospecto.updatedAt.toISOString()
        });
      }
    });
  }

  public async registrarEvento(evento: ProspectoEventoRecord): Promise<void> {
    await this.withLock(async () => {
      await this.registrarEventoInternal(evento);
    });
  }

  private async registrarEventoInternal(evento: ProspectoEventoRecord): Promise<void> {
    const eventos = await this.readEventos();
    eventos.push({
      id: eventos.length + 1,
      ...evento
    });
    await this.writeEventos(eventos);
  }

  public async listarEventos(prospectoId: string): Promise<ProspectoEventoRecord[]> {
    const eventos = await this.readEventos();
    return eventos.filter((e) => e.prospectoId === prospectoId);
  }

  private async readEventos(): Promise<ProspectoEventoRecord[]> {
    try {
      const data = await fs.readFile(this.eventosFilePath, 'utf-8');
      if (!data.trim()) return [];
      return JSON.parse(data) as ProspectoEventoRecord[];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeEventos(eventos: ProspectoEventoRecord[]): Promise<void> {
    const dir = path.dirname(this.eventosFilePath);
    await fs.mkdir(dir, { recursive: true });
    const serialized = JSON.stringify(eventos, null, 2);
    const tempPath = `${this.eventosFilePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, serialized, 'utf-8');
    await fs.rename(tempPath, this.eventosFilePath);
  }

  public async buscarPorId(id: string): Promise<Prospecto | null> {
    const records = await this.readRecords();
    const found = records.find((r) => r.id === id.trim());
    return found ? this.mapRecordToEntity(found) : null;
  }

  public async buscarPorEmail(email: string): Promise<Prospecto | null> {
    const emailNorm = email.trim().toLowerCase();
    const records = await this.readRecords();
    const found = records.find((r) => r.email.toLowerCase() === emailNorm);
    return found ? this.mapRecordToEntity(found) : null;
  }

  public async buscarPorTelefono(telefono: string): Promise<Prospecto | null> {
    const telNorm = telefono.trim();
    const records = await this.readRecords();
    const found = records.find((r) => r.telefono === telNorm);
    return found ? this.mapRecordToEntity(found) : null;
  }

  public async buscarTodos(filtros?: ProspectoFiltros): Promise<Prospecto[]> {
    let records = await this.readRecords();

    if (filtros?.estado) {
      records = records.filter((r) => r.estado === filtros.estado);
    }

    if (filtros?.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      records = records.filter(
        (r) =>
          r.nombre.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.telefono.includes(q) ||
          r.canalOrigen.toLowerCase().includes(q)
      );
    }

    const offset = filtros?.offset ?? 0;
    const limite = filtros?.limite ?? 50;

    return records.slice(offset, offset + limite).map((r) => this.mapRecordToEntity(r));
  }

  public async eliminar(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const records = await this.readRecords();
      const initialLength = records.length;
      const filtered = records.filter((r) => r.id !== id.trim());

      if (filtered.length === initialLength) {
        return false;
      }

      await this.writeRecords(filtered);
      return true;
    });
  }

  private async readRecords(): Promise<ProspectoRecord[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  private async writeRecords(records: ProspectoRecord[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    const serialized = JSON.stringify(records, null, 2);

    await fs.writeFile(tempPath, serialized, 'utf-8');
    await fs.rename(tempPath, this.filePath);
  }

  private mapRecordToEntity(record: ProspectoRecord): Prospecto {
    return new Prospecto({
      id: record.id,
      nombre: record.nombre,
      email: record.email,
      telefono: record.telefono,
      canalOrigen: record.canalOrigen,
      estado: record.estado,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt)
    });
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let result!: T;
    this.writeQueue = this.writeQueue.then(async () => {
      result = await fn();
    });
    await this.writeQueue;
    return result;
  }
}
