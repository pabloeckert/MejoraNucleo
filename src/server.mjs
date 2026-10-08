/**
 * MejoraNucleo - Servidor Backend del Motor Central de Persistencia
 * Expone la API REST interna para la suite y gestiona la base SQLite central.
 */
import http from 'node:http';
import { getDb, getDbStatus, closeDb } from './db/connection.mjs';
import { ContactoRepository } from './models/Contacto.mjs';
import { UsuarioRepository } from './models/Usuario.mjs';

const PORT = Number(process.env.NUCLEO_PORT) || 5001;
const HOST = process.env.NUCLEO_HOST || '127.0.0.1';

// Inicializar base de datos y migraciones
getDb();

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload demasiado grande (>1MB)'));
      }
    });
    req.on('end', () => {
      if (!body) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`JSON inválido: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

export const server = http.createServer(async (req, res) => {
  // Manejo de Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = parsedUrl.pathname;

  try {
    // ----------------------------------------------------
    // Health Check & Telemetría
    // ----------------------------------------------------
    if (req.method === 'GET' && pathname === '/health') {
      const status = getDbStatus();
      sendJson(res, 200, {
        status: 'ok',
        service: 'MejoraNucleo',
        timestamp: new Date().toISOString(),
        database: status
      });
      return;
    }

    // ----------------------------------------------------
    // CRUD Contactos
    // ----------------------------------------------------
    if (pathname === '/api/nucleo/contactos' || pathname === '/api/contactos') {
      if (req.method === 'GET') {
        const limit = parsedUrl.searchParams.get('limit');
        const offset = parsedUrl.searchParams.get('offset');
        const buscar = parsedUrl.searchParams.get('buscar');
        const result = ContactoRepository.findAll({ limit, offset, buscar });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const nuevo = ContactoRepository.create(body);
        sendJson(res, 201, {
          mensaje: 'Contacto persistido exitosamente en MejoraNucleo',
          data: nuevo
        });
        return;
      }
    }

    // Rutas con ID para Contactos: /api/nucleo/contactos/:id
    const contactoIdMatch = pathname.match(/^\/(?:api\/nucleo|api)\/contactos\/(\d+)$/);
    if (contactoIdMatch) {
      const id = Number(contactoIdMatch[1]);

      if (req.method === 'GET') {
        const item = ContactoRepository.findById(id);
        if (!item) {
          sendJson(res, 404, { error: `Contacto con ID ${id} no encontrado` });
          return;
        }
        sendJson(res, 200, { data: item });
        return;
      }

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const actualizado = ContactoRepository.update(id, body);
        if (!actualizado) {
          sendJson(res, 404, { error: `Contacto con ID ${id} no encontrado para actualizar` });
          return;
        }
        sendJson(res, 200, {
          mensaje: 'Contacto actualizado exitosamente en MejoraNucleo',
          data: actualizado
        });
        return;
      }

      if (req.method === 'DELETE') {
        const deleted = ContactoRepository.delete(id);
        if (!deleted) {
          sendJson(res, 404, { error: `Contacto con ID ${id} no encontrado para eliminar` });
          return;
        }
        sendJson(res, 200, { mensaje: `Contacto ${id} eliminado exitosamente` });
        return;
      }
    }

    // ----------------------------------------------------
    // CRUD Usuarios / Identidad
    // ----------------------------------------------------
    if (pathname === '/api/nucleo/usuarios' || pathname === '/api/usuarios') {
      if (req.method === 'GET') {
        const items = UsuarioRepository.findAll();
        sendJson(res, 200, { items, total: items.length });
        return;
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const nuevo = UsuarioRepository.create(body);
        sendJson(res, 201, {
          mensaje: 'Usuario/Identidad persistido exitosamente en MejoraNucleo',
          data: nuevo
        });
        return;
      }
    }

    // Rutas con ID para Usuarios: /api/nucleo/usuarios/:id
    const usuarioIdMatch = pathname.match(/^\/(?:api\/nucleo|api)\/usuarios\/(\d+)$/);
    if (usuarioIdMatch) {
      const id = Number(usuarioIdMatch[1]);

      if (req.method === 'GET') {
        const item = UsuarioRepository.findById(id);
        if (!item) {
          sendJson(res, 404, { error: `Usuario con ID ${id} no encontrado` });
          return;
        }
        sendJson(res, 200, { data: item });
        return;
      }

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const actualizado = UsuarioRepository.update(id, body);
        if (!actualizado) {
          sendJson(res, 404, { error: `Usuario con ID ${id} no encontrado para actualizar` });
          return;
        }
        sendJson(res, 200, {
          mensaje: 'Usuario actualizado exitosamente en MejoraNucleo',
          data: actualizado
        });
        return;
      }

      if (req.method === 'DELETE') {
        const deleted = UsuarioRepository.delete(id);
        if (!deleted) {
          sendJson(res, 404, { error: `Usuario con ID ${id} no encontrado para eliminar` });
          return;
        }
        sendJson(res, 200, { mensaje: `Usuario ${id} eliminado exitosamente` });
        return;
      }
    }

    // Ruta no encontrada
    sendJson(res, 404, { error: `Ruta no encontrada: ${req.method} ${pathname}` });
  } catch (err) {
    console.error(`[MejoraNucleo] Error procesando request [${req.method} ${pathname}]:`, err);
    sendJson(res, 400, {
      error: err.message || 'Error interno del servidor en MejoraNucleo'
    });
  }
});

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  server.listen(PORT, HOST, () => {
    console.log(`[MejoraNucleo] Servidor central de persistencia activo en http://${HOST}:${PORT}`);
    console.log(`[MejoraNucleo] Motor SQLite: ${getDbStatus().dbPath}`);
  });

  const shutdown = () => {
    console.log('\n[MejoraNucleo] Deteniendo servidor y cerrando conexión SQLite...');
    server.close(() => {
      closeDb();
      console.log('[MejoraNucleo] Servidor cerrado limpiamente.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
