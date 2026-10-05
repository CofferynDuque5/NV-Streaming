import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type AdaptadorEntrega,
  type ConfigEntregaProveedor,
  type ConfigurarEntregaEntrada,
  type ConfiguracionProveedor,
  ESTADOS_ENTREGA,
  type EstadoEntrega,
  leerConfiguracionProveedor,
  type PruebaWebhook,
  type SecretoRotado,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { LimitesService } from '../limites/limites.service.js';
import { AdaptadoresEntrega } from './adaptadores/registro.js';
import { contextoSecretoWebhook, generarSecretoWebhook } from './firma.js';
import { ErrorDestinoNoPermitido, validarUrlWebhook } from './red-segura.js';

/** Pruebas de webhook por persona y hora (cada una llama a un servidor externo). */
export const LIMITE_PRUEBAS_WEBHOOK = { maximo: 20, ventanaSegundos: 3600 };

/**
 * Configuración de entrega de cada proveedor: adaptador, URL del webhook y
 * opciones (en `proveedores.configuracion`, sin secretos) y la clave de firma,
 * que se guarda cifrada y solo se muestra al rotarla.
 */
@Injectable()
export class ProveedoresEntregaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AdaptadoresEntrega) private readonly adaptadores: AdaptadoresEntrega,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  async obtener(id: string): Promise<ConfigEntregaProveedor> {
    const p = await this.prisma.proveedor.findUnique({
      where: { id },
      include: {
        servicios: {
          select: {
            nombre: true,
            planes: {
              select: { id: true, nombre: true, skuProveedor: true },
              orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
            },
          },
          orderBy: { nombre: 'asc' },
        },
      },
    });
    if (!p) throw Errores.noEncontrado('El proveedor');
    const grupos = await this.prisma.entrega.groupBy({
      by: ['estado'],
      where: { proveedorId: id },
      _count: { _all: true },
    });
    const contadores = Object.fromEntries(ESTADOS_ENTREGA.map((s) => [s, 0])) as Record<
      EstadoEntrega,
      number
    >;
    for (const g of grupos) contadores[g.estado] = g._count._all;
    const c = leerConfiguracionProveedor(p.configuracion);
    return {
      proveedor: { id: p.id, nombre: p.nombre, tipo: p.tipo, activo: p.activo },
      adaptador: p.adaptador as AdaptadorEntrega,
      webhookUrl: c.webhookUrl,
      tiempoLimiteSegundos: c.tiempoLimiteSegundos,
      incluirCorreo: c.incluirCorreo,
      entregarRenovaciones: c.entregarRenovaciones,
      instrucciones: c.instrucciones,
      tieneSecreto: Boolean(p.secretoWebhookCifrado),
      secretoRotadoEn: iso(p.secretoWebhookRotadoEn),
      planes: p.servicios.flatMap((s) => s.planes.map((pl) => ({ ...pl, servicio: s.nombre }))),
      contadores,
    };
  }

  async configurar(
    auth: ContextoAuth,
    id: string,
    e: ConfigurarEntregaEntrada,
    cliente: InfoCliente,
  ): Promise<ConfigEntregaProveedor> {
    if (e.webhookUrl) {
      try {
        validarUrlWebhook(e.webhookUrl, { permitirLocal: this.entorno.ENTREGAS_WEBHOOK_RED_LOCAL });
      } catch (err) {
        if (err instanceof ErrorDestinoNoPermitido) {
          throw new ErrorApp(400, 'DATOS_INVALIDOS', err.message, { webhookUrl: [err.message] });
        }
        throw err;
      }
    }
    const nueva: ConfiguracionProveedor = {
      webhookUrl: e.webhookUrl ?? null,
      tiempoLimiteSegundos: e.tiempoLimiteSegundos,
      incluirCorreo: e.incluirCorreo,
      entregarRenovaciones: e.entregarRenovaciones,
      instrucciones: e.instrucciones ?? null,
    };
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.proveedor.findUnique({ where: { id } });
      if (!antes) throw Errores.noEncontrado('El proveedor');
      await tx.proveedor.update({
        where: { id },
        data: { adaptador: e.adaptador, configuracion: nueva },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'proveedor.entrega_configurada',
          entidad: 'proveedor',
          entidadId: id,
          antes: {
            adaptador: antes.adaptador,
            ...leerConfiguracionProveedor(antes.configuracion),
          },
          despues: { adaptador: e.adaptador, ...nueva },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  /**
   * Genera una clave de firma nueva. La anterior deja de valer en el acto: el
   * proveedor debe cambiarla en su lado. Se muestra solo en esta respuesta.
   */
  async rotarSecreto(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<SecretoRotado> {
    const secreto = generarSecretoWebhook();
    const rotadoEn = new Date();
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.proveedor.findUnique({
        where: { id },
        select: { id: true, secretoWebhookCifrado: true },
      });
      if (!p) throw Errores.noEncontrado('El proveedor');
      await tx.proveedor.update({
        where: { id },
        data: {
          secretoWebhookCifrado: this.cifrador.cifrar(secreto, contextoSecretoWebhook(id)),
          secretoWebhookRotadoEn: rotadoEn,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'proveedor.secreto_rotado',
          entidad: 'proveedor',
          entidadId: id,
          despues: { habiaClave: Boolean(p.secretoWebhookCifrado) },
          cliente,
        },
        tx,
      );
    });
    return { secreto, rotadoEn: rotadoEn.toISOString() };
  }

  /** Envía un `ping` firmado a la URL configurada y cuenta cómo respondió. */
  async probar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<PruebaWebhook> {
    await this.limites.consumir(`probar_webhook:${auth.usuario.id}`, LIMITE_PRUEBAS_WEBHOOK);
    const p = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!p) throw Errores.noEncontrado('El proveedor');
    const configuracion = leerConfiguracionProveedor(p.configuracion);
    if (!configuracion.webhookUrl) {
      throw new ErrorApp(409, 'SIN_WEBHOOK', 'Guarda primero la URL del webhook del proveedor.');
    }
    if (!p.secretoWebhookCifrado) {
      throw new ErrorApp(409, 'SIN_SECRETO', 'Genera primero la clave de firma.');
    }
    const secreto = this.cifrador.descifrar(p.secretoWebhookCifrado, contextoSecretoWebhook(id));
    const r = await this.adaptadores.webhook.probar({ configuracion, secreto });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'proveedor.webhook_probado',
      entidad: 'proveedor',
      entidadId: id,
      despues: { ok: r.ok, estadoHttp: r.estadoHttp, duracionMs: r.duracionMs },
      cliente,
    });
    return r;
  }
}
