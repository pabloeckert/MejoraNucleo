import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EstadoProspecto,
  InMemoryProspectoRepository,
  CrearProspectoUseCase,
  CalificarProspectoUseCase,
  IniciarSeguimientoUseCase,
  CerrarProspectoUseCase
} from '../dist/index.js';

test('Capa de Aplicación - Ciclo de Vida del Prospecto (Use Cases)', async (t) => {
  const repo = new InMemoryProspectoRepository();
  const crearUseCase = new CrearProspectoUseCase(repo);
  const calificarUseCase = new CalificarProspectoUseCase(repo);
  const iniciarSeguimientoUseCase = new IniciarSeguimientoUseCase(repo);
  const cerrarUseCase = new CerrarProspectoUseCase(repo);

  await t.test('Secuencia completa exitosa: CAPTURADO -> CALIFICADO -> EN_SEGUIMIENTO -> CERRADO_GANADO', async () => {
    // 1. Creación
    const creado = await crearUseCase.ejecutar({
      nombre: 'Luciano Martinez',
      email: 'luciano@empresa.com',
      telefono: '+5491144556677',
      canalOrigen: 'WHATSAPP'
    });
    assert.equal(creado.estado, EstadoProspecto.CAPTURADO);

    // 2. Calificar
    const calificado = await calificarUseCase.ejecutar(creado.id);
    assert.equal(calificado.estado, EstadoProspecto.CALIFICADO);

    // Verificar persistencia en repo
    const enRepo1 = await repo.buscarPorId(creado.id);
    assert.equal(enRepo1?.estado, EstadoProspecto.CALIFICADO);

    // 3. Iniciar Seguimiento
    const enSeguimiento = await iniciarSeguimientoUseCase.ejecutar({ idProspecto: creado.id });
    assert.equal(enSeguimiento.estado, EstadoProspecto.EN_SEGUIMIENTO);

    const enRepo2 = await repo.buscarPorId(creado.id);
    assert.equal(enRepo2?.estado, EstadoProspecto.EN_SEGUIMIENTO);

    // 4. Cerrar Ganado
    const cerradoGanado = await cerrarUseCase.ejecutar({
      idProspecto: creado.id,
      ganado: true
    });
    assert.equal(cerradoGanado.estado, EstadoProspecto.CERRADO_GANADO);

    const enRepoFinal = await repo.buscarPorId(creado.id);
    assert.equal(enRepoFinal?.estado, EstadoProspecto.CERRADO_GANADO);
  });

  await t.test('Secuencia de descarte: CAPTURADO -> CALIFICADO -> CERRADO_PERDIDO', async () => {
    const prospecto = await crearUseCase.ejecutar({
      nombre: 'Carlos Gomez',
      email: 'carlos@otrodominio.com',
      telefono: '+5491133221100',
      canalOrigen: 'WEB'
    });

    await calificarUseCase.ejecutar(prospecto.id);
    const cerradoPerdido = await cerrarUseCase.ejecutar(prospecto.id, false);

    assert.equal(cerradoPerdido.estado, EstadoProspecto.CERRADO_PERDIDO);

    const enRepo = await repo.buscarPorId(prospecto.id);
    assert.equal(enRepo?.estado, EstadoProspecto.CERRADO_PERDIDO);
  });

  await t.test('Error de dominio: Transición prohibida saltando pasos (CAPTURADO a CERRADO_GANADO)', async () => {
    const prospecto = await crearUseCase.ejecutar({
      nombre: 'Salto Invalido',
      email: 'salto@test.com',
      telefono: '+5491199887766',
      canalOrigen: 'LINKEDIN'
    });

    await assert.rejects(
      async () => {
        await cerrarUseCase.ejecutar(prospecto.id, true);
      },
      /Transición de estado inválida.*No se puede cerrar como ganado.*EN_SEGUIMIENTO/
    );
  });

  await t.test('Error de dominio: Intentar mutar un prospecto ya cerrado', async () => {
    const prospecto = await crearUseCase.ejecutar({
      nombre: 'Prospecto Finalizado',
      email: 'finalizado@test.com',
      telefono: '+5491177665544',
      canalOrigen: 'DIRECTO'
    });

    await calificarUseCase.ejecutar(prospecto.id);
    await iniciarSeguimientoUseCase.ejecutar(prospecto.id);
    await cerrarUseCase.ejecutar(prospecto.id, true);

    // Intentar calificar estando CERRADO_GANADO
    await assert.rejects(
      async () => {
        await calificarUseCase.ejecutar(prospecto.id);
      },
      /Transición de estado inválida.*No se puede calificar un prospecto en estado 'CERRADO_GANADO'/
    );

    // Intentar iniciar seguimiento estando CERRADO_GANADO
    await assert.rejects(
      async () => {
        await iniciarSeguimientoUseCase.ejecutar(prospecto.id);
      },
      /Transición de estado inválida.*No se puede iniciar seguimiento a un prospecto en estado 'CERRADO_GANADO'/
    );

    // Intentar cerrar de nuevo
    await assert.rejects(
      async () => {
        await cerrarUseCase.ejecutar(prospecto.id, false);
      },
      /Transición de estado inválida.*El prospecto ya se encuentra cerrado/
    );
  });

  await t.test('Error de aplicación: Prospecto no encontrado por id inexistente', async () => {
    const idInexistente = '00000000-0000-0000-0000-000000000000';

    await assert.rejects(
      async () => {
        await calificarUseCase.ejecutar(idInexistente);
      },
      /Prospecto con id '.*' no encontrado/
    );

    await assert.rejects(
      async () => {
        await iniciarSeguimientoUseCase.ejecutar(idInexistente);
      },
      /Prospecto con id '.*' no encontrado/
    );

    await assert.rejects(
      async () => {
        await cerrarUseCase.ejecutar(idInexistente, true);
      },
      /Prospecto con id '.*' no encontrado/
    );
  });
});
