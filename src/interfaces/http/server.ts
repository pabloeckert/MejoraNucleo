import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IProspectoRepository } from '../../domain/prospecto.repository.js';
import { SqliteProspectoRepository } from '../../infrastructure/sqlite-prospecto.repository.js';
import { WorkspaceNotifierService } from '../../infrastructure/workspace/workspace-notifier.service.js';
import { ProspectoHttpRouter } from './prospecto.router.js';

export interface AppServerOptions {
  port?: number;
  repository?: IProspectoRepository;
  workspaceNotifier?: WorkspaceNotifierService;
  dbPath?: string;
}

export interface AppServerInstance {
  server: Server;
  repository: IProspectoRepository;
  workspaceNotifier?: WorkspaceNotifierService;
  start: () => Promise<{ port: number; url: string }>;
  stop: () => Promise<void>;
}

export function createAppServer(options?: AppServerOptions): AppServerInstance {
  const repository =
    options?.repository ??
    new SqliteProspectoRepository(options?.dbPath ?? process.env.SQLITE_DB_PATH ?? 'prospectos.db');

  const workspaceNotifier =
    options?.workspaceNotifier ??
    (process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL || process.env.GAS_LEADS_WEBHOOK_URL
      ? new WorkspaceNotifierService()
      : undefined);

  const router = new ProspectoHttpRouter(repository, workspaceNotifier);

  const server = createServer(async (req, res) => {
    await router.handle(req, res);
  });

  const targetPort = options?.port ?? (process.env.PORT ? Number(process.env.PORT) : 3000);

  const start = (): Promise<{ port: number; url: string }> => {
    return new Promise((resolve, reject) => {
      server.listen(targetPort, () => {
        const address = server.address() as AddressInfo | null;
        const actualPort = address?.port ?? targetPort;
        const url = `http://localhost:${actualPort}`;
        resolve({ port: actualPort, url });
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  return {
    server,
    repository,
    workspaceNotifier,
    start,
    stop
  };
}

// Iniciar automáticamente si se invoca directamente desde node/tsx
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isMainModule) {
  const app = createAppServer();
  app
    .start()
    .then(({ url }) => {
      console.log(`[MejoraNucleo] Servidor HTTP escuchando activamente en ${url}`);
    })
    .catch((err) => {
      console.error('[MejoraNucleo] Error al iniciar el servidor HTTP:', err);
      process.exit(1);
    });
}
