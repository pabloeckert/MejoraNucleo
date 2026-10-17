import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Prospecto,
  EstadoProspecto,
  InMemoryProspectoRepository
} from '../dist/index.js';

test('Dominio Prospecto - Creación e Invariantes', async (t) => {
  await t.test('debe crear un prospecto válido en estado CAPTURADO', () => {
    const prospecto = Prospecto.crear({
      nombre: 'Pablo Eckert',
      email: 'pablo@mejora.com',
      telefono: '+5491123456789',
      canalOrigen: 'WHATSAPP'
    });

    assert.equal(prospecto.nombre, 'Pablo Eckert');
    assert.equal(prospecto.email, 'pablo@mejora.com');
    assert.equal(prospecto.telefono, '+5491123456789');
    assert.equal(prospecto.canalOrigen, 'WHATSAPP');
    assert.equal(prospecto.estado, EstadoProspecto.CAPTURADO);
    assert.ok(prospecto.id);
    assert.ok(prospecto.createdAt instanceof Date);
    assert.ok(prospecto.updatedAt instanceof Date);
  });

  await t.test('debe fallar si el nombre está vacío', () => {
    assert.throws(
      () => {
        Prospecto.crear({
          nombre: '   ',
          email: 'valido@mejora.com',
          telefono: '123456',
          canalOrigen: 'WEB'
        });
      },
      /El nombre del prospecto no puede estar vacío/
    );
  });

  await t.test('debe fallar si el email tiene formato inválido', () => {
    assert.throws(
      () => {
        Prospecto.crear({
          nombre: 'Juan',
          email: 'email-invalido-sin-arroba',
          telefono: '123456',
          canalOrigen: 'WEB'
        });
      },
      /El formato del email '.*' no es válido/
    );
  });
});

test('Dominio Prospecto - Máquina de Estados y Transiciones de Negocio', async (t) => {
  await t.test('debe realizar la transición completa: CAPTURADO -> CALIFICADO -> EN_SEGUIMIENTO -> CERRADO_GANADO', () => {
    const p = Prospecto.crear({
      nombre: 'Cliente Exitoso',
      email: 'exito@empresa.com',
      telefono: '11223344',
      canalOrigen: 'LINKEDIN'
    });

    assert.equal(p.estado, EstadoProspecto.CAPTURADO);

    // 1. Calificar
    p.calificar();
    assert.equal(p.estado, EstadoProspecto.CALIFICADO);

    // 2. Iniciar seguimiento
    p.iniciarSeguimiento();
    assert.equal(p.estado, EstadoProspecto.EN_SEGUIMIENTO);

    // 3. Cerrar ganado
    p.cerrar(true);
    assert.equal(p.estado, EstadoProspecto.CERRADO_GANADO);
  });

  await t.test('debe prohibir cerrar ganado directamente desde CAPTURADO (Regla de negocio)', () => {
    const p = Prospecto.crear({
      nombre: 'Cliente Apurado',
      email: 'apurado@empresa.com',
      telefono: '11223344',
      canalOrigen: 'WHATSAPP'
    });

    assert.throws(
      () => p.cerrar(true),
      /Transición de estado inválida.*No se puede cerrar como ganado.*EN_SEGUIMIENTO/
    );
  });

  await t.test('debe prohibir cerrar directamente desde CAPTURADO (incluso como perdido)', () => {
    const p = Prospecto.crear({
      nombre: 'Prospecto Crudo',
      email: 'crudo@empresa.com',
      telefono: '11223344',
      canalOrigen: 'WEB'
    });

    assert.throws(
      () => p.cerrar(false),
      /Transición de estado inválida.*No se puede cerrar directamente un prospecto en estado 'CAPTURADO'/
    );
  });

  await t.test('debe permitir cerrar como perdido una vez calificado o en seguimiento', () => {
    const p = Prospecto.crear({
      nombre: 'Prospecto No Interesado',
      email: 'no@interesado.com',
      telefono: '11223344',
      canalOrigen: 'WEB'
    });

    p.calificar();
    p.cerrar(false);
    assert.equal(p.estado, EstadoProspecto.CERRADO_PERDIDO);
  });

  await t.test('debe prohibir mutaciones adicionales una vez cerrado', () => {
    const p = Prospecto.crear({
      nombre: 'Prospecto Terminado',
      email: 'fin@empresa.com',
      telefono: '11223344',
      canalOrigen: 'DIRECTO'
    });

    p.calificar();
    p.iniciarSeguimiento();
    p.cerrar(true);

    assert.throws(
      () => p.calificar(),
      /No se puede calificar un prospecto en estado 'CERRADO_GANADO'/
    );

    assert.throws(
      () => p.iniciarSeguimiento(),
      /No se puede iniciar seguimiento a un prospecto en estado 'CERRADO_GANADO'/
    );

    assert.throws(
      () => p.cerrar(false),
      /El prospecto ya se encuentra cerrado en estado 'CERRADO_GANADO'/
    );
  });
});

test('Dominio e Infraestructura - Contrato IProspectoRepository', async () => {
  const repo = new InMemoryProspectoRepository();

  const p1 = Prospecto.crear({
    nombre: 'Ana Perez',
    email: 'ana@gmail.com',
    telefono: '1199887766',
    canalOrigen: 'WHATSAPP'
  });

  await repo.guardar(p1);

  const porId = await repo.buscarPorId(p1.id);
  assert.ok(porId);
  assert.equal(porId.id, p1.id);

  const porEmail = await repo.buscarPorEmail('ANA@GMAIL.COM');
  assert.ok(porEmail);
  assert.equal(porEmail.id, p1.id);

  const porTel = await repo.buscarPorTelefono('1199887766');
  assert.ok(porTel);
  assert.equal(porTel.id, p1.id);

  const todos = await repo.buscarTodos();
  assert.equal(todos.length, 1);

  const eliminado = await repo.eliminar(p1.id);
  assert.equal(eliminado, true);

  const busquedaPostEliminar = await repo.buscarPorId(p1.id);
  assert.equal(busquedaPostEliminar, null);
});
