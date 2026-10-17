/**
 * GOOGLE APPS SCRIPT — MEJORA CONTINUA (EDICIÓN 2026)
 * Dispatcher & Notifier: Webhook REST -> Google Sheets ("Leads_2026") & Alertas Gmail.
 * 
 * GUÍA DE DESPLIEGUE EN GOOGLE WORKSPACE:
 * 1. Abrir Google Drive o la Planilla de Google Sheets donde se recibirán los leads.
 * 2. Ir al menú: Extensiones > Apps Script.
 * 3. Pegar este código completo en el archivo Code.gs (o google-apps-script.js).
 * 4. (Opcional) Configurar en "Configuración del proyecto > Propiedades de la secuencia de comandos":
 *    - ALERT_EMAIL: correo destinatario de las alertas (ej: pablo@mejoraok.com).
 * 5. Clic en "Implementar" (Deploy) > "Nueva implementación" (New deployment).
 *    - Tipo: Aplicación web (Web app).
 *    - Descripción: "MejoraNucleo Leads Webhook v1".
 *    - Ejecutar como: "Yo" (tu cuenta de Google Workspace).
 *    - Quién tiene acceso: "Cualquier usuario" (Anyone) — Necesario para recibir webhooks desde el backend.
 * 6. Copiar la "URL de la aplicación web" resultante y configurarla en MejoraNucleo
 *    como variable de entorno: GOOGLE_APPS_SCRIPT_WEBHOOK_URL.
 */

// Configuración Central de Marca y Workspace
var CONFIG = {
  SHEET_NAME: 'Leads_2026',
  DEFAULT_ALERT_EMAIL: 'pablo@mejoraok.com',
  BRAND_NAME: 'Mejora Continua',
  COLOR_AZUL: '#1A3D84',
  COLOR_ROJO: '#E1061E',
  COLOR_AMARILLO: '#F7CC13',
  COLOR_TINTA: '#2B2B2B',
  COLOR_FONDO: '#F8FAFC',
  COLOR_BORDE: '#E2E8F0'
};

/**
 * Endpoint POST: Recibe el payload JSON desde MejoraNucleo
 * @param {Object} e - Evento de solicitud HTTP recibido por GAS
 * @returns {ContentService.TextOutput} Respuesta JSON con estado de la operación
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  
  // Evitar condiciones de carrera si entran múltiples leads simultáneos (espera hasta 10 segundos)
  try {
    lock.waitLock(10000);
  } catch (lockError) {
    return crearRespuestaJson({
      success: false,
      error: 'Servidor ocupado. No se pudo obtener el bloqueo de concurrencia: ' + lockError.toString()
    }, 429);
  }

  try {
    // 1. Validar y parsear el payload JSON
    if (!e || !e.postData || !e.postData.contents) {
      return crearRespuestaJson({
        success: false,
        error: 'El cuerpo de la solicitud (postData) está vacío o es inválido.'
      }, 400);
    }

    var payload = JSON.parse(e.postData.contents);

    // Extraer campos canónicos del prospecto
    var id = String(payload.id || Utilities.getUuid());
    var nombre = String(payload.nombre || '').trim();
    var email = String(payload.email || '').trim().toLowerCase();
    var telefono = String(payload.telefono || '').trim();
    var canalOrigen = String(payload.canalOrigen || 'desconocido').trim();
    var estado = String(payload.estado || 'CAPTURADO').trim();
    var createdAt = String(payload.createdAt || new Date().toISOString());

    if (!nombre || !email) {
      return crearRespuestaJson({
        success: false,
        error: 'Los campos "nombre" y "email" son obligatorios.'
      }, 400);
    }

    // 2. Registrar en Google Sheets ("Leads_2026")
    var sheetResult = registrarEnSheet({
      id: id,
      createdAt: createdAt,
      nombre: nombre,
      email: email,
      telefono: telefono,
      canalOrigen: canalOrigen,
      estado: estado
    });

    // 3. Enviar Alerta Inmediata por Email (Gmail / MailApp)
    var emailResult = enviarAlertaEmail({
      id: id,
      createdAt: createdAt,
      nombre: nombre,
      email: email,
      telefono: telefono,
      canalOrigen: canalOrigen,
      estado: estado,
      sheetUrl: sheetResult.sheetUrl
    });

    // 4. Retornar respuesta exitosa
    return crearRespuestaJson({
      success: true,
      mensaje: 'Lead registrado y notificado exitosamente en Google Workspace',
      id: id,
      fila: sheetResult.fila,
      emailEnviado: emailResult.enviado,
      timestamp: new Date().toISOString()
    }, 201);

  } catch (error) {
    Logger.log('[MejoraNucleo GAS] Error en doPost: ' + error.toString());
    return crearRespuestaJson({
      success: false,
      error: 'Error interno en Google Apps Script: ' + error.toString()
    }, 500);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Endpoint GET: Health-check para verificar disponibilidad de la Web App
 */
function doGet(e) {
  return crearRespuestaJson({
    status: 'activo',
    servicio: 'Mejora Continua — Google Workspace Webhook API',
    hojaConfigurada: CONFIG.SHEET_NAME,
    timestamp: new Date().toISOString()
  }, 200);
}

/**
 * Registra los datos del prospecto en la pestaña Leads_2026 de la planilla activa
 */
function registrarEnSheet(prospecto) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No se encontró una planilla activa vinculada al script.');
  }

  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Si la pestaña no existe, crearla y formatear encabezados
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    configurarEncabezados(sheet);
  } else {
    // Si la hoja está vacía, asegurar encabezados
    if (sheet.getLastRow() === 0) {
      configurarEncabezados(sheet);
    }
  }

  // Insertar fila con datos del prospecto
  var nuevaFila = [
    prospecto.id,
    formatearFechaLocal(prospecto.createdAt),
    prospecto.nombre,
    prospecto.email,
    prospecto.telefono || '-',
    prospecto.canalOrigen,
    prospecto.estado,
    new Date() // Timestamp de registro en Sheet
  ];

  sheet.appendRow(nuevaFila);
  var numFila = sheet.getLastRow();

  // Aplicar formato visual limpio a la nueva fila
  var rangoFila = sheet.getRange(numFila, 1, 1, nuevaFila.length);
  rangoFila.setVerticalAlignment('middle');
  rangoFila.setFontFamily('Inter');
  rangoFila.setFontSize(10);

  // Destacar estado CAPTURADO con acento suave
  var celdaEstado = sheet.getRange(numFila, 7);
  celdaEstado.setFontWeight('bold');
  celdaEstado.setFontColor(CONFIG.COLOR_ROJO);

  return {
    fila: numFila,
    sheetUrl: ss.getUrl()
  };
}

/**
 * Configura los encabezados de la pestaña con los estilos oficiales de marca
 */
function configurarEncabezados(sheet) {
  var encabezados = [
    'ID Prospecto',
    'Fecha Captura',
    'Nombre y Apellido',
    'Correo Electrónico',
    'Teléfono / WhatsApp',
    'Canal Origen',
    'Estado Lead',
    'Fecha Sync Sheet'
  ];

  sheet.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);

  // Formato oficial de cabecera: Azul Primario (#1A3D84), texto blanco, negrita
  var headerRange = sheet.getRange(1, 1, 1, encabezados.length);
  headerRange.setBackground(CONFIG.COLOR_AZUL);
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontFamily('League Spartan');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);

  // Congelar la fila 1 para facilitar navegación
  sheet.setFrozenRows(1);

  // Autoajuste de anchos de columna
  for (var col = 1; col <= encabezados.length; col++) {
    sheet.autoResizeColumn(col);
  }
}

/**
 * Envía una notificación HTML vía MailApp a los responsables comerciales
 */
function enviarAlertaEmail(prospecto) {
  var props = PropertiesService.getScriptProperties();
  var destinatario = props.getProperty('ALERT_EMAIL') || CONFIG.DEFAULT_ALERT_EMAIL;

  var asunto = '🚨 Nuevo Lead Capturado: ' + prospecto.nombre + ' (' + prospecto.canalOrigen + ')';

  // Plantilla HTML con diseño sobrio y tokens de marca (Manual 2026)
  var cuerpoHtml = '' +
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '  <meta charset="UTF-8">' +
    '</head>' +
    '<body style="font-family: \'Inter\', Arial, sans-serif; background-color: ' + CONFIG.COLOR_FONDO + '; margin: 0; padding: 24px; color: ' + CONFIG.COLOR_TINTA + ';">' +
    '  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid ' + CONFIG.COLOR_BORDE + '; box-shadow: 0 4px 12px rgba(26,61,132,0.08); overflow: hidden;">' +
    '    <!-- Cabecera de Marca -->' +
    '    <tr>' +
    '      <td style="background-color: ' + CONFIG.COLOR_AZUL + '; padding: 24px 32px; text-align: left;">' +
    '        <div style="font-family: \'League Spartan\', Arial, sans-serif; font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.05em;">' +
    '          MEJORA CONTINUA' +
    '        </div>' +
    '        <div style="font-size: 13px; color: #E2E8F0; margin-top: 4px;">' +
    '          Notificación Automática de Captación · Workspace 2026' +
    '        </div>' +
    '      </td>' +
    '    </tr>' +
    '    <!-- Badge de Estado -->' +
    '    <tr>' +
    '      <td style="padding: 24px 32px 12px 32px;">' +
    '        <span style="display: inline-block; background-color: #FEF2F2; color: ' + CONFIG.COLOR_ROJO + '; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; border: 1px solid #FECACA;">' +
    '          ESTADO: ' + prospecto.estado +
    '        </span>' +
    '        <h2 style="font-family: \'League Spartan\', Arial, sans-serif; font-size: 24px; font-weight: 800; color: ' + CONFIG.COLOR_AZUL + '; margin: 12px 0 6px 0;">' +
    '          Nuevo prospecto recibido' +
    '        </h2>' +
    '        <p style="font-size: 14px; color: #64748B; margin: 0 0 20px 0;">' +
    '          Un nuevo contacto completó el formulario de captación estratégica.' +
    '        </p>' +
    '      </td>' +
    '    </tr>' +
    '    <!-- Ficha de Datos del Prospecto -->' +
    '    <tr>' +
    '      <td style="padding: 0 32px 24px 32px;">' +
    '        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">' +
    '          <tr style="border-bottom: 1px solid #F1F5F9;">' +
    '            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #64748B; width: 35%;">Nombre y Apellido:</td>' +
    '            <td style="padding: 10px 0; font-size: 14px; font-weight: 700; color: ' + CONFIG.COLOR_TINTA + ';">' + prospecto.nombre + '</td>' +
    '          </tr>' +
    '          <tr style="border-bottom: 1px solid #F1F5F9;">' +
    '            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #64748B;">Correo Electrónico:</td>' +
    '            <td style="padding: 10px 0; font-size: 14px;"><a href="mailto:' + prospecto.email + '" style="color: ' + CONFIG.COLOR_AZUL + '; text-decoration: none; font-weight: 600;">' + prospecto.email + '</a></td>' +
    '          </tr>' +
    '          <tr style="border-bottom: 1px solid #F1F5F9;">' +
    '            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #64748B;">Teléfono / WhatsApp:</td>' +
    '            <td style="padding: 10px 0; font-size: 14px; color: ' + CONFIG.COLOR_TINTA + ';">' + (prospecto.telefono ? '<a href="https://wa.me/' + prospecto.telefono.replace(/[^0-9]/g, '') + '" style="color: #0D8A58; text-decoration: none; font-weight: 600;">' + prospecto.telefono + ' (WhatsApp)</a>' : 'No especificado') + '</td>' +
    '          </tr>' +
    '          <tr style="border-bottom: 1px solid #F1F5F9;">' +
    '            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #64748B;">Canal de Origen:</td>' +
    '            <td style="padding: 10px 0; font-size: 13px; color: ' + CONFIG.COLOR_TINTA + ';"><code style="background-color: #F1F5F9; padding: 2px 6px; border-radius: 4px;">' + prospecto.canalOrigen + '</code></td>' +
    '          </tr>' +
    '          <tr style="border-bottom: 1px solid #F1F5F9;">' +
    '            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #64748B;">Fecha y Hora:</td>' +
    '            <td style="padding: 10px 0; font-size: 13px; color: #64748B;">' + formatearFechaLocal(prospecto.createdAt) + '</td>' +
    '          </tr>' +
    '          <tr>' +
    '            <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #64748B;">ID de Registro:</td>' +
    '            <td style="padding: 10px 0; font-size: 11px; font-family: monospace; color: #94A3B8;">' + prospecto.id + '</td>' +
    '          </tr>' +
    '        </table>' +
    '      </td>' +
    '    </tr>' +
    '    <!-- Botón de Acción a la Planilla -->' +
    '    <tr>' +
    '      <td style="padding: 8px 32px 32px 32px; text-align: center;">' +
    '        <a href="' + (prospecto.sheetUrl || '#') + '" target="_blank" style="display: inline-block; background-color: ' + CONFIG.COLOR_ROJO + '; color: #FFFFFF; font-family: \'League Spartan\', Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 10px rgba(225,6,30,0.3);">' +
    '          Abrir Planilla de Leads (Sheets)' +
    '        </a>' +
    '      </td>' +
    '    </tr>' +
    '    <!-- Pie de Alerta -->' +
    '    <tr>' +
    '      <td style="background-color: #F8FAFC; border-top: 1px solid ' + CONFIG.COLOR_BORDE + '; padding: 16px 32px; font-size: 12px; color: #94A3B8; text-align: center;">' +
    '        Mejora Continua · Acompañamos personas que lideran empresas · mejoraok.com' +
    '      </td>' +
    '    </tr>' +
    '  </table>' +
    '</body>' +
    '</html>';

  try {
    MailApp.sendEmail({
      to: destinatario,
      subject: asunto,
      htmlBody: cuerpoHtml
    });
    return { enviado: true };
  } catch (mailErr) {
    Logger.log('[MejoraNucleo GAS] Advertencia: No se pudo enviar el email: ' + mailErr.toString());
    return { enviado: false, error: mailErr.toString() };
  }
}

/**
 * Función auxiliar para dar formato de respuesta JSON con cabeceras correctas
 */
function crearRespuestaJson(objeto, codigoHttp) {
  var salida = ContentService.createTextOutput(JSON.stringify(objeto));
  salida.setMimeType(ContentService.MimeType.JSON);
  return salida;
}

/**
 * Formatea una fecha ISO a formato local legible
 */
function formatearFechaLocal(isoString) {
  try {
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm:ss');
  } catch (e) {
    return isoString;
  }
}

/**
 * Función de prueba local ejecutable directamente en el editor de Google Apps Script
 */
function testDoPost() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        id: 'test-' + Utilities.getUuid().substring(0, 8),
        nombre: 'Leandro Paredes',
        email: 'leandro.test@seleccion.com.ar',
        telefono: '+54 9 11 5566-7788',
        canalOrigen: 'test_local_gas',
        estado: 'CAPTURADO',
        createdAt: new Date().toISOString()
      })
    }
  };

  var res = doPost(mockEvent);
  Logger.log('Resultado prueba doPost: ' + res.getContent());
}
