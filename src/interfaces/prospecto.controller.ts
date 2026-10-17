import { CrearProspectoUseCase } from '../application/crear-prospecto.use-case.js';
import type { CrearProspectoInputDTO, ProspectoResponseDTO } from '../application/prospecto.dto.js';
import type { IProspectoRepository } from '../domain/prospecto.repository.js';

export interface HttpResponse<T> {
  statusCode: number;
  data?: T;
  error?: string;
}

export class ProspectoController {
  private readonly crearUseCase: CrearProspectoUseCase;

  constructor(repository: IProspectoRepository) {
    this.crearUseCase = new CrearProspectoUseCase(repository);
  }

  public async crear(input: unknown): Promise<HttpResponse<ProspectoResponseDTO>> {
    try {
      if (!input || typeof input !== 'object') {
        return {
          statusCode: 400,
          error: 'El cuerpo de la solicitud no es válido.'
        };
      }

      const body = input as Partial<CrearProspectoInputDTO>;

      if (!body.nombre || typeof body.nombre !== 'string') {
        return {
          statusCode: 400,
          error: 'El campo "nombre" es obligatorio y debe ser texto.'
        };
      }

      if (!body.email || typeof body.email !== 'string') {
        return {
          statusCode: 400,
          error: 'El campo "email" es obligatorio y debe ser texto.'
        };
      }

      if (!body.telefono || typeof body.telefono !== 'string') {
        return {
          statusCode: 400,
          error: 'El campo "telefono" es obligatorio y debe ser texto.'
        };
      }

      if (!body.canalOrigen || typeof body.canalOrigen !== 'string') {
        return {
          statusCode: 400,
          error: 'El campo "canalOrigen" es obligatorio y debe ser texto.'
        };
      }

      const dto: CrearProspectoInputDTO = {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        canalOrigen: body.canalOrigen
      };

      const resultado = await this.crearUseCase.ejecutar(dto);

      return {
        statusCode: 201,
        data: resultado
      };
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error interno inesperado';
      return {
        statusCode: 400,
        error: mensaje
      };
    }
  }
}
