import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAppServer } from './dist/interfaces/http/server.js';
import { SqliteProspectoRepository } from './dist/infrastructure/sqlite-prospecto.repository.js';

const PORT = Number(process.env.PORT_NUCLEO || 4002);
const dataDir = path.join(process.cwd(), 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'prospectos.db');
const db = new DatabaseSync(dbPath);
const repository = new SqliteProspectoRepository(db);

// Inyectar Semillas de Oro demostrativas si la base está vacía
const existentes = await repository.buscarTodos({ limite: 5 });
if (existentes.length === 0) {
  const appTemp = createAppServer({ port: 0, repository });
  const { url } = await appTemp.start();
  const seeds = [
    {
      nombre: 'Ing. Roberto Ferreyra (Metalúrgica del Litoral)',
      email: 'rferreyra@metalurgica-litoral.com.ar',
      telefono: '+5493764551122',
      canalOrigen: 'diagnostico_4d',
      piezaIdAtribucion: 'PROP-2026-W01-03',
      utmSource: 'instagram',
      utmMedium: 'organic_social',
      utmCampaign: 'evergreen_26s',
      buyerPersonaId: 'SATURADO'
    },
    {
      nombre: 'Lic. Mariana Gómez (Grupo Comercial NEA)',
      email: 'mgomez@gruponea.com.ar',
      telefono: '+5493764883344',
      canalOrigen: 'mejoraok_landing',
      piezaIdAtribucion: 'PROP-2026-W02-01',
      utmSource: 'facebook',
      utmMedium: 'organic_social',
      utmCampaign: 'evergreen_26s',
      buyerPersonaId: 'AREA_COMERCIAL_SIN_RESULTADOS'
    },
    {
      nombre: 'Carlos Benítez (Distribuidora Mayorista)',
      email: 'cbenitez@distribuidorasur.com',
      telefono: '+5491144556677',
      canalOrigen: 'base_propia_contactos',
      buyerPersonaId: 'SIN_PROFESIONALIZAR_LA_EMPRESA'
    }
  ];

  for (const s of seeds) {
    await fetch(`${url}/api/prospectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s)
    });
  }
  await appTemp.stop();
}

const server = createAppServer({ port: PORT, repository });
const { url } = await server.start();
console.log(`[MejoraNucleo] Servidor Central SLA 48h activo en ${url} (BD: ${dbPath})`);
