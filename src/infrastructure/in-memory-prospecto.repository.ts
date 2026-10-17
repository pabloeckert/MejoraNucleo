import { Prospecto } from '../domain/prospecto.entity.js';
import type { IProspectoRepository, ProspectoFiltros } from '../domain/prospecto.repository.js';

export class InMemoryProspectoRepository implements IProspectoRepository {
  private readonly items: Map<string, Prospecto> = new Map();

  public async guardar(prospecto: Prospecto): Promise<void> {
    this.items.set(prospecto.id, prospecto);
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
