import type { IProspectoRepository } from '../domain/prospecto.repository.js';
import {
  type CerrarProspectoInputDTO,
  type ProspectoResponseDTO,
  toProspectoResponseDTO
} from './prospecto.dto.js';

export class CerrarProspectoUseCase {
  constructor(private readonly prospectoRepo: IProspectoRepository) {}

  public async ejecutar(
    inputOrId: string | CerrarProspectoInputDTO,
    ganadoArg?: boolean
  ): Promise<ProspectoResponseDTO> {
    let id: string;
    let ganado: boolean;

    if (typeof inputOrId === 'object' && inputOrId !== null) {
      id = inputOrId.idProspecto.trim();
      ganado = inputOrId.ganado;
    } else {
      id = inputOrId.trim();
      if (ganadoArg === undefined) {
        throw new Error("El parámetro 'ganado' es obligatorio para cerrar el prospecto.");
      }
      ganado = ganadoArg;
    }

    if (!id) {
      throw new Error('El id del prospecto es obligatorio para cerrar.');
    }

    const prospecto = await this.prospectoRepo.buscarPorId(id);
    if (!prospecto) {
      throw new Error(`Prospecto con id '${id}' no encontrado.`);
    }

    prospecto.cerrar(ganado);
    await this.prospectoRepo.guardar(prospecto);

    return toProspectoResponseDTO(prospecto);
  }
}
