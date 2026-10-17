import type { ProspectoResponseDTO } from '../../application/prospecto.dto.js';

export interface WorkspaceNotifierConfig {
  /**
   * URL de la aplicación web desplegada en Google Apps Script
   * Ejemplo: https://script.google.com/macros/s/AKfycbx.../exec
   */
  webhookUrl?: string;

  /**
   * Timeout en milisegundos para la solicitud HTTP (default: 5000ms)
   * Respeta los presupuestos de tiempo de respuesta de cliente (Fast-Window).
   */
  timeoutMs?: number;

  /**
   * Si está habilitado el envío. Si es false o webhookUrl está vacía, se omite silenciosamente.
   */
  enabled?: boolean;

  /**
   * Función opcional para registro de auditoría y trazas de diagnóstico.
   */
  logger?: (mensaje: string) => void;
}

export interface WorkspaceNotificationResult {
  enviado: boolean;
  omitido?: boolean;
  id?: string;
  duracionMs: number;
  statusHttp?: number;
  respuestaGas?: unknown;
  error?: string;
}

/**
 * Servicio de infraestructura para disparar notificaciones hacia Google Workspace (Google Sheets / Gmail)
 * a través de un Webhook desplegado en Google Apps Script (GAS).
 * 
 * Sigue la Directiva Zero-Trust Principal SRE:
 * - Operación defensiva y resiliente: no rompe la transacción principal de la API si GAS falla.
 * - Manejo formal de presupuestos de latencia mediante AbortController / timeout.
 * - Modelado tipado sin atajos textuales.
 */
export class WorkspaceNotifierService {
  private readonly webhookUrl?: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;
  private readonly logger: (mensaje: string) => void;

  constructor(config?: WorkspaceNotifierConfig) {
    this.webhookUrl =
      config?.webhookUrl ??
      process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL ??
      process.env.GAS_LEADS_WEBHOOK_URL;

    this.timeoutMs = config?.timeoutMs ?? 5000;
    this.enabled = config?.enabled ?? Boolean(this.webhookUrl);
    this.logger = config?.logger ?? ((msg: string) => console.log(`[WorkspaceNotifier] ${msg}`));
  }

  /**
   * Determina si el notificador está configurado y activo para enviar eventos.
   */
  public isConfigured(): boolean {
    return Boolean(this.enabled && this.webhookUrl && this.webhookUrl.trim().length > 0);
  }

  /**
   * Notifica la creación de un nuevo prospecto hacia Google Workspace.
   * 
   * @param prospecto DTO del prospecto generado en MejoraNucleo
   * @returns Resultado detallado con latencia, estado de envío y respuesta de GAS
   */
  public async notificarNuevoProspecto(
    prospecto: ProspectoResponseDTO
  ): Promise<WorkspaceNotificationResult> {
    if (!this.isConfigured() || !this.webhookUrl) {
      return {
        enviado: false,
        omitido: true,
        id: prospecto.id,
        duracionMs: 0
      };
    }

    const inicio = performance.now();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const payload = {
      id: prospecto.id,
      nombre: prospecto.nombre,
      email: prospecto.email,
      telefono: prospecto.telefono,
      canalOrigen: prospecto.canalOrigen,
      estado: prospecto.estado,
      createdAt: prospecto.createdAt,
      updatedAt: prospecto.updatedAt
    };

    try {
      this.logger(`Enviando evento de lead ${prospecto.id} (${prospecto.email}) hacia Google Apps Script...`);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'follow'
      });

      const duracionMs = Math.round(performance.now() - inicio);

      // GAS puede devolver texto plano, HTML o JSON según el estado de ejecución
      let respuestaGas: unknown = null;
      const rawText = await response.text();
      try {
        respuestaGas = rawText ? JSON.parse(rawText) : null;
      } catch {
        respuestaGas = rawText;
      }

      if (response.ok || response.status === 200 || response.status === 201) {
        this.logger(`Lead ${prospecto.id} entregado a Google Workspace en ${duracionMs}ms. Status: ${response.status}`);
        return {
          enviado: true,
          id: prospecto.id,
          duracionMs,
          statusHttp: response.status,
          respuestaGas
        };
      }

      const errMsg = `Respuesta no exitosa de Google Apps Script: HTTP ${response.status} - ${typeof respuestaGas === 'string' ? respuestaGas : JSON.stringify(respuestaGas)}`;
      this.logger(`Error: ${errMsg}`);
      return {
        enviado: false,
        id: prospecto.id,
        duracionMs,
        statusHttp: response.status,
        respuestaGas,
        error: errMsg
      };

    } catch (err: unknown) {
      const duracionMs = Math.round(performance.now() - inicio);
      let mensajeError = 'Error desconocido al comunicar con Google Workspace';

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          mensajeError = `Timeout superado (${this.timeoutMs}ms) al contactar Google Apps Script.`;
        } else {
          mensajeError = err.message;
        }
      }

      this.logger(`Fallo en notificación a Workspace para lead ${prospecto.id}: ${mensajeError}`);
      return {
        enviado: false,
        id: prospecto.id,
        duracionMs,
        error: mensajeError
      };

    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
