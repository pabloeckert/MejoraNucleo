import type { IProspectoRepository } from '../domain/prospecto.repository.js';
import {
  type CalificarProspectoInputDTO,
  type ProspectoResponseDTO,
  toProspectoResponseDTO
} from './prospecto.dto.js';

export class CalificarProspectoUseCase {
  constructor(private readonly prospectoRepo: IProspectoRepository) {}

  public async ejecutar(
    input: string | CalificarProspectoInputDTO
  ): Promise<ProspectoResponseDTO> {
    const id = typeof input === 'string' ? input.trim() : input.idProspecto.trim();

    if (!id) {
      throw new Error('El id del prospecto es obligatorio para calificar.');
    }

    const prospecto = await this.prospectoRepo.buscarPorId(id);
    if (!prospecto) {
      throw new Error(`Prospecto con id '${id}' no encontrado.`);
    }

    prospecto.calificar();
    await this.prospectoRepo.guardar(prospecto);

    return toProspectoResponseDTO(prospecto);
  }
}
