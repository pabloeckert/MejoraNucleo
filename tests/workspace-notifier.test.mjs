import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WorkspaceNotifierService,
  createAppServer,
  SqliteProspectoRepository,
  EstadoProspecto
} from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Módulo de Automatización Google Workspace & Apps Script', async (t) => {
  const dummyProspecto = {
    id: 'test-prospecto-001',
    nombre: 'Lionel Scaloni',
    email: 'scaloni@afateam.com.ar',
    telefono: '+5491144332211',
    canalOrigen: 'sitio_web_hostinger',
    estado: EstadoProspecto.CAPTURADO,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await t.test('1. Verificación estática de google-apps-script.js', () => {
    const gasPath = path.resolve(__dirname, '../src/infrastructure/workspace/google-apps-script.js');
    assert.ok(fs.existsSync(gasPath), 'google-apps-script.js debe existir en src/infrastructure/workspace/');

    const gasCode = fs.readFileSync(gasPath, 'utf-8');

    // Validación de doPost(e) y doGet(e)
    assert.match(gasCode, /function\s+doPost\s*\(\s*e\s*\)/, 'Debe implementar la función doPost(e)');
    assert.match(gasCode, /function\s+doGet\s*\(\s*e\s*\)/, 'Debe implementar la función doGet(e)');
    assert.match(gasCode, /function\s+testDoPost\s*\(\s*\)/, 'Debe proveer función de prueba testDoPost()');

    // Validación de lógica de Google Sheets
    assert.match(gasCode, /SpreadsheetApp\.getActiveSpreadsheet\(\)/, 'Debe abrir la planilla activa');
    assert.match(gasCode, /Leads_2026/, 'Debe utilizar la pestaña Leads_2026');
    assert.match(gasCode, /appendRow\s*\(/, 'Debe insertar filas con appendRow');

    // Validación de notificación por Email
    assert.match(gasCode, /MailApp\.sendEmail\s*\(/, 'Debe enviar alertas con MailApp.sendEmail');
    assert.match(gasCode, /🚨 Nuevo Lead Capturado:/, 'Asunto de email debe incluir el prefijo exacto');
    assert.match(gasCode, /#1A3D84/, 'Debe utilizar el Azul Primario del Manual de Marca');
    assert.match(gasCode, /#E1061E/, 'Debe utilizar el Rojo Acento del Manual de Marca');
  });

  await t.test('2. Omitir notificación cuando no está configurada la URL de webhook', async () => {
    const notifier = new WorkspaceNotifierService({ enabled: false });
    assert.equal(notifier.isConfigured(), false);

    const resultado = await notifier.notificarNuevoProspecto(dummyProspecto);
    assert.equal(resultado.enviado, false);
    assert.equal(resultado.omitido, true);
    assert.equal(resultado.duracionMs, 0);
  });

  await t.test('3. Envío exitoso hacia webhook simulado de Google Apps Script', async () => {
    let payloadRecibido = null;

    // Levantar servidor HTTP simulando el endpoint de Google Apps Script
    const mockGasServer = http.createServer(async (req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          payloadRecibido = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            id: payloadRecibido.id,
            fila: 2,
            emailEnviado: true
          }));
        });
      }
    });

    await new Promise(resolve => mockGasServer.listen(0, resolve));
    const address = mockGasServer.address();
    const webhookUrl = `http://localhost:${address.port}/exec`;

    try {
      const logs = [];
      const notifier = new WorkspaceNotifierService({
        webhookUrl,
        timeoutMs: 3000,
        logger: (msg) => logs.push(msg)
      });

      assert.equal(notifier.isConfigured(), true);
      const resultado = await notifier.notificarNuevoProspecto(dummyProspecto);

      assert.equal(resultado.enviado, true);
      assert.equal(resultado.statusHttp, 200);
      assert.ok(resultado.duracionMs >= 0);
      assert.ok(payloadRecibido, 'El mock de GAS debió recibir el payload');
      assert.equal(payloadRecibido.id, dummyProspecto.id);
      assert.equal(payloadRecibido.nombre, dummyProspecto.nombre);
      assert.equal(payloadRecibido.email, dummyProspecto.email);
      assert.equal(payloadRecibido.telefono, dummyProspecto.telefono);
      assert.equal(payloadRecibido.canalOrigen, dummyProspecto.canalOrigen);
      assert.equal(payloadRecibido.estado, dummyProspecto.estado);
    } finally {
      await new Promise(resolve => mockGasServer.close(resolve));
    }
  });

  await t.test('4. Manejo resiliente de timeout (Fast-Window / AbortController)', async () => {
    // Servidor que retrasa deliberadamente la respuesta
    const slowServer = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end('ok');
      }, 300);
    });

    await new Promise(resolve => slowServer.listen(0, resolve));
    const address = slowServer.address();
    const webhookUrl = `http://localhost:${address.port}/exec`;

    try {
      const notifier = new WorkspaceNotifierService({
        webhookUrl,
        timeoutMs: 80, // Timeout estricto menor a la respuesta
        logger: () => {}
      });

      const resultado = await notifier.notificarNuevoProspecto(dummyProspecto);
      assert.equal(resultado.enviado, false);
      assert.ok(resultado.error);
      assert.match(resultado.error, /Timeout superado/);
    } finally {
      await new Promise(resolve => slowServer.close(resolve));
    }
  });

  await t.test('5. Integración end-to-end con createAppServer y POST /api/prospectos', async () => {
    let webhookInvocado = false;
    let leadNotificado = null;

    // Servidor mock de GAS
    const mockGas = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        webhookInvocado = true;
        leadNotificado = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
    });

    await new Promise(resolve => mockGas.listen(0, resolve));
    const gasAddress = mockGas.address();

    const notifier = new WorkspaceNotifierService({
      webhookUrl: `http://localhost:${gasAddress.port}/exec`,
      timeoutMs: 3000,
      logger: () => {}
    });

    const repo = new SqliteProspectoRepository(':memory:');
    const app = createAppServer({
      port: 0,
      repository: repo,
      workspaceNotifier: notifier
    });

    const { url } = await app.start();

    try {
      const payload = {
        nombre: 'Rodrigo De Paul',
        email: 'depaul@atletico.es',
        telefono: '+34600112233',
        canalOrigen: 'sitio_web_hostinger'
      };

      const res = await fetch(`${url}/api/prospectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.estado, EstadoProspecto.CAPTURADO);

      // Esperar brevemente a que el dispatch en background complete
      await new Promise(resolve => setTimeout(resolve, 80));

      assert.equal(webhookInvocado, true, 'El webhook de GAS debió ser invocado');
      assert.equal(leadNotificado.email, 'depaul@atletico.es');
      assert.equal(leadNotificado.canalOrigen, 'sitio_web_hostinger');
      assert.equal(leadNotificado.estado, EstadoProspecto.CAPTURADO);

    } finally {
      await app.stop();
      repo.close();
      await new Promise(resolve => mockGas.close(resolve));
    }
  });
});
