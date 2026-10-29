import { EstadoProspecto } from '../domain/estado-prospecto.enum.js';
import { Prospecto } from '../domain/prospecto.entity.js';

export interface CrearProspectoInputDTO {
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
}

export interface CalificarProspectoInputDTO {
  idProspecto: string;
}

export interface IniciarSeguimientoInputDTO {
  idProspecto: string;
}

export interface CerrarProspectoInputDTO {
  idProspecto: string;
  ganado: boolean;
}

export type SlaEstado = 'VERDE' | 'AMARILLO' | 'ROJO' | 'CUMPLIDO';

export interface ProspectoResponseDTO {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  estado: EstadoProspecto;
  createdAt: string;
  updatedAt: string;
  slaHorasRestantes: number;
  slaEstado: SlaEstado;
}

export function toProspectoResponseDTO(
  prospecto: Prospecto,
  fechaReferencia: Date = new Date()
): ProspectoResponseDTO {
  let slaEstado: SlaEstado = 'CUMPLIDO';
  let slaHorasRestantes = 0;

  if (prospecto.estado === EstadoProspecto.CAPTURADO) {
    const elapsedMs = Math.max(0, fechaReferencia.getTime() - prospecto.createdAt.getTime());
    const elapsedHoras = elapsedMs / (1000 * 60 * 60);
    slaHorasRestantes = Math.max(0, Math.round(48 - elapsedHoras));
    if (elapsedHoras < 24) {
      slaEstado = 'VERDE';
    } else if (elapsedHoras <= 48) {
      slaEstado = 'AMARILLO';
    } else {
      slaEstado = 'ROJO';
    }
  }

  return {
    id: prospecto.id,
    nombre: prospecto.nombre,
    email: prospecto.email,
    telefono: prospecto.telefono,
    canalOrigen: prospecto.canalOrigen,
    estado: prospecto.estado,
    createdAt: prospecto.createdAt.toISOString(),
    updatedAt: prospecto.updatedAt.toISOString(),
    slaHorasRestantes,
    slaEstado
  };
}
