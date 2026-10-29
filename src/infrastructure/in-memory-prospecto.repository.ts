import { Prospecto } from '../domain/prospecto.entity.js';
import type {
  IProspectoRepository,
  ProspectoFiltros,
  ProspectoEventoRecord
} from '../domain/prospecto.repository.js';

export class InMemoryProspectoRepository implements IProspectoRepository {
  private readonly items: Map<string, Prospecto> = new Map();
  private readonly eventos: ProspectoEventoRecord[] = [];

  public async guardar(prospecto: Prospecto): Promise<void> {
    const existing = this.items.get(prospecto.id);
    this.items.set(prospecto.id, prospecto);

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
    this.eventos.push(evento);
  }

  public async listarEventos(prospectoId: string): Promise<ProspectoEventoRecord[]> {
    return this.eventos.filter((e) => e.prospectoId === prospectoId);
  }

  public async buscarPorId(id: string): Promise<Prospecto | null> {
    const item = this.items.get(id);
    return item ?? null;
  }

  public async buscarPorEmail(email: string): Promise<Prospecto | null> {
    const emailNorm = email.trim().toLowerCase();
    for (const item of this.items.values()) {
      if (item.email === emailNorm) {
        return item;
      }
    }
    return null;
  }

  public async buscarPorTelefono(telefono: string): Promise<Prospecto | null> {
    const telNorm = telefono.trim();
    for (const item of this.items.values()) {
      if (item.telefono === telNorm) {
        return item;
      }
    }
    return null;
  }

  public async buscarTodos(filtros?: ProspectoFiltros): Promise<Prospecto[]> {
    let resultado = Array.from(this.items.values());

    if (filtros?.estado) {
      resultado = resultado.filter((p) => p.estado === filtros.estado);
    }

    if (filtros?.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      resultado = resultado.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.telefono.includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.canalOrigen.toLowerCase().includes(q)
      );
    }

    const offset = filtros?.offset ?? 0;
    const limite = filtros?.limite ?? 50;

    return resultado.slice(offset, offset + limite);
  }

  public async eliminar(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}
