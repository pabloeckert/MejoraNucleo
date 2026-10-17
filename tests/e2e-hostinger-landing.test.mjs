import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer, SqliteProspectoRepository, EstadoProspecto } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const landingDir = path.resolve(__dirname, '../../MejoraApp/landing');

test('E2E Landing Hostinger <-> MejoraNucleo REST API', async (t) => {
  // Configurar base de datos SQLite en memoria para aislamiento zero-trust
  const repo = new SqliteProspectoRepository(':memory:');
  const app = createAppServer({ port: 3000, repository: repo });
  const { url } = await app.start();

  t.after(async () => {
    await app.stop();
    repo.close();
  });

  await t.test('1. Verificación de archivos estáticos en MejoraApp/landing', async () => {
    const indexPath = path.join(landingDir, 'index.html');
    const stylesPath = path.join(landingDir, 'styles.css');
    const captacionPath = path.join(landingDir, 'captacion.js');

    assert.ok(fs.existsSync(indexPath), 'index.html debe existir en MejoraApp/landing');
    assert.ok(fs.existsSync(stylesPath), 'styles.css debe existir en MejoraApp/landing');
    assert.ok(fs.existsSync(captacionPath), 'captacion.js debe existir en MejoraApp/landing');

    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    const stylesCss = fs.readFileSync(stylesPath, 'utf-8');
    const captacionJs = fs.readFileSync(captacionPath, 'utf-8');

    // Validación de StoryBrand Hero
    assert.match(indexHtml, /No estás perdido\.\s*<br>\s*<span class="highlight-text">Estás desordenado\.<\/span>/i, 'Headline debe ser exacto');
    assert.match(indexHtml, /Acompañamos a líderes y equipos a tomar mejores decisiones con claridad, método y calidez con verdad\./i, 'Subheadline debe ser exacto');
    assert.match(indexHtml, /¿Cómo está tu empresa hoy\?/i, 'CTA primario debe coincidir');

    // Validación de Formatos Propios Integrados
    assert.match(indexHtml, /After Office/i, 'Debe incluir After Office');
    assert.match(indexHtml, /12x12/i, 'Debe mencionar la regla 12x12');
    assert.match(indexHtml, /TallerMC/i, 'Debe incluir TallerMC');
    assert.match(indexHtml, /60 minutos/i, 'Debe mencionar los 60 minutos de TallerMC');

    // Validación de 4 Dimensiones + Profesionalización
    assert.match(indexHtml, /Personal/i, 'Dimensión Personal');
    assert.match(indexHtml, /Organizacional/i, 'Dimensión Organizacional');
    assert.match(indexHtml, /Comercial/i, 'Dimensión Comercial');
    assert.match(indexHtml, /Empresarial/i, 'Dimensión Empresarial');
    assert.match(indexHtml, /Profesionalización/i, 'Nivel Integrador Profesionalización');

    // Validación de Formulario Minimalista
    assert.match(indexHtml, /id="nombre"/, 'Input nombre presente');
    assert.match(indexHtml, /id="email"/, 'Input email presente');
    assert.match(indexHtml, /id="telefono"/, 'Input telefono presente');
    assert.match(indexHtml, /id="canalOrigen"[^>]*value="sitio_web_hostinger"/, 'Hidden canalOrigen = sitio_web_hostinger');
    assert.match(indexHtml, /id="status-success"/, 'Contenedor status-success presente');
    assert.match(indexHtml, /id="status-error"/, 'Contenedor status-error presente');
    assert.match(indexHtml, /id="status-offline"/, 'Contenedor status-offline presente');

    // Optimización AEO 2026: Schema.org JSON-LD
    assert.match(indexHtml, /application\/ld\+json/, 'Debe incluir bloque JSON-LD');
    assert.match(indexHtml, /"Organization"/, 'Schema Organization presente');
    assert.match(indexHtml, /"ProfessionalService"/, 'Schema ProfessionalService presente');

    // Restricciones de Marca: Submarcas descontinuadas
    assert.doesNotMatch(indexHtml, /Mejora TV/i, 'Prohibido mencionar Mejora TV');
    assert.doesNotMatch(indexHtml, /Fuckup Nights/i, 'Prohibido mencionar Fuckup Nights');
    assert.doesNotMatch(indexHtml, /Buenas Historias/i, 'Prohibido mencionar Buenas Historias');

    // Tokens CSS del Manual Unificado de Marca
    assert.match(stylesCss, /#FFFFFF/i, 'Token Blanco Dominante');
    assert.match(stylesCss, /#1A3D84/i, 'Token Azul Primario');
    assert.match(stylesCss, /#E1061E/i, 'Token Rojo Acento');
    assert.match(stylesCss, /#F7CC13/i, 'Token Amarillo');
    assert.match(stylesCss, /#2B2B2B/i, 'Token Texto Tinta');
    assert.match(stylesCss, /#6B7280/i, 'Token Gris Borde');
    assert.match(stylesCss, /League Spartan/i, 'Tipografía Titulares League Spartan');

    // Script de Captación y Resiliencia Offline
    assert.match(captacionJs, /e\.preventDefault\(\)/, 'Debe interceptar submit');
    assert.match(captacionJs, /mejora_leads_pendientes/, 'Clave de almacenamiento offline en localStorage');
    assert.match(captacionJs, /window\.addEventListener\('online'/, 'Manejador de reconexión online');
  });

  await t.test('2. Envío exitoso de lead desde landing hacia MejoraNucleo y confirmación en BD', async () => {
    const leadPayload = {
      nombre: 'Valeria Sotomayor',
      email: 'valeria@directiva.com.ar',
      telefono: '+5491144889900',
      canalOrigen: 'sitio_web_hostinger'
    };

    const response = await fetch(`${url}/api/prospectos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(leadPayload)
    });

    assert.equal(response.status, 201, 'Debe responder 201 Created');
    const responseData = await response.json();

    assert.ok(responseData.id, 'Debe devolver un ID generado');
    assert.equal(responseData.nombre, leadPayload.nombre);
    assert.equal(responseData.email, leadPayload.email);
    assert.equal(responseData.telefono, leadPayload.telefono);
    assert.equal(responseData.canalOrigen, 'sitio_web_hostinger');
    assert.equal(responseData.estado, EstadoProspecto.CAPTURADO, 'Estado inicial debe ser CAPTURADO');

    // Comprobación física contra la persistencia en base de datos SQLite
    const prospectoEnDb = await repo.buscarPorId(responseData.id);
    assert.ok(prospectoEnDb, 'El prospecto debe existir físicamente en la base de datos');
    assert.equal(prospectoEnDb.estado, EstadoProspecto.CAPTURADO);
    assert.equal(prospectoEnDb.canalOrigen, 'sitio_web_hostinger');
    assert.equal(prospectoEnDb.email, 'valeria@directiva.com.ar');
  });

  await t.test('3. Rechazo descriptivo ante email malformado (400 Bad Request)', async () => {
    const invalidPayload = {
      nombre: 'Lead Invalido',
      email: 'no-es-un-email',
      telefono: '',
      canalOrigen: 'sitio_web_hostinger'
    };

    const response = await fetch(`${url}/api/prospectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });

    assert.equal(response.status, 400);
    const errorData = await response.json();
    assert.ok(errorData.error);
    assert.match(errorData.error, /El formato del email/);
  });
});
