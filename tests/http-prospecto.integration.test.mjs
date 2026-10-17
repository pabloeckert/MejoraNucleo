import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppServer,
  SqliteProspectoRepository,
  EstadoProspecto
} from '../dist/index.js';

test('Capa de Interfaz HTTP - Endpoints REST de Prospectos (Integration Tests)', async (t) => {
  // Iniciar servidor en puerto efímero (0) con persistencia SQLite en memoria
  const repository = new SqliteProspectoRepository(':memory:');
  const app = createAppServer({ port: 0, repository });
  const { url } = await app.start();

  t.after(async () => {
    await app.stop();
    repository.close();
  });

  let createdId = '';

  await t.test('1. CORS: Responder 204 con cabeceras CORS en OPTIONS /api/prospectos', async () => {
    const res = await fetch(`${url}/api/prospectos`, {
      method: 'OPTIONS'
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('access-control-allow-methods')?.includes('POST'));
  });

  await t.test('2. POST /api/prospectos: Crear prospecto y verificar persistencia en BD', async () => {
    const payload = {
      nombre: 'Camila Osorio',
      email: 'camila@tenis.com',
      telefono: '+5491122334455',
      canalOrigen: 'LANDING_PAGE'
    };

    const res = await fetch(`${url}/api/prospectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const data = await res.json();

    assert.ok(data.id);
    assert.equal(data.nombre, payload.nombre);
    assert.equal(data.email, payload.email);
    assert.equal(data.telefono, payload.telefono);
    assert.equal(data.canalOrigen, payload.canalOrigen);
    assert.equal(data.estado, EstadoProspecto.CAPTURADO);

    createdId = data.id;

    // Confirmación empírica directa contra la base de datos
    const enDb = await repository.buscarPorId(createdId);
    assert.ok(enDb);
    assert.equal(enDb.id, createdId);
    assert.equal(enDb.nombre, payload.nombre);
    assert.equal(enDb.estado, EstadoProspecto.CAPTURADO);
  });

  await t.test('3. GET /api/prospectos: Listar prospectos en 200 OK', async () => {
    const res = await fetch(`${url}/api/prospectos`);
    assert.equal(res.status, 200);

    const lista = await res.json();
    assert.ok(Array.isArray(lista));
    assert.ok(lista.length >= 1);

    const encontrado = lista.find((p) => p.id === createdId);
    assert.ok(encontrado);
    assert.equal(encontrado.email, 'camila@tenis.com');
  });

  await t.test('4. PATCH /api/prospectos/:id/calificar: Transición a CALIFICADO', async () => {
    const res = await fetch(`${url}/api/prospectos/${createdId}/calificar`, {
      method: 'PATCH'
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, createdId);
    assert.equal(data.estado, EstadoProspecto.CALIFICADO);

    // Verificación en BD
    const enDb = await repository.buscarPorId(createdId);
    assert.equal(enDb?.estado, EstadoProspecto.CALIFICADO);
  });

  await t.test('5. PATCH /api/prospectos/:id/seguimiento: Transición a EN_SEGUIMIENTO', async () => {
    const res = await fetch(`${url}/api/prospectos/${createdId}/seguimiento`, {
      method: 'PATCH'
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.estado, EstadoProspecto.EN_SEGUIMIENTO);

    const enDb = await repository.buscarPorId(createdId);
    assert.equal(enDb?.estado, EstadoProspecto.EN_SEGUIMIENTO);
  });

  await t.test('6. PATCH /api/prospectos/:id/cerrar: Transición a CERRADO_GANADO', async () => {
    const res = await fetch(`${url}/api/prospectos/${createdId}/cerrar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ganado: true })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.estado, EstadoProspecto.CERRADO_GANADO);

    const enDb = await repository.buscarPorId(createdId);
    assert.equal(enDb?.estado, EstadoProspecto.CERRADO_GANADO);
  });

  await t.test('7. Manejo de Errores: Validación de formato de email (400 Bad Request)', async () => {
    const payloadInvalido = {
      nombre: 'Usuario Invalido',
      email: 'correo-sin-arroba-ni-punto',
      telefono: '12345678',
      canalOrigen: 'WEB'
    };

    const res = await fetch(`${url}/api/prospectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadInvalido)
    });

    assert.equal(res.status, 400);
    const errorBody = await res.json();
    assert.ok(errorBody.error);
    assert.ok(errorBody.error.includes('El formato del email'));
  });

  await t.test('8. Manejo de Errores: Transición inválida sobre prospecto ya cerrado (400 Bad Request)', async () => {
    // Intentar calificar a un prospecto que ya fue cerrado
    const res = await fetch(`${url}/api/prospectos/${createdId}/calificar`, {
      method: 'PATCH'
    });

    assert.equal(res.status, 400);
    const errorBody = await res.json();
    assert.ok(errorBody.error);
    assert.ok(errorBody.error.includes('Transición de estado inválida'));
  });

  await t.test('9. Manejo de Errores: ID inexistente (404 Not Found)', async () => {
    const idInexistente = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${url}/api/prospectos/${idInexistente}/calificar`, {
      method: 'PATCH'
    });

    assert.equal(res.status, 404);
    const errorBody = await res.json();
    assert.ok(errorBody.error);
    assert.ok(errorBody.error.includes('no encontrado'));
  });

  await t.test('10. Manejo de Errores: Endpoint o ruta inexistente (404 Not Found)', async () => {
    const res = await fetch(`${url}/api/ruta-desconocida`);
    assert.equal(res.status, 404);

    const errorBody = await res.json();
    assert.ok(errorBody.error);
    assert.ok(errorBody.error.includes('Ruta no encontrada'));
  });
});
