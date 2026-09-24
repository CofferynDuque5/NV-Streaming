import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Entorno } from '../config/entorno.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { CorreoRenderizado, NombrePlantilla } from './plantillas.js';

/**
 * Envía correos transaccionales. Con `CORREO_PROVEEDOR=sandbox` no sale nada:
 * el correo se guarda en `correos_salientes` y se muestra en consola.
 * Un fallo de envío nunca rompe la operación que lo pidió: queda registrado.
 */
@Injectable()
export class CorreoService {
  private readonly logger = new Logger('Correo');
  private readonly transporte: Transporter | null;

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {
    this.transporte =
      entorno.CORREO_PROVEEDOR === 'smtp'
        ? nodemailer.createTransport({
            host: entorno.SMTP_HOST,
            port: entorno.SMTP_PUERTO,
            secure: entorno.SMTP_SEGURO,
            ...(entorno.SMTP_USUARIO
              ? { auth: { user: entorno.SMTP_USUARIO, pass: entorno.SMTP_CONTRASENA } }
              : {}),
          })
        : null;
  }

  /** Construye una URL absoluta de la web. */
  urlWeb(ruta: string, parametros: Record<string, string> = {}): string {
    const url = new URL(ruta, this.entorno.WEB_ORIGEN);
    for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
    return url.toString();
  }

  async enviar(para: string, plantilla: NombrePlantilla, correo: CorreoRenderizado): Promise<void> {
    const proveedor = this.entorno.CORREO_PROVEEDOR;
    let estado = 'enviado';
    let error: string | null = null;
    try {
      if (this.transporte) {
        await this.transporte.sendMail({
          from: this.entorno.CORREO_REMITENTE,
          to: para,
          subject: correo.asunto,
          text: correo.texto,
          html: correo.html,
        });
      } else if (this.entorno.NODE_ENV !== 'test') {
        this.logger.log(`[sandbox] Para: ${para} · ${correo.asunto}\n${correo.texto}`);
      }
    } catch (e) {
      estado = 'fallido';
      error = e instanceof Error ? e.message.slice(0, 500) : 'Error desconocido';
      this.logger.error(`No se pudo enviar "${plantilla}" a ${para}: ${error}`);
    }
    await this.prisma.correoSaliente.create({
      data: {
        para,
        asunto: correo.asunto,
        plantilla,
        proveedor,
        estado,
        error,
        // Solo el sandbox guarda el cuerpo (contiene enlaces de un solo uso).
        texto: proveedor === 'sandbox' ? correo.texto : null,
      },
    });
  }
}
