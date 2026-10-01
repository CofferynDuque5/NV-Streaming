import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EventoPasarela, Prisma, PrismaClient } from '@nv/db';
import type { EventoPasarelaResumen, Pagina } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { mensajeError } from '../automatizaciones/recuento.js';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';
import { TrabajosService } from '../automatizaciones/trabajos.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { sha256 } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import type { EventoWebhook } from './adaptador.js';
import { CobrosAutomaticosService } from './cobros-automaticos.service.js';
import { IntentosPagoService } from './intentos.service.js';
import { MetodosAutorizadosService } from './metodos-autorizados.service.js';
import { esPasarela } from './pasarelas.js';
import { eventoResumen } from './presentacion.js';
import { ReembolsosService } from './reembolsos.service.js';
import { RegistroPasarelas } from './registro.service.js';

const POR_PAGINA = 20;

/** Lo que el núcleo necesita del evento, guardado junto a la carga (sin el token en claro). */
interface Normalizado {
  tipo: EventoWebhook['normalizado']['tipo'];
  idExterno: string | null;
  idCobro: string | null;
  idReembolso: string | null;
  /** SHA-256 del token (nunca el token): basta para encontrar el método. */
  huellaToken: string | null;
}

/**
 * Bandeja de webhooks de las pasarelas: se verifica la firma con el cuerpo
 * crudo, se guarda cada evento una sola vez (pasarela + idEvento) y un trabajo
 * lo procesa. Procesar nunca confía en el cuerpo: vuelve a consultar a la
 * pasarela y aplica el resultado con las mismas rutas idempotentes que el
 * retorno del cliente o la tarea de cobros.
 */
@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger('Webhooks');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(IntentosPagoService) private readonly intentos: IntentosPagoService,
    @Inject(CobrosAutomaticosService) private readonly cobros: CobrosAutomaticosService,
    @Inject(ReembolsosService) private readonly reembolsos: ReembolsosService,
    @Inject(MetodosAutorizadosService) private readonly metodos: MetodosAutorizadosService,
    @Inject(TrabajosService) private readonly trabajos: TrabajosService,
  ) {}

  onModuleInit(): void {
    this.trabajos.registrar(TRABAJO.eventoPasarela, async (carga) => {
      const r = await this.procesar(String(carga['eventoId']));
      // Un error se reintenta con la espera de la cola.
      if (r.estado === 'error') throw new Error(r.error ?? 'Error al procesar el evento.');
    });
  }

  /**
   * Recibe un webhook. Firma inválida → 400 y no se guarda. Un evento repetido
   * responde igual (200) sin volver a encolarlo.
   */
  async recibir(
    pasarela: string,
    cabeceras: Record<string, string | string[] | undefined>,
    cuerpoCrudo: Buffer | undefined,
  ): Promise<{ recibido: true; duplicado: boolean }> {
    if (!esPasarela(pasarela) || !this.registro.disponible(pasarela)) {
      throw Errores.noEncontrado('La pasarela');
    }
    const v = await this.registro
      .adaptador(pasarela)
      .verificarWebhook(cabeceras, cuerpoCrudo ?? Buffer.alloc(0));
    if (!v.valido || !v.evento) {
      throw new ErrorApp(400, 'FIRMA_INVALIDA', 'La firma del aviso no es válida.');
    }
    const e = v.evento;
    const normalizado: Normalizado = {
      tipo: e.normalizado.tipo,
      idExterno: e.normalizado.idExterno ?? null,
      idCobro: e.normalizado.idCobro ?? null,
      idReembolso: e.normalizado.idReembolso ?? null,
      huellaToken: e.normalizado.token ? sha256(e.normalizado.token) : null,
    };
    const id = randomUUID();
    const nuevo = await this.prisma.$transaction(async (tx) => {
      const r = await tx.eventoPasarela.createMany({
        data: [
          {
            id,
            pasarela,
            idEvento: e.idEvento.slice(0, 160),
            tipo: e.tipo.slice(0, 120),
            idRecurso: e.idRecurso?.slice(0, 160) ?? null,
            firmaValida: true,
            carga: { ...e.carga, _nv: { ...normalizado } } as Prisma.InputJsonObject,
          },
        ],
        skipDuplicates: true,
      });
      if (r.count === 0) return false;
      await encolarTrabajo(tx, {
        tipo: TRABAJO.eventoPasarela,
        carga: { eventoId: id },
        claveUnica: `evento_pasarela:${id}`,
      });
      return true;
    });
    return { recibido: true, duplicado: !nuevo };
  }

  /** Procesa un evento guardado. Idempotente: uno ya procesado o ignorado no se repite. */
  async procesar(eventoId: string, forzar = false): Promise<EventoPasarela> {
    const ev = await this.prisma.eventoPasarela.findUnique({ where: { id: eventoId } });
    if (!ev) throw Errores.noEncontrado('El evento');
    if (!forzar && (ev.estado === 'procesado' || ev.estado === 'ignorado')) return ev;
    const n = ((ev.carga as Record<string, unknown> | null)?.['_nv'] ?? {}) as Partial<Normalizado>;
    let estado: 'procesado' | 'ignorado' | 'error' = 'procesado';
    let error: string | null = null;
    try {
      const hecho = await this.aplicar(ev.pasarela, n);
      if (!hecho) {
        estado = 'ignorado';
        error = 'El evento no corresponde a ningún pago, cobro o método de NV.';
      }
    } catch (e) {
      estado = 'error';
      error = mensajeError(e);
      this.logger.warn(`Evento ${ev.pasarela}/${ev.idEvento} con error: ${error}`);
    }
    return this.prisma.eventoPasarela.update({
      where: { id: ev.id },
      data: { estado, error, procesadoEn: new Date() },
    });
  }

  private async aplicar(pasarela: string, n: Partial<Normalizado>): Promise<boolean> {
    switch (n.tipo) {
      case 'pago_aprobado':
      case 'pago_rechazado': {
        if (n.idExterno) {
          const i = await this.intentos.resolverPorIdExterno(pasarela, n.idExterno);
          if (i) return true;
        }
        if (n.idCobro) return this.cobros.resolverPorIdCobro(pasarela, n.idCobro);
        return false;
      }
      case 'reembolso_completado':
        return n.idReembolso
          ? this.reembolsos.completarPorIdExterno(pasarela, n.idReembolso)
          : false;
      case 'metodo_revocado':
        return n.huellaToken
          ? (await this.metodos.invalidarPorToken(
              pasarela,
              n.huellaToken,
              'La pasarela revocó o invalidó el método.',
            )) > 0
          : false;
      default:
        return false;
    }
  }

  // ── Equipo ─────────────────────────────────────────────────────────────────

  async listar(filtro: {
    pasarela?: string | undefined;
    estado?: EventoPasarela['estado'] | undefined;
    pagina: number;
  }): Promise<Pagina<EventoPasarelaResumen>> {
    const where: Prisma.EventoPasarelaWhereInput = {
      ...(filtro.pasarela ? { pasarela: filtro.pasarela } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.eventoPasarela.count({ where }),
      this.prisma.eventoPasarela.findMany({
        where,
        orderBy: [{ recibidoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
    ]);
    return {
      elementos: filas.map(eventoResumen),
      total,
      pagina: filtro.pagina,
      porPagina: POR_PAGINA,
    };
  }

  /** Administración vuelve a procesar un evento (p. ej. tras corregir un error). */
  async reprocesar(
    auth: ContextoAuth,
    id: string,
    cliente: InfoCliente,
  ): Promise<EventoPasarelaResumen> {
    const antes = await this.prisma.eventoPasarela.findUnique({ where: { id } });
    if (!antes) throw Errores.noEncontrado('El evento');
    const ev = await this.procesar(id, true);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'evento_pasarela.reprocesado',
      entidad: 'evento_pasarela',
      entidadId: id,
      antes: { estado: antes.estado, error: antes.error },
      despues: { estado: ev.estado, error: ev.error },
      cliente,
    });
    return eventoResumen(ev);
  }
}
