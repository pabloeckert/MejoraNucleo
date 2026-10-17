import type { IProspectoRepository } from '../domain/prospecto.repository.js';
import {
  type IniciarSeguimientoInputDTO,
  type ProspectoResponseDTO,
  toProspectoResponseDTO
} from './prospecto.dto.js';

export class IniciarSeguimientoUseCase {
  constructor(private readonly prospectoRepo: IProspectoRepository) {}

  public async ejecutar(
    input: string | IniciarSeguimientoInputDTO
  ): Promise<ProspectoResponseDTO> {
    const id = typeof input === 'string' ? input.trim() : input.idProspecto.trim();

    if (!id) {
      throw new Error('El id del prospecto es obligatorio para iniciar seguimiento.');
    }

    const prospecto = await this.prospectoRepo.buscarPorId(id);
    if (!prospecto) {
      throw new Error(`Prospecto con id '${id}' no encontrado.`);
    }

    prospecto.iniciarSeguimiento();
    await this.prospectoRepo.guardar(prospecto);

    return toProspectoResponseDTO(prospecto);
  }
}
