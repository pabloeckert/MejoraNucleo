import { Prospecto } from '../domain/prospecto.entity.js';
import type { IProspectoRepository } from '../domain/prospecto.repository.js';
import { type CrearProspectoInputDTO, type ProspectoResponseDTO, toProspectoResponseDTO } from './prospecto.dto.js';

export class CrearProspectoUseCase {
  constructor(private readonly prospectoRepo: IProspectoRepository) {}

  public async ejecutar(input: CrearProspectoInputDTO): Promise<ProspectoResponseDTO> {
    const existePorEmail = await this.prospectoRepo.buscarPorEmail(input.email.trim().toLowerCase());
    if (existePorEmail) {
      throw new Error(`Ya existe un prospecto registrado con el email '${input.email}'.`);
    }

    if (input.telefono.trim()) {
      const existePorTelefono = await this.prospectoRepo.buscarPorTelefono(input.telefono.trim());
      if (existePorTelefono) {
        throw new Error(`Ya existe un prospecto registrado con el teléfono '${input.telefono}'.`);
      }
    }

    const nuevoProspecto = Prospecto.crear({
      nombre: input.nombre,
      email: input.email,
      telefono: input.telefono,
      canalOrigen: input.canalOrigen
    });

    await this.prospectoRepo.guardar(nuevoProspecto);

    return toProspectoResponseDTO(nuevoProspecto);
  }
}
