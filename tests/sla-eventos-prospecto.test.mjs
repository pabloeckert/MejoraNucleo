import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Prospecto } from '../dist/domain/prospecto.entity.js';
import { EstadoProspecto } from '../dist/domain/estado-prospecto.enum.js';
import { SqliteProspectoRepository } from '../dist/infrastructure/sqlite-prospecto.repository.js';
import { toProspectoResponseDTO } from '../dist/application/prospecto.dto.js';
import { createAppServer } from '../dist/interfaces/http/server.js';

test('Protocolo SRE - SLA 48h y Auditoría de Eventos Append-Only', async (t) => {
  await t.test('1. Cálculo matemático de SLA: VERDE (<24h), AMARILLO (24-48h), ROJO (>48h) y CUMPLIDO', () => {
    const ahora = new Date('2026-10-29T12:00:00Z');

    // Prospecto reciente (hace 4 horas) -> VERDE
    const pVerde = new Prospecto({
      nombre: 'Lead Verde',
      email: 'verde@empresa.com',
      telefono: '+5491100001111',
      canalOrigen: 'landing_hostinger',
      createdAt: new Date('2026-10-29T08:00:00Z')
    });
    const dtoVerde = toProspectoResponseDTO(pVerde, ahora);
    assert.equal(dtoVerde.slaEstado, 'VERDE');
    assert.equal(dtoVerde.slaHorasRestantes, 44);

    // Prospecto intermedio (hace 30 horas) -> AMARILLO
    const pAmarillo = new Prospecto({
      nombre: 'Lead Amarillo',
      email: 'amarillo@empresa.com',
      telefono: '+5491100002222',
      canalOrigen: 'diagnostico_4d',
      createdAt: new Date('2026-10-28T06:00:00Z')
    });
    const dtoAmarillo = toProspectoResponseDTO(pAmarillo, ahora);
    assert.equal(dtoAmarillo.slaEstado, 'AMARILLO');
    assert.equal(dtoAmarillo.slaHorasRestantes, 18);

    // Prospecto vencido (hace 52 horas) -> ROJO
    const pRojo = new Prospecto({
      nombre: 'Lead Vencido',
      email: 'rojo@empresa.com',
      telefono: '+5491100003333',
      canalOrigen: 'instagram_direct',
      createdAt: new Date('2026-10-27T08:00:00Z')
    });
    const dtoRojo = toProspectoResponseDTO(pRojo, ahora);
    assert.equal(dtoRojo.slaEstado, 'ROJO');
    assert.equal(dtoRojo.slaHorasRestantes, 0);

    // Prospecto ya calificado -> CUMPLIDO
    const pCumplido = new Prospecto({
      nombre: 'Lead Calificado',
      email: 'calificado@empresa.com',
      telefono: '+5491100004444',
      canalOrigen: 'landing_hostinger',
      estado: EstadoProspecto.CALIFICADO,
      createdAt: new Date('2026-10-27T08:00:00Z')
    });
    const dtoCumplido = toProspectoResponseDTO(pCumplido, ahora);
    assert.equal(dtoCumplido.slaEstado, 'CUMPLIDO');
    assert.equal(dtoCumplido.slaHorasRestantes, 0);
  });

  await t.test('2. Auditoría append-only en prospecto_eventos_log ante transiciones de estado', async () => {
    const db = new DatabaseSync(':memory:');
    const repo = new SqliteProspectoRepository(db);

    const prospecto = Prospecto.crear({
      nombre: 'Martín Bossi',
      email: 'martin@teatro.com',
      telefono: '+5491199998888',
      canalOrigen: 'taller_mc'
    });

    // 1. Guardar creación
    await repo.guardar(prospecto);
    let eventos = await repo.listarEventos(prospecto.id);
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].evento, 'PROSPECTO_CREADO');
    assert.equal(eventos[0].estadoNuevo, EstadoProspecto.CAPTURADO);

    // 2. Calificar
    prospecto.calificar();
    await repo.guardar(prospecto);
    eventos = await repo.listarEventos(prospecto.id);
    assert.equal(eventos.length, 2);
    assert.equal(eventos[1].evento, 'TRANSICION_ESTADO');
    assert.equal(eventos[1].estadoAnterior, EstadoProspecto.CAPTURADO);
    assert.equal(eventos[1].estadoNuevo, EstadoProspecto.CALIFICADO);

    // 3. Seguimiento
    prospecto.iniciarSeguimiento();
    await repo.guardar(prospecto);
    eventos = await repo.listarEventos(prospecto.id);
    assert.equal(eventos.length, 3);
    assert.equal(eventos[2].estadoAnterior, EstadoProspecto.CALIFICADO);
    assert.equal(eventos[2].estadoNuevo, EstadoProspecto.EN_SEGUIMIENTO);

    // 4. Cerrar ganado
    prospecto.cerrar(true);
    await repo.guardar(prospecto);
    eventos = await repo.listarEventos(prospecto.id);
    assert.equal(eventos.length, 4);
    assert.equal(eventos[3].estadoAnterior, EstadoProspecto.EN_SEGUIMIENTO);
    assert.equal(eventos[3].estadoNuevo, EstadoProspecto.CERRADO_GANADO);
  });

  await t.test('3. Endpoint GET /api/prospectos/:id/eventos expone la traza de auditoría', async () => {
    const db = new DatabaseSync(':memory:');
    const repo = new SqliteProspectoRepository(db);
    const app = createAppServer({ port: 0, repository: repo });
    const { url } = await app.start();

    try {
      // Crear prospecto vía API
      const resCrear = await fetch(`${url}/api/prospectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Auditoria HTTP',
          email: 'audit@test.com',
          telefono: '+5491144445555',
          canalOrigen: 'after_office_12x12'
        })
      });
      assert.equal(resCrear.status, 201);
      const creado = await resCrear.json();
      assert.equal(creado.slaEstado, 'VERDE');

      // Calificar vía API
      const resCalificar = await fetch(`${url}/api/prospectos/${creado.id}/calificar`, {
        method: 'PATCH'
      });
      assert.equal(resCalificar.status, 200);

      // Consultar traza de eventos
      const resEventos = await fetch(`${url}/api/prospectos/${creado.id}/eventos`);
      assert.equal(resEventos.status, 200);
      const listaEventos = await resEventos.json();
      assert.equal(listaEventos.length, 2);
      assert.equal(listaEventos[0].evento, 'PROSPECTO_CREADO');
      assert.equal(listaEventos[1].evento, 'TRANSICION_ESTADO');
      assert.equal(listaEventos[1].estadoNuevo, 'CALIFICADO');
    } finally {
      await app.stop();
    }
  });
});

