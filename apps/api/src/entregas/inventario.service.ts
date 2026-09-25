import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import {
  type AdaptadorEntrega,
  type InventarioDetalle,
  type InventarioPlan,
  leerCodigos,
  MAX_CODIGOS_POR_LOTE,
  normalizarCodigo,
  type ResultadoLote,
  type SubirLoteEntrada,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ConfigAutomatizacion } from '../automatizaciones/configuracion.service.js';
import { EjecutorAutomatizacionesService } from '../automatizaciones/ejecutor.service.js';
import { fechaCaracas } from '../automatizaciones/horario.js';
import {
  equipoConPermiso,
  mensajeError,
  plural,
  Recuento,
  type ResultadoTarea,
} from '../automatizaciones/recuento.js';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { CONTEXTO_HUELLA_CODIGO, contextoCodigo } from './adaptadores/codigos.js';
import { codigoResumen, huellaVisible } from './presentacion.js';

type Tx = Prisma.TransactionClient;

const POR_PAGINA_CODIGOS = 50;

interface Conteo {
  plan_id: string;
  disponibles: bigint;
  vencidos: bigint;
  entregados: bigint;
  anulados: bigint;
}

const INCLUIR_PLAN = {
  servicio: {
    select: {
      nombre: true,
      proveedor: { select: { id: true, nombre: true, adaptador: true } },
    },
  },
} as const satisfies Prisma.PlanInclude;

type PlanConProveedor = Prisma.PlanGetPayload<{ include: typeof INCLUIR_PLAN }>;

/** Fin del día indicado en Venezuela (UTC−4). */
const finDelDiaCaracas = (dia: string) => new Date(`${dia}T23:59:59.999-04:00`);

/**
 * Inventario de códigos (tarjetas, códigos o activaciones que NV compra como
 * distribuidor oficial). Los códigos se guardan cifrados, uno por fila, con su
 * huella HMAC para rechazar repetidos sin descifrar. Nunca se devuelven ni se
 * registran: el panel solo muestra el inicio de la huella.
 */
@Injectable()
export class InventarioService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(EjecutorAutomatizacionesService)
    private readonly ejecutor: EjecutorAutomatizacionesService,
  ) {}

  onModuleInit(): void {
    this.ejecutor.registrarTarea('stock_bajo_codigos', (config, ahora) =>
      this.stockBajo(config as ConfigAutomatizacion<'stock_bajo_codigos'>, ahora),
    );
  }

  /** Huella para detectar repetidos (sobre la forma normalizada del código). */
  huella(codigo: string): string {
    return this.cifrador.huella(normalizarCodigo(codigo), CONTEXTO_HUELLA_CODIGO);
  }

  /** Planes con inventario: los de proveedores con adaptador de códigos y los que ya tienen códigos. */
  async resumen(): Promise<InventarioPlan[]> {
    const conteos = await this.conteos();
    const planes = await this.prisma.plan.findMany({
      where: {
        OR: [
          { servicio: { proveedor: { adaptador: 'codigos' } } },
          { id: { in: [...conteos.keys()] } },
        ],
      },
      include: INCLUIR_PLAN,
      orderBy: [{ servicio: { nombre: 'asc' } }, { orden: 'asc' }, { nombre: 'asc' }],
    });
    const pendientes = await this.pendientesPorPlan(planes.map((p) => p.id));
    return planes.map((p) => this.inventarioPlan(p, conteos.get(p.id), pendientes.get(p.id) ?? 0));
  }

  async detalle(
    planId: string,
    filtro: { pagina: number; estado?: string | undefined },
  ): Promise<InventarioDetalle> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: INCLUIR_PLAN,
    });
    if (!plan) throw Errores.noEncontrado('El plan');
    const [conteos, pendientes] = await Promise.all([
      this.conteos(planId),
      this.pendientesPorPlan([planId]),
    ]);
    const where: Prisma.CodigoInventarioWhereInput = {
      planId,
      ...(filtro.estado &&
      ['disponible', 'reservado', 'entregado', 'anulado'].includes(filtro.estado)
        ? { estado: filtro.estado as 'disponible' }
        : {}),
    };
    const [lotes, disponiblesPorLote, total, codigos] = await Promise.all([
      this.prisma.loteCodigos.findMany({
        where: { planId },
        include: { subidoPor: { select: { id: true, nombre: true } } },
        orderBy: { creadoEn: 'desc' },
        take: 50,
      }),
      this.prisma.codigoInventario.groupBy({
        by: ['loteId'],
        where: { planId, estado: 'disponible' },
        _count: { _all: true },
      }),
      this.prisma.codigoInventario.count({ where }),
      this.prisma.codigoInventario.findMany({
        where,
        include: { lote: { select: { id: true, nombre: true } } },
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * POR_PAGINA_CODIGOS,
        take: POR_PAGINA_CODIGOS,
      }),
    ]);
    const libres = new Map(disponiblesPorLote.map((g) => [g.loteId, g._count._all]));
    return {
      ...this.inventarioPlan(plan, conteos.get(planId), pendientes.get(planId) ?? 0),
      lotes: lotes.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        cantidad: l.cantidad,
        repetidos: l.repetidos,
        disponibles: libres.get(l.id) ?? 0,
        venceEn: iso(l.venceEn),
        subidoPor: l.subidoPor,
        creadoEn: iso(l.creadoEn)!,
      })),
      codigos: {
        elementos: codigos.map(codigoResumen),
        total,
        pagina: filtro.pagina,
        porPagina: POR_PAGINA_CODIGOS,
      },
    };
  }

  /**
   * Sube un lote: descarta repetidos (en el archivo y contra todo el
   * inventario), cifra cada código y reintenta las entregas del plan que
   * esperaban códigos. La respuesta cuenta, pero nunca repite, los códigos.
   */
  async subirLote(
    auth: ContextoAuth,
    planId: string,
    entrada: SubirLoteEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoLote> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: INCLUIR_PLAN,
    });
    if (!plan) throw Errores.noEncontrado('El plan');
    const leidos = leerCodigos(entrada.texto);
    if (leidos.excedeMaximo) {
      throw new ErrorApp(
        400,
        'LOTE_DEMASIADO_GRANDE',
        `Un lote admite hasta ${MAX_CODIGOS_POR_LOTE} códigos y este trae ${leidos.codigos.length}. Divídelo en varios.`,
      );
    }
    if (leidos.codigos.length === 0) {
      throw new ErrorApp(
        400,
        'LOTE_VACIO',
        leidos.invalidos.length
          ? `No hay códigos válidos: ${plural(leidos.invalidos.length, 'línea no válida', 'líneas no válidas')} (la primera es la ${leidos.invalidos[0]!.linea}: ${leidos.invalidos[0]!.motivo.toLowerCase()})`
          : 'No encontramos códigos en el texto. Pon uno por línea.',
        { texto: ['No hay códigos válidos.'] },
      );
    }
    const ahora = new Date();
    const venceEn = entrada.venceEn ? finDelDiaCaracas(entrada.venceEn) : null;
    if (venceEn && venceEn <= ahora) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'La fecha de vencimiento ya pasó.', {
        venceEn: ['La fecha de vencimiento ya pasó.'],
      });
    }
    const filas = leidos.codigos.map((codigo) => {
      const id = randomUUID();
      return {
        id,
        planId,
        codigoCifrado: this.cifrador.cifrar(codigo, contextoCodigo(id)),
        huella: this.huella(codigo),
        venceEn,
      };
    });

    const resultado = await this.prisma.$transaction(
      async (tx) => {
        const lote = await tx.loteCodigos.create({
          data: {
            planId,
            nombre: entrada.nombre,
            subidoPorId: auth.usuario.id,
            cantidad: 0,
            venceEn,
          },
        });
        // ON CONFLICT DO NOTHING sobre la huella: los ya existentes se cuentan, no abortan.
        const creados = await tx.codigoInventario.createMany({
          data: filas.map((f) => ({ ...f, loteId: lote.id })),
          skipDuplicates: true,
        });
        const anadidos = creados.count;
        const yaExistentes = filas.length - anadidos;
        if (anadidos === 0) {
          throw new ErrorApp(
            409,
            'LOTE_REPETIDO',
            `Los ${plural(filas.length, 'código ya estaba', 'códigos ya estaban')} en el inventario: no se añadió nada.`,
          );
        }
        const actualizado = await tx.loteCodigos.update({
          where: { id: lote.id },
          data: { cantidad: anadidos, repetidos: leidos.repetidos + yaExistentes },
          include: { subidoPor: { select: { id: true, nombre: true } } },
        });
        const reintentadas = await this.reintentarSinStock(tx, planId, anadidos, lote.id);
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'inventario.lote_subido',
            entidad: 'lote_codigos',
            entidadId: lote.id,
            despues: {
              planId,
              plan: plan.nombre,
              nombre: entrada.nombre,
              anadidos,
              repetidosEnArchivo: leidos.repetidos,
              yaExistentes,
              invalidos: leidos.invalidos.length,
              venceEn: iso(venceEn),
              entregasReintentadas: reintentadas,
            },
            cliente,
          },
          tx,
        );
        return { lote: actualizado, anadidos, yaExistentes, reintentadas };
      },
      { timeout: 60_000 },
    );
    return {
      lote: {
        id: resultado.lote.id,
        nombre: resultado.lote.nombre,
        cantidad: resultado.lote.cantidad,
        repetidos: resultado.lote.repetidos,
        disponibles: resultado.anadidos,
        venceEn: iso(resultado.lote.venceEn),
        subidoPor: resultado.lote.subidoPor,
        creadoEn: iso(resultado.lote.creadoEn)!,
      },
      anadidos: resultado.anadidos,
      repetidosEnArchivo: leidos.repetidos,
      yaExistentes: resultado.yaExistentes,
      invalidos: leidos.invalidos,
      entregasReintentadas: resultado.reintentadas,
    };
  }

  /** Encola ya las entregas del plan que esperaban códigos (las más antiguas primero). */
  private async reintentarSinStock(
    tx: Tx,
    planId: string,
    maximo: number,
    loteId: string,
  ): Promise<number> {
    const esperando = await tx.entrega.findMany({
      where: { planId, estado: 'pendiente', adaptador: 'codigos' },
      select: { id: true },
      orderBy: { creadoEn: 'asc' },
      take: maximo,
    });
    for (const e of esperando) {
      await encolarTrabajo(tx, {
        tipo: TRABAJO.procesarEntrega,
        carga: { entregaId: e.id },
        claveUnica: `entrega:${e.id}:lote:${loteId}`,
        maxIntentos: 3,
      });
    }
    return esperando.length;
  }

  /** Anula un código disponible (p. ej. el distribuidor lo invalidó). */
  async anularCodigo(
    auth: ContextoAuth,
    id: string,
    motivo: string,
    cliente: InfoCliente,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM codigos_inventario WHERE id = ${id}::uuid FOR UPDATE`;
      if (filas.length === 0) throw Errores.noEncontrado('El código');
      const c = await tx.codigoInventario.findUniqueOrThrow({ where: { id } });
      if (c.estado !== 'disponible') {
        throw new ErrorApp(
          409,
          'CODIGO_NO_DISPONIBLE',
          c.estado === 'entregado'
            ? 'Este código ya se entregó a un cliente: anula o revoca la entrega en su lugar.'
            : 'Este código ya está anulado.',
        );
      }
      await tx.codigoInventario.update({
        where: { id },
        data: {
          estado: 'anulado',
          anuladoEn: new Date(),
          anuladoPorId: auth.usuario.id,
          motivoAnulacion: motivo,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'inventario.codigo_anulado',
          entidad: 'codigo_inventario',
          entidadId: id,
          antes: { estado: c.estado, huella: huellaVisible(c.huella) },
          despues: { estado: 'anulado', motivo },
          cliente,
        },
        tx,
      );
    });
  }

  /** Automatización «Pocos códigos en inventario»: resumen diario al equipo de inventario. */
  async stockBajo(
    config: ConfigAutomatizacion<'stock_bajo_codigos'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    const umbral = config.parametros.umbral;
    const inventario = await this.resumen();
    const bajos = inventario.filter(
      (p) =>
        p.proveedor.adaptador === 'codigos' &&
        p.plan.activo &&
        (p.disponibles < umbral || p.pendientes > 0),
    );
    if (bajos.length === 0) {
      return r.resultado(
        `Todos los planes con códigos tienen al menos ${plural(umbral, 'código', 'códigos')}.`,
      );
    }
    const lineas = bajos.map(
      (p) =>
        `${p.plan.servicio} · ${p.plan.nombre}: ${plural(p.disponibles, 'disponible', 'disponibles')}${p.pendientes ? `, ${plural(p.pendientes, 'entrega esperando', 'entregas esperando')}` : ''}`,
    );
    const url = this.correo.urlWeb('/admin/inventario');
    for (const u of await equipoConPermiso(this.prisma, 'inventario.gestionar')) {
      try {
        r.aviso(
          await this.avisos.avisar({
            plantilla: 'stockBajoCodigos',
            destinatario: { usuarioId: u.id },
            claveUnica: `stock_bajo:${fechaCaracas(ahora)}:${u.id}`,
            automatizacion: 'stock_bajo_codigos',
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.stockBajoCodigos(nombre, umbral, lineas, url),
            }),
          }),
        );
      } catch (e) {
        r.error(`Usuario ${u.id}: ${mensajeError(e)}`);
      }
    }
    return r.resultado(
      `${plural(bajos.length, 'plan con pocos códigos', 'planes con pocos códigos')}; ${plural(r.procesados, 'aviso enviado', 'avisos enviados')}${r.omitidos ? `, ${plural(r.omitidos, 'omitido', 'omitidos')}` : ''}.`,
    );
  }

  // ── Ayudas ─────────────────────────────────────────────────────────────

  private async conteos(planId?: string): Promise<Map<string, Conteo>> {
    const filas = planId
      ? await this.prisma.$queryRaw<Conteo[]>`
          SELECT plan_id::text AS plan_id,
            count(*) FILTER (WHERE estado = 'disponible' AND (vence_en IS NULL OR vence_en > now())) AS disponibles,
            count(*) FILTER (WHERE estado = 'disponible' AND vence_en <= now()) AS vencidos,
            count(*) FILTER (WHERE estado = 'entregado') AS entregados,
            count(*) FILTER (WHERE estado = 'anulado') AS anulados
          FROM codigos_inventario WHERE plan_id = ${planId}::uuid GROUP BY plan_id`
      : await this.prisma.$queryRaw<Conteo[]>`
          SELECT plan_id::text AS plan_id,
            count(*) FILTER (WHERE estado = 'disponible' AND (vence_en IS NULL OR vence_en > now())) AS disponibles,
            count(*) FILTER (WHERE estado = 'disponible' AND vence_en <= now()) AS vencidos,
            count(*) FILTER (WHERE estado = 'entregado') AS entregados,
            count(*) FILTER (WHERE estado = 'anulado') AS anulados
          FROM codigos_inventario GROUP BY plan_id`;
    return new Map(filas.map((f) => [f.plan_id, f]));
  }

  private async pendientesPorPlan(planIds: string[]): Promise<Map<string, number>> {
    if (planIds.length === 0) return new Map();
    const g = await this.prisma.entrega.groupBy({
      by: ['planId'],
      where: { planId: { in: planIds }, estado: 'pendiente', adaptador: 'codigos' },
      _count: { _all: true },
    });
    return new Map(g.map((x) => [x.planId, x._count._all]));
  }

  private inventarioPlan(p: PlanConProveedor, c: Conteo | undefined, pendientes: number) {
    return {
      plan: { id: p.id, nombre: p.nombre, servicio: p.servicio.nombre, activo: p.activo },
      proveedor: {
        id: p.servicio.proveedor.id,
        nombre: p.servicio.proveedor.nombre,
        adaptador: p.servicio.proveedor.adaptador as AdaptadorEntrega,
      },
      disponibles: Number(c?.disponibles ?? 0),
      vencidos: Number(c?.vencidos ?? 0),
      entregados: Number(c?.entregados ?? 0),
      anulados: Number(c?.anulados ?? 0),
      pendientes,
    } satisfies InventarioPlan;
  }
}
