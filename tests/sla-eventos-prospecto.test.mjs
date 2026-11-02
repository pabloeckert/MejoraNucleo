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

  await t.test('4. Bloque MVP 1: Enchufe Universal de Atribución (piezaIdAtribucion, UTM y Buyer Persona)', async () => {
    const db = new DatabaseSync(':memory:');
    const repo = new SqliteProspectoRepository(db);
    const app = createAppServer({ port: 0, repository: repo });
    const { url } = await app.start();

    try {
      const resCrear = await fetch(`${url}/api/prospectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Roberto Industrial',
          email: 'roberto@industria.com.ar',
          telefono: '+5491133334444',
          canalOrigen: 'landing_hostinger',
          piezaIdAtribucion: 'PROP-2026-W04-02',
          utmSource: 'instagram',
          utmMedium: 'organic_social',
          utmCampaign: 'edificio_comercial_q4',
          utmContent: 'PROP-2026-W04-02',
          buyerPersonaId: 'BP-01-FUNDADOR-SATURADO'
        })
      });
      assert.equal(resCrear.status, 201);
      const creado = await resCrear.json();
      assert.equal(creado.piezaIdAtribucion, 'PROP-2026-W04-02');
      assert.equal(creado.utmSource, 'instagram');
      assert.equal(creado.utmMedium, 'organic_social');
      assert.equal(creado.utmCampaign, 'edificio_comercial_q4');
      assert.equal(creado.utmContent, 'PROP-2026-W04-02');
      assert.equal(creado.buyerPersonaId, 'BP-01-FUNDADOR-SATURADO');

      const resList = await fetch(`${url}/api/prospectos`);
      assert.equal(resList.status, 200);
      const lista = await resList.json();
      assert.equal(lista.length, 1);
      assert.equal(lista[0].piezaIdAtribucion, 'PROP-2026-W04-02');
      assert.equal(lista[0].buyerPersonaId, 'BP-01-FUNDADOR-SATURADO');
    } finally {
      await app.stop();
    }
  });

  await t.test('5. Bloque MVP 2: Ingesta Consultiva 4D (MejoraDiagnostico + Mejoraok)', async () => {
    const db = new DatabaseSync(':memory:');
    const repo = new SqliteProspectoRepository(db);
    const app = createAppServer({ port: 0, repository: repo });
    const { url } = await app.start();

    try {
      // 1. Prospecto proveniente de MejoraDiagnostico
      const resDiagnostico = await fetch(`${url}/api/prospectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Lic. Mariana Gómez',
          email: 'mariana@consultora.com',
          telefono: '+5491122223333',
          canalOrigen: 'diagnostico_4d',
          buyerPersonaId: 'SATURADO',
          mensaje: 'Diagnóstico 4D completado. Score total: 42 pts. Perfil: SATURADO.'
        })
      });
      assert.equal(resDiagnostico.status, 201);
      const leadDiag = await resDiagnostico.json();
      assert.equal(leadDiag.canalOrigen, 'diagnostico_4d');
      assert.equal(leadDiag.buyerPersonaId, 'SATURADO');
      // mensaje validado en payload

      // 2. Prospecto proveniente de Mejoraok Landing
      const resMejoraok = await fetch(`${url}/api/prospectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Esteban Martínez',
          email: 'esteban@pyme.com',
          telefono: '+5493764889900',
          canalOrigen: 'mejoraok_landing',
          mensaje: 'CTA: modal_hablemos_ahora',
          utmSource: 'mejoraok_landing'
        })
      });
      assert.equal(resMejoraok.status, 201);
      const leadOk = await resMejoraok.json();
      assert.equal(leadOk.canalOrigen, 'mejoraok_landing');
      assert.equal(leadOk.utmSource, 'mejoraok_landing');

      // 3. Auditoría de lista completa
      const resList = await fetch(`${url}/api/prospectos`);
      assert.equal(resList.status, 200);
      const prospectos = await resList.json();
      assert.equal(prospectos.length, 2);
    } finally {
      await app.stop();
    }
  });
});

