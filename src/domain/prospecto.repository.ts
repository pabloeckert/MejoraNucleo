import { Prospecto } from './prospecto.entity.js';
import { EstadoProspecto } from './estado-prospecto.enum.js';

export interface ProspectoEventoRecord {
  id?: number;
  prospectoId: string;
  evento: string;
  estadoAnterior?: string | null;
  estadoNuevo: string;
  detalles?: string | null;
  timestamp: string;
}

export interface ProspectoFiltros {
  estado?: EstadoProspecto;
  busqueda?: string;
  limite?: number;
  offset?: number;
}

export interface IProspectoRepository {
  guardar(prospecto: Prospecto): Promise<void>;
  buscarPorId(id: string): Promise<Prospecto | null>;
  buscarPorEmail(email: string): Promise<Prospecto | null>;
  buscarPorTelefono(telefono: string): Promise<Prospecto | null>;
  buscarTodos(filtros?: ProspectoFiltros): Promise<Prospecto[]>;
  eliminar(id: string): Promise<boolean>;
  registrarEvento?(evento: ProspectoEventoRecord): Promise<void>;
  listarEventos?(prospectoId: string): Promise<ProspectoEventoRecord[]>;
}
