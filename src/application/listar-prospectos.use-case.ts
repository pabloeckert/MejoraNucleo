import type { IProspectoRepository, ProspectoFiltros } from '../domain/prospecto.repository.js';
import { type ProspectoResponseDTO, toProspectoResponseDTO } from './prospecto.dto.js';

export class ListarProspectosUseCase {
  constructor(private readonly prospectoRepo: IProspectoRepository) {}

  public async ejecutar(filtros?: ProspectoFiltros): Promise<ProspectoResponseDTO[]> {
    const prospectos = await this.prospectoRepo.buscarTodos(filtros);
    return prospectos.map(toProspectoResponseDTO);
  }
}
