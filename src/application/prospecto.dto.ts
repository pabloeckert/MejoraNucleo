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

export interface ProspectoResponseDTO {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  estado: EstadoProspecto;
  createdAt: string;
  updatedAt: string;
}

export function toProspectoResponseDTO(prospecto: Prospecto): ProspectoResponseDTO {
  return {
    id: prospecto.id,
    nombre: prospecto.nombre,
    email: prospecto.email,
    telefono: prospecto.telefono,
    canalOrigen: prospecto.canalOrigen,
    estado: prospecto.estado,
    createdAt: prospecto.createdAt.toISOString(),
    updatedAt: prospecto.updatedAt.toISOString()
  };
}
