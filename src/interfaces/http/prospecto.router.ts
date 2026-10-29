import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { IProspectoRepository, ProspectoFiltros } from '../../domain/prospecto.repository.js';
import { EstadoProspecto } from '../../domain/estado-prospecto.enum.js';
import { CrearProspectoUseCase } from '../../application/crear-prospecto.use-case.js';
import { CalificarProspectoUseCase } from '../../application/calificar-prospecto.use-case.js';
import { IniciarSeguimientoUseCase } from '../../application/iniciar-seguimiento.use-case.js';
import { CerrarProspectoUseCase } from '../../application/cerrar-prospecto.use-case.js';
import { ListarProspectosUseCase } from '../../application/listar-prospectos.use-case.js';
import type { CrearProspectoInputDTO, ProspectoResponseDTO } from '../../application/prospecto.dto.js';
import type { WorkspaceNotifierService } from '../../infrastructure/workspace/workspace-notifier.service.js';

export interface ProspectoRouterDependencies {
  crearUseCase: CrearProspectoUseCase;
  calificarUseCase: CalificarProspectoUseCase;
  iniciarSeguimientoUseCase: IniciarSeguimientoUseCase;
  cerrarUseCase: CerrarProspectoUseCase;
  listarUseCase: ListarProspectosUseCase;
  repository?: IProspectoRepository;
  workspaceNotifier?: WorkspaceNotifierService;
}

export class ProspectoHttpRouter {
  private readonly crearUseCase: CrearProspectoUseCase;
  private readonly calificarUseCase: CalificarProspectoUseCase;
  private readonly iniciarSeguimientoUseCase: IniciarSeguimientoUseCase;
  private readonly cerrarUseCase: CerrarProspectoUseCase;
  private readonly listarUseCase: ListarProspectosUseCase;
  private readonly repository?: IProspectoRepository;
  private readonly workspaceNotifier?: WorkspaceNotifierService;

  constructor(
    depsOrRepo: ProspectoRouterDependencies | IProspectoRepository,
    workspaceNotifier?: WorkspaceNotifierService
  ) {
    if ('crearUseCase' in depsOrRepo) {
      this.crearUseCase = depsOrRepo.crearUseCase;
      this.calificarUseCase = depsOrRepo.calificarUseCase;
      this.iniciarSeguimientoUseCase = depsOrRepo.iniciarSeguimientoUseCase;
      this.cerrarUseCase = depsOrRepo.cerrarUseCase;
      this.listarUseCase = depsOrRepo.listarUseCase;
      this.repository = depsOrRepo.repository;
      this.workspaceNotifier = depsOrRepo.workspaceNotifier ?? workspaceNotifier;
    } else {
      this.crearUseCase = new CrearProspectoUseCase(depsOrRepo);
      this.calificarUseCase = new CalificarProspectoUseCase(depsOrRepo);
      this.iniciarSeguimientoUseCase = new IniciarSeguimientoUseCase(depsOrRepo);
      this.cerrarUseCase = new CerrarProspectoUseCase(depsOrRepo);
      this.listarUseCase = new ListarProspectosUseCase(depsOrRepo);
      this.repository = depsOrRepo;
      this.workspaceNotifier = workspaceNotifier;
    }
  }

  public async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.host ?? 'localhost';
    const parsedUrl = new URL(req.url ?? '/', `http://${origin}`);
    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
    const method = req.method?.toUpperCase() ?? 'GET';

    // Manejo de CORS Preflight
    if (method === 'OPTIONS') {
      this.sendNoContent(res);
      return;
    }

    try {
      // 1. POST /api/prospectos
      if (method === 'POST' && pathname === '/api/prospectos') {
        const body = await this.parseJsonBody<Partial<CrearProspectoInputDTO>>(req);
        
        if (!body || typeof body !== 'object') {
          this.sendJson(res, 400, { error: 'El cuerpo de la solicitud no es un JSON válido.' });
          return;
        }

        const dto: CrearProspectoInputDTO = {
          nombre: String(body.nombre ?? ''),
          email: String(body.email ?? ''),
          telefono: String(body.telefono ?? ''),
          canalOrigen: String(body.canalOrigen ?? '')
        };

        const resultado: ProspectoResponseDTO = await this.crearUseCase.ejecutar(dto);

        // Despacho desacoplado hacia Google Workspace (Fast-Window / Zero-Trust)
        if (this.workspaceNotifier?.isConfigured()) {
          void this.workspaceNotifier.notificarNuevoProspecto(resultado).catch((notifError) => {
            console.error('[ProspectoHttpRouter] Error al disparar notificación a Google Workspace:', notifError);
          });
        }

        this.sendJson(res, 201, resultado);
        return;
      }

      // 2. GET /api/prospectos
      if (method === 'GET' && pathname === '/api/prospectos') {
        const filtros: ProspectoFiltros = {};

        const estadoParam = parsedUrl.searchParams.get('estado');
        if (estadoParam && Object.values(EstadoProspecto).includes(estadoParam as EstadoProspecto)) {
          filtros.estado = estadoParam as EstadoProspecto;
        }

        const busquedaParam = parsedUrl.searchParams.get('busqueda');
        if (busquedaParam) {
          filtros.busqueda = busquedaParam;
        }

        const limiteParam = parsedUrl.searchParams.get('limite');
        if (limiteParam && !Number.isNaN(Number(limiteParam))) {
          filtros.limite = Number(limiteParam);
        }

        const offsetParam = parsedUrl.searchParams.get('offset');
        if (offsetParam && !Number.isNaN(Number(offsetParam))) {
          filtros.offset = Number(offsetParam);
        }

        const lista: ProspectoResponseDTO[] = await this.listarUseCase.ejecutar(filtros);
        this.sendJson(res, 200, lista);
        return;
      }

      // 3. PATCH /api/prospectos/:id/calificar
      const matchCalificar = pathname.match(/^\/api\/prospectos\/([^/]+)\/calificar$/);
      if (method === 'PATCH' && matchCalificar) {
        const id = decodeURIComponent(matchCalificar[1] ?? '');
        const resultado: ProspectoResponseDTO = await this.calificarUseCase.ejecutar(id);
        this.sendJson(res, 200, resultado);
        return;
      }

      // 4. PATCH /api/prospectos/:id/seguimiento
      const matchSeguimiento = pathname.match(/^\/api\/prospectos\/([^/]+)\/seguimiento$/);
      if (method === 'PATCH' && matchSeguimiento) {
        const id = decodeURIComponent(matchSeguimiento[1] ?? '');
        const resultado: ProspectoResponseDTO = await this.iniciarSeguimientoUseCase.ejecutar(id);
        this.sendJson(res, 200, resultado);
        return;
      }

      // 5. PATCH /api/prospectos/:id/cerrar
      const matchCerrar = pathname.match(/^\/api\/prospectos\/([^/]+)\/cerrar$/);
      if (method === 'PATCH' && matchCerrar) {
        const id = decodeURIComponent(matchCerrar[1] ?? '');
        const body = await this.parseJsonBody<{ ganado?: unknown }>(req);

        if (typeof body?.ganado !== 'boolean') {
          this.sendJson(res, 400, {
            error: 'El campo "ganado" es obligatorio y debe ser un valor booleano (true o false).'
          });
          return;
        }

        const resultado: ProspectoResponseDTO = await this.cerrarUseCase.ejecutar(id, body.ganado);
        this.sendJson(res, 200, resultado);
        return;
      }

      // 6. GET /api/prospectos/:id/eventos
      const matchEventos = pathname.match(/^\/api\/prospectos\/([^/]+)\/eventos$/);
      if (method === 'GET' && matchEventos) {
        const id = decodeURIComponent(matchEventos[1] ?? '');
        if (this.repository?.listarEventos) {
          const eventos = await this.repository.listarEventos(id);
          this.sendJson(res, 200, eventos);
          return;
        }
        this.sendJson(res, 200, []);
        return;
      }

      // Ruta no encontrada
      this.sendJson(res, 404, {
        error: `Ruta no encontrada: ${method} ${pathname}`
      });
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error interno inesperado';
      const esNoEncontrado = mensaje.toLowerCase().includes('no encontrado');
      const status = esNoEncontrado ? 404 : 400;

      this.sendJson(res, status, { error: mensaje });
    }
  }

  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private sendNoContent(res: ServerResponse): void {
    this.setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    this.setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = statusCode;
    res.end(JSON.stringify(data));
  }

  private async parseJsonBody<T>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.setEncoding('utf8');

      req.on('data', (chunk: string) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          reject(new Error('Payload demasiado grande. Límite máximo: 1MB.'));
        }
      });

      req.on('end', () => {
        if (!body.trim()) {
          resolve({} as T);
          return;
        }
        try {
          const parsed = JSON.parse(body) as T;
          resolve(parsed);
        } catch {
          reject(new Error('El cuerpo de la solicitud contiene un JSON malformado.'));
        }
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }
}
