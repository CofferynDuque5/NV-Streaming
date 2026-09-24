import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Automatizacion, EjecucionAutomatizacion, Prisma, PrismaClient } from '@nv/db';
import {
  type ActualizarAutomatizacionEntrada,
  AUTOMATIZACIONES,
  type AutomatizacionResumen,
  type EjecucionResumen,
  type EstadoCanales,
  type FuenteTasa,
  type NotificacionResumen,
  type Pagina,
  type PanelAutomatizaciones,
  PARAMETROS_AUTOMATIZACION,
  type PruebaTasa,
  TIPOS_AUTOMATIZACION,
  type TipoAutomatizacion,
} from '@nv/shared';
import type { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { enmascararDestino, esCorreo, normalizarTelefono } from '../avisos/destinos.js';
import { type CanalWhatsApp, PLANTILLAS_WHATSAPP, WHATSAPP } from '../avisos/whatsapp.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { LimitesService } from '../limites/limites.service.js';
import { ConfigAutomatizacionesService, interpretar } from './configuracion.service.js';
import { programaDe, proximaRanura } from './horario.js';
import { ErrorFuenteTasa } from './tasas/fuentes.js';
import { FuentesTasaService, TasaAutomaticaService } from './tasas/tasa-automatica.service.js';
import { LATIDO_VIGENTE_MS } from './trabajador.service.js';
import { TRABAJO } from './trabajos.js';
import { TrabajosService } from './trabajos.service.js';
import type { filtroNotificacionesSchema } from '@nv/shared';

const POR_PAGINA_EJECUCIONES = 20;
const POR_PAGINA_NOTIFICACIONES = 25;
const LIMITE_PRUEBAS = { maximo: 5, ventanaSegundos: 3600 };
const LIMITE_PRUEBA_TASA = { maximo: 10, ventanaSegundos: 3600 };
const LIMITE_EJECUTAR = { maximo: 20, ventanaSegundos: 3600 };

type FilaAutomatizacion = Automatizacion & {
  actualizadoPor: { id: string; nombre: string } | null;
};

export function ejecucionResumen(e: EjecucionAutomatizacion): EjecucionResumen {
  return {
    id: e.id,
    tipo: e.tipo as TipoAutomatizacion,
    estado: e.estado,
    disparo: e.disparo === 'manual' ? 'manual' : 'programada',
    procesados: e.procesados,
    omitidos: e.omitidos,
    errores: e.errores,
    resumen: e.resumen,
    iniciadaEn: iso(e.iniciadaEn)!,
    terminadaEn: iso(e.terminadaEn),
  };
}

const errorCampos = (campos: Record<string, string[]>) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Revisa los datos del formulario.', campos);

/** Panel de automatizaciones: configuración, ejecuciones, avisos enviados y pruebas de canal. */
@Injectable()
export class PanelAutomatizacionesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(WHATSAPP) private readonly whatsapp: CanalWhatsApp,
    @Inject(FuentesTasaService) private readonly fuentes: FuentesTasaService,
    @Inject(TasaAutomaticaService) private readonly tasa: TasaAutomaticaService,
  ) {}

  async panel(): Promise<PanelAutomatizaciones> {
    const filas = await this.config.todas();
    const ultimas = await this.prisma.ejecucionAutomatizacion.findMany({
      distinct: ['tipo'],
      orderBy: [{ tipo: 'asc' }, { iniciadaEn: 'desc' }],
    });
    const porTipo = new Map(filas.map((f) => [f.tipo, f]));
    const ahora = new Date();
    return {
      automatizaciones: TIPOS_AUTOMATIZACION.filter((t) => porTipo.has(t)).map((t) =>
        this.resumen(t, porTipo.get(t)!, ultimas.find((u) => u.tipo === t) ?? null, ahora),
      ),
      canales: await this.estadoCanales(),
    };
  }

  async estadoCanales(): Promise<EstadoCanales> {
    const latido = await this.prisma.latidoTrabajador.findFirst({
      orderBy: { ultimoLatidoEn: 'desc' },
    });
    return {
      correo: { proveedor: this.entorno.CORREO_PROVEEDOR },
      whatsapp: { proveedor: this.whatsapp.proveedor, listo: this.whatsapp.listo },
      fuentesTasa: this.fuentes.configuradas(),
      trabajador: {
        ultimoLatidoEn: iso(latido?.ultimoLatidoEn),
        activo: Boolean(latido && Date.now() - latido.ultimoLatidoEn.getTime() < LATIDO_VIGENTE_MS),
      },
    };
  }

  private resumen(
    tipo: TipoAutomatizacion,
    fila: FilaAutomatizacion,
    ultima: EjecucionAutomatizacion | null,
    ahora: Date,
  ): AutomatizacionResumen {
    const def = AUTOMATIZACIONES[tipo];
    const c = interpretar(tipo, fila);
    const programa = c.activa ? programaDe(tipo, c.parametros) : null;
    return {
      tipo,
      nombre: def.nombre,
      descripcion: def.descripcion,
      grupo: def.grupo,
      disparo: def.disparo,
      activa: c.activa,
      canales: c.canales,
      canalesPermitidos: [...def.canales],
      parametros: c.parametros as Record<string, unknown>,
      proximaEjecucionEn: programa ? proximaRanura(programa, ahora).toISOString() : null,
      ultimaEjecucion: ultima ? ejecucionResumen(ultima) : null,
      actualizadoPor: fila.actualizadoPor,
      actualizadoEn: iso(fila.actualizadoEn)!,
    };
  }

  async actualizar(
    auth: ContextoAuth,
    tipo: TipoAutomatizacion,
    e: ActualizarAutomatizacionEntrada,
    cliente: InfoCliente,
  ): Promise<AutomatizacionResumen> {
    const def = AUTOMATIZACIONES[tipo];
    const antes = await this.config.leer(tipo);
    if (e.canales) {
      const fuera = e.canales.filter((c) => !def.canales.includes(c));
      if (fuera.length) {
        throw errorCampos({
          canales: [
            def.canales.length === 1
              ? 'Esta automatización solo avisa por correo.'
              : `Canal no admitido: ${fuera.join(', ')}.`,
          ],
        });
      }
    }
    let parametros = antes.parametros as Record<string, unknown>;
    if (e.parametros) {
      const r = PARAMETROS_AUTOMATIZACION[tipo].safeParse({ ...parametros, ...e.parametros });
      if (!r.success) {
        const campos: Record<string, string[]> = {};
        for (const issue of r.error.issues) {
          const clave = ['parametros', ...issue.path.map(String)].join('.');
          (campos[clave] ??= []).push(issue.message);
        }
        throw errorCampos(campos);
      }
      parametros = r.data as Record<string, unknown>;
    }
    const despues = {
      activa: e.activa ?? antes.activa,
      canales: e.canales ?? antes.canales,
      parametros,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.automatizacion.update({
        where: { tipo },
        data: {
          activa: despues.activa,
          canales: despues.canales,
          parametros: despues.parametros as Prisma.InputJsonObject,
          actualizadoPorId: auth.usuario.id,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'automatizacion.actualizada',
          entidad: 'automatizacion',
          entidadId: tipo,
          antes: {
            activa: antes.activa,
            canales: antes.canales,
            parametros: antes.parametros as Prisma.InputJsonObject,
          },
          despues: despues as Prisma.InputJsonObject,
          cliente,
        },
        tx,
      );
    });
    const fila = await this.prisma.automatizacion.findUniqueOrThrow({
      where: { tipo },
      include: { actualizadoPor: { select: { id: true, nombre: true } } },
    });
    const ultima = await this.prisma.ejecucionAutomatizacion.findFirst({
      where: { tipo },
      orderBy: { iniciadaEn: 'desc' },
    });
    return this.resumen(tipo, fila, ultima, new Date());
  }

  /** "Ejecutar ahora": encola una ejecución manual inmediata. */
  async ejecutarAhora(
    auth: ContextoAuth,
    tipo: TipoAutomatizacion,
    cliente: InfoCliente,
  ): Promise<{ mensaje: string }> {
    if (AUTOMATIZACIONES[tipo].disparo !== 'programada') {
      throw new ErrorApp(
        409,
        'AUTOMATIZACION_POR_EVENTO',
        'Esta automatización se dispara sola cuando ocurre el cambio: no se ejecuta a mano.',
      );
    }
    await this.limites.consumir(`automatizacion:ejecutar:${auth.usuario.id}`, LIMITE_EJECUTAR);
    await this.config.leer(tipo);
    // Un doble clic en los mismos 30 segundos no encola dos ejecuciones.
    const ventana = Math.floor(Date.now() / 30_000);
    const nuevo = await this.trabajos.encolar({
      tipo: TRABAJO.ejecutarAutomatizacion,
      carga: { tipo, disparo: 'manual' },
      claveUnica: `manual:${tipo}:${ventana}`,
      maxIntentos: 1,
    });
    if (nuevo) {
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'automatizacion.ejecucion_manual',
        entidad: 'automatizacion',
        entidadId: tipo,
        cliente,
      });
    }
    const { trabajador } = await this.estadoCanales();
    return {
      mensaje: trabajador.activo
        ? 'La ejecución quedó en cola. Verás el resultado en el historial en unos segundos.'
        : 'La ejecución quedó en cola, pero el trabajador no está en marcha: correrá cuando arranque.',
    };
  }

  async ejecuciones(tipo: TipoAutomatizacion, pagina: number): Promise<Pagina<EjecucionResumen>> {
    const where = { tipo };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.ejecucionAutomatizacion.count({ where }),
      this.prisma.ejecucionAutomatizacion.findMany({
        where,
        orderBy: [{ iniciadaEn: 'desc' }, { id: 'asc' }],
        skip: (pagina - 1) * POR_PAGINA_EJECUCIONES,
        take: POR_PAGINA_EJECUCIONES,
      }),
    ]);
    return {
      elementos: filas.map(ejecucionResumen),
      total,
      pagina,
      porPagina: POR_PAGINA_EJECUCIONES,
    };
  }

  async notificaciones(
    f: z.output<typeof filtroNotificacionesSchema>,
  ): Promise<Pagina<NotificacionResumen>> {
    const where: Prisma.NotificacionWhereInput = {
      ...(f.canal ? { canal: f.canal } : {}),
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.automatizacion ? { automatizacion: f.automatizacion } : {}),
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.findMany({
        where,
        include: {
          cliente: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true } },
        },
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (f.pagina - 1) * POR_PAGINA_NOTIFICACIONES,
        take: POR_PAGINA_NOTIFICACIONES,
      }),
    ]);
    return {
      elementos: filas.map((n) => ({
        id: n.id,
        canal: n.canal,
        plantilla: n.plantilla,
        destino: enmascararDestino(n.destino),
        cliente: n.cliente,
        usuario: n.usuario,
        automatizacion: (TIPOS_AUTOMATIZACION as readonly string[]).includes(n.automatizacion ?? '')
          ? (n.automatizacion as TipoAutomatizacion)
          : null,
        estado: n.estado,
        motivo: n.motivo,
        error: n.error,
        creadoEn: iso(n.creadoEn)!,
        enviadaEn: iso(n.enviadaEn),
      })),
      total,
      pagina: f.pagina,
      porPagina: POR_PAGINA_NOTIFICACIONES,
    };
  }

  async probarTasa(auth: ContextoAuth, fuente?: FuenteTasa): Promise<PruebaTasa> {
    await this.limites.consumir(`tasa:probar:${auth.usuario.id}`, LIMITE_PRUEBA_TASA);
    const elegida = fuente ?? (await this.config.leer('tasa_automatica')).parametros.fuente;
    try {
      return await this.tasa.probar(elegida);
    } catch (e) {
      if (e instanceof ErrorFuenteTasa) {
        throw new ErrorApp(502, 'FUENTE_TASA_FALLIDA', e.message);
      }
      throw e;
    }
  }

  /** Mensaje de prueba por un canal. Queda en el registro de avisos a nombre de quien lo pide. */
  async enviarPrueba(
    auth: ContextoAuth,
    e: { canal: 'correo' | 'whatsapp'; destino: string },
    cliente: InfoCliente,
  ): Promise<{ mensaje: string }> {
    let destino: string;
    if (e.canal === 'correo') {
      if (!esCorreo(e.destino)) throw errorCampos({ destino: ['Escribe un correo válido.'] });
      destino = e.destino.trim().toLowerCase();
    } else {
      const tel = normalizarTelefono(e.destino);
      if (!tel) {
        throw errorCampos({
          destino: ['Escribe el teléfono en formato internacional, por ejemplo +58 414 1234567.'],
        });
      }
      if (!this.whatsapp.listo) {
        throw new ErrorApp(
          409,
          'WHATSAPP_DESACTIVADO',
          'WhatsApp no está configurado en el servidor (WHATSAPP_PROVEEDOR).',
        );
      }
      destino = tel;
    }
    await this.limites.consumir(`aviso:prueba:${auth.usuario.id}`, LIMITE_PRUEBAS);

    const id = randomUUID();
    const proveedor =
      e.canal === 'correo' ? this.entorno.CORREO_PROVEEDOR : this.whatsapp.proveedor;
    await this.prisma.notificacion.create({
      data: {
        id,
        canal: e.canal,
        plantilla: 'avisoPrueba',
        destino,
        usuarioId: auth.usuario.id,
        proveedor,
        claveUnica: `prueba:${id}`,
      },
    });
    let error: string | null = null;
    let referencia: string | null = null;
    if (e.canal === 'correo') {
      const r = await this.correo.enviar(
        destino,
        'avisoPrueba',
        Plantillas.avisoPrueba(auth.usuario.nombre),
      );
      error = r.enviado ? null : (r.error ?? 'No se pudo enviar el correo.');
    } else {
      const def = PLANTILLAS_WHATSAPP['avisoPrueba']!;
      try {
        referencia = (
          await this.whatsapp.enviar({
            telefono: destino,
            plantilla: def.nombre,
            idioma: def.idioma ?? this.entorno.WHATSAPP_IDIOMA,
            parametros: [],
          })
        ).referencia;
      } catch (err) {
        error = err instanceof Error ? err.message : 'No se pudo enviar el WhatsApp.';
      }
    }
    await this.prisma.notificacion.update({
      where: { id },
      data: {
        estado: error ? 'fallida' : 'enviada',
        error: error?.slice(0, 500) ?? null,
        referenciaExterna: referencia,
        enviadaEn: error ? null : new Date(),
      },
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'aviso.prueba',
      entidad: 'notificacion',
      entidadId: id,
      despues: { canal: e.canal, destino: enmascararDestino(destino), enviado: !error },
      cliente,
    });
    if (error) {
      throw new ErrorApp(502, 'ENVIO_FALLIDO', `No se pudo enviar el mensaje de prueba: ${error}`);
    }
    const donde = enmascararDestino(destino);
    return {
      mensaje:
        e.canal === 'correo'
          ? `Enviamos un correo de prueba a ${donde}.`
          : `Enviamos un WhatsApp de prueba a ${donde}.`,
    };
  }
}
