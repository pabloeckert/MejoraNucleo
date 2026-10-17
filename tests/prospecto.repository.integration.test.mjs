import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  EstadoProspecto,
  Prospecto,
  SqliteProspectoRepository,
  FileProspectoRepository,
  CrearProspectoUseCase,
  CalificarProspectoUseCase,
  IniciarSeguimientoUseCase,
  CerrarProspectoUseCase
} from '../dist/index.js';

test('Capa de Infraestructura - SqliteProspectoRepository', async (t) => {
  const tmpDbPath = path.resolve('test_prospectos_sqlite.db');

  // Asegurar limpieza inicial
  await fs.rm(tmpDbPath, { force: true });

  let repo = new SqliteProspectoRepository(tmpDbPath);

  t.after(async () => {
    repo.close();
    await fs.rm(tmpDbPath, { force: true });
  });

  await t.test('1. Debe guardar un prospecto y recuperarlo por ID', async () => {
    const p = Prospecto.crear({
      nombre: 'Valentin Rossi',
      email: 'valentin@rossi.com',
      telefono: '+5491100112233',
      canalOrigen: 'INSTAGRAM'
    });

    await repo.guardar(p);

    const obtenido = await repo.buscarPorId(p.id);
    assert.ok(obtenido);
    assert.equal(obtenido.id, p.id);
    assert.equal(obtenido.nombre, 'Valentin Rossi');
    assert.equal(obtenido.email, 'valentin@rossi.com');
    assert.equal(obtenido.telefono, '+5491100112233');
    assert.equal(obtenido.canalOrigen, 'INSTAGRAM');
    assert.equal(obtenido.estado, EstadoProspecto.CAPTURADO);
  });

  await t.test('2. Debe buscar por email y teléfono con normalización', async () => {
    const porEmail = await repo.buscarPorEmail('VALENTIN@rossi.COM ');
    assert.ok(porEmail);
    assert.equal(porEmail.nombre, 'Valentin Rossi');

    const porTel = await repo.buscarPorTelefono(' +5491100112233 ');
    assert.ok(porTel);
    assert.equal(porTel.email, 'valentin@rossi.com');

    const inexistente = await repo.buscarPorEmail('noexiste@mail.com');
    assert.equal(inexistente, null);
  });

  await t.test('3. Debe actualizar (UPSERT) los cambios de estado del prospecto', async () => {
    const prospecto = await repo.buscarPorEmail('valentin@rossi.com');
    assert.ok(prospecto);

    prospecto.calificar();
    await repo.guardar(prospecto);

    const actualizado = await repo.buscarPorId(prospecto.id);
    assert.ok(actualizado);
    assert.equal(actualizado.estado, EstadoProspecto.CALIFICADO);
  });

  await t.test('4. Búsqueda y filtrado con paginación en SQLite', async () => {
    const p2 = Prospecto.crear({
      nombre: 'Maria Becerra',
      email: 'maria@musica.com',
      telefono: '+5491144332211',
      canalOrigen: 'TIKTOK'
    });
    await repo.guardar(p2);

    const filtradosEstado = await repo.buscarTodos({ estado: EstadoProspecto.CALIFICADO });
    assert.equal(filtradosEstado.length, 1);
    assert.equal(filtradosEstado[0].nombre, 'Valentin Rossi');

    const busquedaTexto = await repo.buscarTodos({ busqueda: 'Becerra' });
    assert.equal(busquedaTexto.length, 1);
    assert.equal(busquedaTexto[0].email, 'maria@musica.com');

    const paginados = await repo.buscarTodos({ limite: 1, offset: 0 });
    assert.equal(paginados.length, 1);
  });

  await t.test('5. Persistencia comprobada a través de reconexión de disco', async () => {
    repo.close();

    // Reabrir nuevo pool/conexión apuntando al mismo archivo SQLite en disco
    const repoReconectado = new SqliteProspectoRepository(tmpDbPath);

    const recuperado = await repoReconectado.buscarPorEmail('maria@musica.com');
    assert.ok(recuperado);
    assert.equal(recuperado.nombre, 'Maria Becerra');

    // Asignar al repo principal para cleanup
    repo = repoReconectado;
  });

  await t.test('6. Debe eliminar el prospecto y retornar true/false', async () => {
    const p2 = await repo.buscarPorEmail('maria@musica.com');
    assert.ok(p2);

    const eliminado = await repo.eliminar(p2.id);
    assert.equal(eliminado, true);

    const rechequeo = await repo.buscarPorId(p2.id);
    assert.equal(rechequeo, null);

    const eliminadoInexistente = await repo.eliminar('id-no-existente');
    assert.equal(eliminadoInexistente, false);
  });

  await t.test('7. Integración end-to-end con Use Cases sobre SQLite', async () => {
    const crearUC = new CrearProspectoUseCase(repo);
    const calificarUC = new CalificarProspectoUseCase(repo);
    const seguimientoUC = new IniciarSeguimientoUseCase(repo);
    const cerrarUC = new CerrarProspectoUseCase(repo);

    const creado = await crearUC.ejecutar({
      nombre: 'Esteban Quito',
      email: 'esteban@construcciones.com',
      telefono: '+5491177665544',
      canalOrigen: 'GOOGLE_ADS'
    });
    assert.equal(creado.estado, EstadoProspecto.CAPTURADO);

    const calificado = await calificarUC.ejecutar(creado.id);
    assert.equal(calificado.estado, EstadoProspecto.CALIFICADO);

    const enSeguimiento = await seguimientoUC.ejecutar(creado.id);
    assert.equal(enSeguimiento.estado, EstadoProspecto.EN_SEGUIMIENTO);

    const cerrado = await cerrarUC.ejecutar(creado.id, true);
    assert.equal(cerrado.estado, EstadoProspecto.CERRADO_GANADO);

    // Validación directa en el adapter
    const finalEnDb = await repo.buscarPorId(creado.id);
    assert.equal(finalEnDb?.estado, EstadoProspecto.CERRADO_GANADO);
  });
});

test('Capa de Infraestructura - FileProspectoRepository (JSON Storage)', async (t) => {
  const tmpJsonPath = path.resolve('test_prospectos.json');

  await fs.rm(tmpJsonPath, { force: true });

  const fileRepo = new FileProspectoRepository(tmpJsonPath);

  t.after(async () => {
    await fs.rm(tmpJsonPath, { force: true });
  });

  await t.test('1. Debe guardar y persistir prospecto en archivo JSON estructurado', async () => {
    const prospecto = Prospecto.crear({
      nombre: 'Romina Perez',
      email: 'romina@empresa.com',
      telefono: '+5491188990011',
      canalOrigen: 'LINKEDIN'
    });

    await fileRepo.guardar(prospecto);

    const leido = await fileRepo.buscarPorId(prospecto.id);
    assert.ok(leido);
    assert.equal(leido.nombre, 'Romina Perez');
    assert.equal(leido.estado, EstadoProspecto.CAPTURADO);

    // Verificar que el archivo JSON físico existe y tiene formato válido
    const rawContent = await fs.readFile(tmpJsonPath, 'utf-8');
    const parsed = JSON.parse(rawContent);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, prospecto.id);
  });

  await t.test('2. Transición y persistencia atómica con Casos de Uso', async () => {
    const prospecto = await fileRepo.buscarPorEmail('romina@empresa.com');
    assert.ok(prospecto);

    const calificarUC = new CalificarProspectoUseCase(fileRepo);
    await calificarUC.ejecutar(prospecto.id);

    // Recargar desde nueva instancia del repositorio
    const nuevoRepoReload = new FileProspectoRepository(tmpJsonPath);
    const recargado = await nuevoRepoReload.buscarPorId(prospecto.id);
    assert.ok(recargado);
    assert.equal(recargado.estado, EstadoProspecto.CALIFICADO);
  });

  await t.test('3. Filtrado, búsqueda y eliminación en repositorio de archivo', async () => {
    const p2 = Prospecto.crear({
      nombre: 'Gonzalo Higuain',
      email: 'gonzalo@fpc.com',
      telefono: '+5491166778899',
      canalOrigen: 'WHATSAPP'
    });
    await fileRepo.guardar(p2);

    const encontrados = await fileRepo.buscarTodos({ busqueda: 'Gonzalo' });
    assert.equal(encontrados.length, 1);
    assert.equal(encontrados[0].email, 'gonzalo@fpc.com');

    const eliminado = await fileRepo.eliminar(p2.id);
    assert.equal(eliminado, true);

    const noExiste = await fileRepo.buscarPorId(p2.id);
    assert.equal(noExiste, null);
  });
});
