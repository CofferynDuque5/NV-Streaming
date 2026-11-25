import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Factura, PrismaClient, Suscripcion } from '@nv/db';
import { esTitular, formatearMonto, REGLAS_COBRO, tipoPlataforma } from '@nv/shared';
import { NotificacionesService, type ResultadoAviso } from '../../avisos/notificaciones.service.js';
import { numeroFactura } from '../../comun/formato.js';
import { PRISMA } from '../../comun/tokens.js';
import { CorreoService } from '../../correo/correo.service.js';
import { Plantillas } from '../../correo/plantillas.js';
import { SuscripcionesService } from '../../suscripciones/suscripciones.service.js';
import {
  type ConfigAutomatizacion,
  ConfigAutomatizacionesService,
} from '../configuracion.service.js';
import { DIA_MS, fechaLarga, inicioDiaCaracas } from '../horario.js';
import { mensajeError, plural, Recuento, type ResultadoTarea } from '../recuento.js';
import { TRABAJO } from '../trabajos.js';
import { TrabajosService } from '../trabajos.service.js';

/**
 * Suscripciones a las que NV avisa y factura: las que compró el propio cliente,
 * tenga o no un revendedor. Las que activó un revendedor (revendedorId) las
 * cobra y avisa él.
 */
const CANAL_DIRECTO = {
  revendedorId: null,
  cliente: { estado: 'activo' },
} as const;

const INCLUIR_PLAN = { plan: { include: { servicio: { select: { nombre: true } } } } } as const;

type AvisoSuscripcion = 'aviso_gracia' | 'aviso_suspension' | 'aviso_recuperacion';
const ESTADO_ESPERADO: Record<AvisoSuscripcion, Suscripcion['estado']> = {
  aviso_gracia: 'en_gracia',
  aviso_suspension: 'suspendida',
  aviso_recuperacion: 'activa',
};

const nombreServicio = (s: { plan: { nombre: string; servicio: { nombre: string } } }) =>
  `${s.plan.servicio.nombre} · ${s.plan.nombre}`;

/** Automatizaciones dirigidas a los clientes: recordatorios, renovaciones y avisos de estado. */
@Injectable()
export class TareasClientesService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.avisoSuscripcion, async (carga) => {
      await this.avisoSuscripcion(
        String(carga['automatizacion']) as AvisoSuscripcion,
        String(carga['suscripcionId']),
      );
    });
    this.trabajos.registrar(TRABAJO.avisoDatosAcceso, async (carga, trabajo) => {
      await this.avisoDatosAcceso(
        String(carga['cuentaId']),
        typeof carga['perfilId'] === 'string' ? carga['perfilId'] : null,
        Array.isArray(carga['cambios']) ? carga['cambios'].map(String) : [],
        trabajo.id,
      );
    });
  }

  /** Recordatorio N días antes del vencimiento (día del calendario de Venezuela). */
  async recordatorios(
    config: ConfigAutomatizacion<'recordatorio_vencimiento'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    for (const dias of config.parametros.diasAntes) {
      const subs = await this.prisma.suscripcion.findMany({
        where: {
          ...CANAL_DIRECTO,
          estado: 'activa',
          cancelarAlVencer: false,
          plan: { tipo: 'suscripcion' },
          venceEn: { gte: inicioDiaCaracas(ahora, dias), lt: inicioDiaCaracas(ahora, dias + 1) },
        },
        include: {
          ...INCLUIR_PLAN,
          facturas: { where: { estado: 'emitida' }, select: { id: true }, take: 1 },
        },
        orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
        take: 2000,
      });
      for (const s of subs) {
        try {
          const venceEn = s.venceEn!;
          const factura = s.facturas[0];
          const url = this.correo.urlWeb(factura ? `/cuenta/facturas/${factura.id}` : '/cuenta');
          const servicio = nombreServicio(s);
          r.aviso(
            await this.avisos.avisar({
              plantilla: 'recordatorioVencimiento',
              destinatario: { clienteId: s.clienteId },
              claveUnica: `recordatorio:${s.id}:${venceEn.toISOString()}:${dias}`,
              automatizacion: 'recordatorio_vencimiento',
              canales: config.canales,
              entidad: { tipo: 'suscripcion', id: s.id },
              contenido: (nombre) => ({
                correo: Plantillas.recordatorioVencimiento(
                  nombre,
                  servicio,
                  fechaLarga(venceEn),
                  dias,
                  url,
                  Boolean(factura),
                ),
                whatsapp: [nombre, servicio, fechaLarga(venceEn), url],
              }),
            }),
          );
        } catch (e) {
          r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
        }
      }
    }
    return r.resultado(resumenAvisos(r, 'recordatorio enviado', 'recordatorios enviados'));
  }

  /**
   * Resumen diario: a cada cliente (lo que compró él) y a cada revendedor (lo de
   * sus clientes), cuántas suscripciones le vencen en los próximos días o están
   * en gracia, con la lista y el enlace a sus accesos. Una vez al día; si no
   * tiene ninguna, no se envía nada.
   */
  async resumenVencimientos(
    config: ConfigAutomatizacion<'resumen_vencimientos'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    const dias = config.parametros.diasAntes;
    const hoy = inicioDiaCaracas(ahora);
    const subs = await this.prisma.suscripcion.findMany({
      where: {
        estado: { in: ['activa', 'en_gracia'] },
        cancelarAlVencer: false,
        plan: { tipo: 'suscripcion' },
        cliente: { estado: 'activo' },
        venceEn: { lt: inicioDiaCaracas(ahora, dias + 1) },
      },
      select: {
        id: true,
        clienteId: true,
        revendedorId: true,
        venceEn: true,
        estado: true,
        cliente: { select: { nombre: true } },
        plan: { select: { nombre: true, servicio: { select: { nombre: true } } } },
      },
      orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
      take: 5000,
    });
    const linea = (s: (typeof subs)[number], conCliente: boolean) => {
      const v = s.venceEn!;
      const d = Math.round((inicioDiaCaracas(v).getTime() - hoy.getTime()) / DIA_MS);
      const cuando =
        d < 0
          ? `venció el ${fechaLarga(v)}`
          : d === 0
            ? 'vence hoy'
            : d === 1
              ? 'vence mañana'
              : `vence el ${fechaLarga(v)}`;
      return `${conCliente ? `${s.cliente.nombre}: ` : ''}${nombreServicio(s)}, ${cuando}`;
    };
    const directos = new Map<string, typeof subs>();
    const deRevendedor = new Map<string, typeof subs>();
    for (const s of subs) {
      const m = s.revendedorId ? deRevendedor : directos;
      const k = s.revendedorId ?? s.clienteId;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    const dia = hoy.toISOString().slice(0, 10);
    const urlCliente = this.correo.urlWeb('/cuenta/accesos');
    for (const [clienteId, lista] of directos) {
      try {
        r.aviso(
          await this.avisos.avisar({
            plantilla: 'resumenVencimientos',
            destinatario: { clienteId },
            claveUnica: `resumen_vencimientos:cliente:${clienteId}:${dia}`,
            automatizacion: 'resumen_vencimientos',
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.resumenVencimientos(
                nombre,
                lista.map((s) => linea(s, false)),
                lista.length,
                dias,
                urlCliente,
                false,
              ),
            }),
          }),
        );
      } catch (e) {
        r.error(`Cliente ${clienteId}: ${mensajeError(e)}`);
      }
    }
    if (deRevendedor.size) {
      const revendedores = await this.prisma.revendedor.findMany({
        where: { id: { in: [...deRevendedor.keys()] } },
        select: { id: true, usuarioId: true },
      });
      const urlRevendedor = this.correo.urlWeb('/revendedor/accesos');
      for (const rv of revendedores) {
        const lista = deRevendedor.get(rv.id) ?? [];
        try {
          r.aviso(
            await this.avisos.avisar({
              plantilla: 'resumenVencimientos',
              destinatario: { usuarioId: rv.usuarioId },
              claveUnica: `resumen_vencimientos:revendedor:${rv.id}:${dia}`,
              automatizacion: 'resumen_vencimientos',
              canales: ['correo'],
              contenido: (nombre) => ({
                correo: Plantillas.resumenVencimientos(
                  nombre,
                  lista.map((s) => linea(s, true)),
                  lista.length,
                  dias,
                  urlRevendedor,
                  true,
                ),
              }),
            }),
          );
        } catch (e) {
          r.error(`Revendedor ${rv.id}: ${mensajeError(e)}`);
        }
      }
    }
    return r.resultado(resumenAvisos(r, 'resumen enviado', 'resúmenes enviados'));
  }

  /**
   * Emite la factura de renovación de las suscripciones que vencen en los
   * próximos días y no tienen una abierta, con las mismas reglas que una
   * renovación manual, y envía las instrucciones de pago. Repetirla no emite
   * ni avisa dos veces.
   */
  async renovaciones(
    config: ConfigAutomatizacion<'factura_renovacion'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    let emitidas = 0;
    const subs = await this.prisma.suscripcion.findMany({
      where: {
        ...CANAL_DIRECTO,
        estado: 'activa',
        cancelarAlVencer: false,
        plan: { renovable: true, activo: true },
        venceEn: { lt: inicioDiaCaracas(ahora, config.parametros.diasAntes + 1) },
      },
      include: INCLUIR_PLAN,
      orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    for (const s of subs) {
      try {
        const { factura, nueva } = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${s.id}::uuid FOR UPDATE`;
          const actual = await tx.suscripcion.findUniqueOrThrow({ where: { id: s.id } });
          if (actual.estado !== 'activa' || actual.cancelarAlVencer) {
            return { factura: null, nueva: false };
          }
          const abierta = await tx.factura.findFirst({
            where: { suscripcionId: s.id, estado: 'emitida' },
          });
          if (abierta) {
            // Solo se avisa de las que emitió el sistema (p. ej. si el aviso no llegó a salir).
            const propia = abierta.creadoPorId === null && abierta.concepto === 'renovacion';
            return { factura: propia ? abierta : null, nueva: false };
          }
          const f = await this.suscripciones.facturarRenovacion(tx, actual, actual.moneda, null);
          return { factura: f, nueva: true };
        });
        if (nueva) emitidas += 1;
        if (!factura || factura.estado !== 'emitida') {
          if (nueva) r.procesados += 1;
          else r.omitidos += 1;
          continue;
        }
        const aviso = await this.avisarFactura(
          s.clienteId,
          nombreServicio(s),
          factura,
          config.canales,
        );
        if (aviso.fallidas > 0) r.errores += 1;
        else if (nueva || aviso.enviadas > 0) r.procesados += 1;
        else r.omitidos += 1;
      } catch (e) {
        r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
      }
    }
    const partes = [plural(emitidas, 'factura emitida', 'facturas emitidas')];
    if (r.omitidos) partes.push(plural(r.omitidos, 'omitida', 'omitidas'));
    if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
    return r.resultado(`${partes.join(', ')}.`);
  }

  private async avisarFactura(
    clienteId: string,
    servicio: string,
    f: Factura,
    canales: ConfigAutomatizacion['canales'],
  ): Promise<ResultadoAviso> {
    const metodos = await this.prisma.metodoCobro.findMany({
      where: { moneda: f.moneda, activo: true, tipo: 'manual' },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      select: { nombre: true, instrucciones: true },
    });
    const url = this.correo.urlWeb(`/cuenta/facturas/${f.id}`);
    const numero = numeroFactura(f.numero);
    const total = formatearMonto(f.total.toFixed(2), f.moneda);
    return this.avisos.avisar({
      plantilla: 'facturaRenovacion',
      destinatario: { clienteId },
      claveUnica: `factura_renovacion:${f.id}`,
      automatizacion: 'factura_renovacion',
      canales,
      entidad: { tipo: 'factura', id: f.id },
      contenido: (nombre) => ({
        correo: Plantillas.facturaRenovacion(
          nombre,
          servicio,
          numero,
          total,
          fechaLarga(f.venceEn),
          metodos,
          url,
        ),
        whatsapp: [nombre, servicio, numero, total, url],
      }),
    });
  }

  /** Aviso por un cambio de estado (gracia, suspensión o reactivación). Lo encola la transición. */
  async avisoSuscripcion(
    tipo: AvisoSuscripcion,
    suscripcionId: string,
  ): Promise<ResultadoAviso | null> {
    if (!(tipo in ESTADO_ESPERADO)) throw new Error(`Aviso de suscripción desconocido: ${tipo}`);
    const config = await this.config.leer(tipo);
    if (!config.activa) return null;
    const s = await this.prisma.suscripcion.findUnique({
      where: { id: suscripcionId },
      include: {
        ...INCLUIR_PLAN,
        facturas: {
          where: { estado: 'emitida' },
          select: { id: true },
          orderBy: { creadoEn: 'desc' },
          take: 1,
        },
      },
    });
    // Si el estado ya cambió (p. ej. pagó antes de que saliera el aviso), no se avisa.
    if (!s || s.estado !== ESTADO_ESPERADO[tipo] || !s.venceEn) return null;
    const venceEn = s.venceEn;
    const factura = s.facturas[0];
    const url = this.correo.urlWeb(
      tipo !== 'aviso_recuperacion' && factura ? `/cuenta/facturas/${factura.id}` : '/cuenta',
    );
    const servicio = nombreServicio(s);
    const suspension = new Date(venceEn.getTime() + REGLAS_COBRO.diasGracia * DIA_MS);
    const r = await this.avisos.avisar({
      plantilla:
        tipo === 'aviso_gracia'
          ? 'avisoGracia'
          : tipo === 'aviso_suspension'
            ? 'avisoSuspension'
            : 'avisoRecuperacion',
      destinatario: { clienteId: s.clienteId },
      // Un aviso por estado y periodo: aunque el trabajo se repita, no sale dos veces.
      claveUnica: `${tipo}:${s.id}:${venceEn.toISOString()}`,
      automatizacion: tipo,
      canales: config.canales,
      entidad: { tipo: 'suscripcion', id: s.id },
      contenido: (nombre) =>
        tipo === 'aviso_gracia'
          ? {
              correo: Plantillas.avisoGracia(nombre, servicio, fechaLarga(suspension), url),
              whatsapp: [nombre, servicio, fechaLarga(suspension), url],
            }
          : tipo === 'aviso_suspension'
            ? {
                correo: Plantillas.avisoSuspension(nombre, servicio, url),
                whatsapp: [nombre, servicio, url],
              }
            : {
                correo: Plantillas.avisoRecuperacion(nombre, servicio, fechaLarga(venceEn), url),
                whatsapp: [nombre, servicio, fechaLarga(venceEn)],
              },
    });
    await this.prisma.automatizacion.update({
      where: { tipo },
      data: { ultimaEjecucionEn: new Date() },
    });
    return r;
  }

  /**
   * Aviso de datos de acceso nuevos. Si cambió la cuenta (correo o clave), va a
   * todos los que la usan con sus datos (no a los miembros de un plan familiar
   * que entran con su propio correo); si cambió un perfil (PIN o datos del
   * miembro), solo a quien lo tiene. Nunca lleva la clave ni el PIN: el cliente
   * los ve en «Mis accesos». Los clientes de un revendedor no reciben el aviso
   * (les avisa él): se le manda uno al revendedor con sus nombres.
   */
  async avisoDatosAcceso(
    cuentaId: string,
    perfilId: string | null,
    cambios: string[],
    claveTrabajo: string,
  ): Promise<Recuento> {
    const r = new Recuento();
    const config = await this.config.leer('aviso_datos_acceso');
    if (!config.activa || !cambios.length) return r;
    const cuenta = await this.prisma.cuentaServicio.findUnique({
      where: { id: cuentaId },
      select: {
        modo: true,
        servicio: { select: { nombre: true } },
        perfiles: {
          where: {
            estado: 'asignado',
            ...(perfilId ? { id: perfilId } : {}),
            suscripcion: { estado: { in: ['activa', 'en_gracia'] } },
          },
          select: {
            id: true,
            numero: true,
            usuarioMiembroCifrado: true,
            suscripcion: {
              select: {
                id: true,
                clienteId: true,
                revendedorId: true,
                cliente: { select: { nombre: true } },
                plan: { select: { nombre: true, servicio: { select: { nombre: true } } } },
              },
            },
          },
        },
      },
    });
    if (!cuenta) return r;
    const tipo = tipoPlataforma(cuenta.servicio.nombre);
    const deCuenta = cambios.some((c) => c === 'correo' || c === 'clave');
    const porRevendedor = new Map<string, string[]>();
    for (const p of cuenta.perfiles) {
      const s = p.suscripcion;
      if (!s) continue;
      const miembroPropio = Boolean(p.usuarioMiembroCifrado) && !esTitular(tipo, p.numero);
      // Un miembro con su propio correo no usa el correo ni la clave de la cuenta.
      if (deCuenta && !perfilId && miembroPropio) {
        r.omitidos += 1;
        continue;
      }
      // El PIN y el nombre del perfil solo cuentan en las plataformas por perfiles.
      if (cambios.every((c) => c === 'pin' || c === 'nombre') && tipo !== 'perfiles') {
        r.omitidos += 1;
        continue;
      }
      if (s.revendedorId) {
        const nombres = porRevendedor.get(s.revendedorId) ?? [];
        nombres.push(s.cliente.nombre);
        porRevendedor.set(s.revendedorId, nombres);
        continue;
      }
      try {
        const servicio = nombreServicio(s);
        const que = textoCambios(cambios, tipo);
        const url = this.correo.urlWeb('/cuenta/accesos');
        r.aviso(
          await this.avisos.avisar({
            plantilla: 'datosAccesoActualizados',
            destinatario: { clienteId: s.clienteId },
            claveUnica: `datos_acceso:${claveTrabajo}:${s.id}`,
            automatizacion: 'aviso_datos_acceso',
            canales: config.canales,
            entidad: { tipo: 'suscripcion', id: s.id },
            contenido: (nombre) => ({
              correo: Plantillas.datosAccesoActualizados(nombre, servicio, que, url),
              whatsapp: [nombre, servicio, que, url],
            }),
          }),
        );
      } catch (e) {
        r.error(`Suscripción ${s.id}: ${mensajeError(e)}`);
      }
    }
    if (porRevendedor.size) {
      const revendedores = await this.prisma.revendedor.findMany({
        where: { id: { in: [...porRevendedor.keys()] } },
        select: { id: true, usuarioId: true },
      });
      for (const rv of revendedores) {
        const nombres = porRevendedor.get(rv.id) ?? [];
        try {
          const que = textoCambios(cambios, tipo);
          const url = this.correo.urlWeb('/revendedor/accesos');
          const servicio = cuenta.servicio.nombre;
          r.aviso(
            await this.avisos.avisar({
              plantilla: 'datosAccesoRevendedor',
              destinatario: { usuarioId: rv.usuarioId },
              claveUnica: `datos_acceso:${claveTrabajo}:revendedor:${rv.id}`,
              automatizacion: 'aviso_datos_acceso',
              canales: ['correo'],
              entidad: { tipo: 'cuenta_servicio', id: cuentaId },
              contenido: (nombre) => ({
                correo: Plantillas.datosAccesoRevendedor(
                  nombre,
                  servicio,
                  que,
                  nombres.slice(0, 20).join(', ') + (nombres.length > 20 ? '…' : ''),
                  url,
                ),
              }),
            }),
          );
        } catch (e) {
          r.error(`Revendedor ${rv.id}: ${mensajeError(e)}`);
        }
      }
    }
    await this.prisma.automatizacion.update({
      where: { tipo: 'aviso_datos_acceso' },
      data: { ultimaEjecucionEn: new Date() },
    });
    return r;
  }
}

/** Lo que cambió, en palabras del cliente. */
function textoCambios(cambios: string[], tipo: string): string {
  const partes: string[] = [];
  if (cambios.includes('movido')) {
    return 'el acceso (se pasó a otra cuenta, con correo, clave y perfil nuevos)';
  }
  if (cambios.includes('nombre')) partes.push('el nombre de tu perfil');
  if (cambios.includes('correo') || cambios.includes('correo_miembro')) partes.push('el correo');
  if (cambios.includes('clave') || cambios.includes('clave_miembro')) partes.push('la clave');
  if (cambios.includes('pin') && tipo === 'perfiles') partes.push('el PIN de tu perfil');
  if (!partes.length) return 'los datos de acceso';
  if (partes.length === 1) return partes[0]!;
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)!}`;
}

export function resumenAvisos(r: Recuento, uno: string, varios: string): string {
  const partes = [plural(r.procesados, uno, varios)];
  if (r.omitidos) partes.push(plural(r.omitidos, 'omitido', 'omitidos'));
  if (r.errores) partes.push(plural(r.errores, 'con error', 'con error'));
  return `${partes.join(', ')}.`;
}
