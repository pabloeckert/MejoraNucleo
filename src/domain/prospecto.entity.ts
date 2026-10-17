import { randomUUID } from 'node:crypto';
import { EstadoProspecto } from './estado-prospecto.enum.js';

export interface ProspectoProps {
  id?: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  estado?: EstadoProspecto;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Prospecto {
  private readonly _id: string;
  private _nombre: string;
  private _email: string;
  private _telefono: string;
  private _canalOrigen: string;
  private _estado: EstadoProspecto;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: ProspectoProps);
  constructor(
    id: string,
    nombre: string,
    email: string,
    telefono: string,
    canalOrigen: string,
    estado?: EstadoProspecto,
    createdAt?: Date,
    updatedAt?: Date
  );
  constructor(
    propsOrId: ProspectoProps | string,
    nombreArg?: string,
    emailArg?: string,
    telefonoArg?: string,
    canalOrigenArg?: string,
    estadoArg?: EstadoProspecto,
    createdAtArg?: Date,
    updatedAtArg?: Date
  ) {
    let id: string;
    let nombre: string;
    let email: string;
    let telefono: string;
    let canalOrigen: string;
    let estado: EstadoProspecto;
    let createdAt: Date;
    let updatedAt: Date;

    if (typeof propsOrId === 'object' && propsOrId !== null) {
      id = propsOrId.id ?? randomUUID();
      nombre = propsOrId.nombre;
      email = propsOrId.email;
      telefono = propsOrId.telefono;
      canalOrigen = propsOrOrigenString(propsOrId.canalOrigen);
      estado = propsOrId.estado ?? EstadoProspecto.CAPTURADO;
      createdAt = propsOrId.createdAt ?? new Date();
      updatedAt = propsOrId.updatedAt ?? new Date();
    } else {
      id = propsOrId;
      nombre = nombreArg!;
      email = emailArg!;
      telefono = telefonoArg ?? '';
      canalOrigen = canalOrigenArg ?? '';
      estado = estadoArg ?? EstadoProspecto.CAPTURADO;
      createdAt = createdAtArg ?? new Date();
      updatedAt = updatedAtArg ?? new Date();
    }

    this.validarNombre(nombre);
    this.validarEmail(email);

    this._id = id;
    this._nombre = nombre.trim();
    this._email = email.trim().toLowerCase();
    this._telefono = telefono.trim();
    this._canalOrigen = canalOrigen.trim();
    this._estado = estado;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  public static crear(params: {
    nombre: string;
    email: string;
    telefono: string;
    canalOrigen: string;
    id?: string;
  }): Prospecto {
    const ahora = new Date();
    return new Prospecto({
      id: params.id ?? randomUUID(),
      nombre: params.nombre,
      email: params.email,
      telefono: params.telefono,
      canalOrigen: params.canalOrigen,
      estado: EstadoProspecto.CAPTURADO,
      createdAt: ahora,
      updatedAt: ahora
    });
  }

  public get id(): string {
    return this._id;
  }

  public get nombre(): string {
    return this._nombre;
  }

  public get email(): string {
    return this._email;
  }

  public get telefono(): string {
    return this._telefono;
  }

  public get canalOrigen(): string {
    return this._canalOrigen;
  }

  public get estado(): EstadoProspecto {
    return this._estado;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Transiciona el estado de CAPTURADO a CALIFICADO.
   * Lanza un error si el prospecto no se encuentra en estado CAPTURADO.
   */
  public calificar(): void {
    if (this._estado !== EstadoProspecto.CAPTURADO) {
      throw new Error(
        `Transición de estado inválida: No se puede calificar un prospecto en estado '${this._estado}'. Solo se permite desde '${EstadoProspecto.CAPTURADO}'.`
      );
    }
    this._estado = EstadoProspecto.CALIFICADO;
    this._updatedAt = new Date();
  }

  /**
   * Transiciona el estado de CALIFICADO a EN_SEGUIMIENTO.
   * Lanza un error si el prospecto no se encuentra en estado CALIFICADO.
   */
  public iniciarSeguimiento(): void {
    if (this._estado !== EstadoProspecto.CALIFICADO) {
      throw new Error(
        `Transición de estado inválida: No se puede iniciar seguimiento a un prospecto en estado '${this._estado}'. Solo se permite desde '${EstadoProspecto.CALIFICADO}'.`
      );
    }
    this._estado = EstadoProspecto.EN_SEGUIMIENTO;
    this._updatedAt = new Date();
  }

  /**
   * Transiciona a CERRADO_GANADO o CERRADO_PERDIDO.
   * Lanza un error si se intenta una transición prohibida (por ejemplo desde CAPTURADO directamente).
   */
  public cerrar(ganado: boolean): void {
    if (
      this._estado === EstadoProspecto.CERRADO_GANADO ||
      this._estado === EstadoProspecto.CERRADO_PERDIDO
    ) {
      throw new Error(
        `Transición de estado inválida: El prospecto ya se encuentra cerrado en estado '${this._estado}'.`
      );
    }

    if (ganado) {
      if (this._estado !== EstadoProspecto.EN_SEGUIMIENTO) {
        throw new Error(
          `Transición de estado inválida: No se puede cerrar como ganado un prospecto en estado '${this._estado}'. Requiere haber transitado por '${EstadoProspecto.EN_SEGUIMIENTO}'.`
        );
      }
      this._estado = EstadoProspecto.CERRADO_GANADO;
    } else {
      if (this._estado === EstadoProspecto.CAPTURADO) {
        throw new Error(
          `Transición de estado inválida: No se puede cerrar directamente un prospecto en estado '${EstadoProspecto.CAPTURADO}'. Debe ser calificado previamente.`
        );
      }
      this._estado = EstadoProspecto.CERRADO_PERDIDO;
    }

    this._updatedAt = new Date();
  }

  private validarNombre(nombre: string): void {
    if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
      throw new Error('El nombre del prospecto no puede estar vacío.');
    }
  }

  private validarEmail(email: string): void {
    if (!email || typeof email !== 'string') {
      throw new Error('El email del prospecto es obligatorio.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new Error(`El formato del email '${email}' no es válido.`);
    }
  }

  public toJSON() {
    return {
      id: this._id,
      nombre: this._nombre,
      email: this._email,
      telefono: this._telefono,
      canalOrigen: this._canalOrigen,
      estado: this._estado,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}

function propsOrOrigenString(canal: unknown): string {
  if (typeof canal === 'string') return canal;
  return '';
}
