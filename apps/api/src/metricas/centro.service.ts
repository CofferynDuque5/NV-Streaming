import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type CentroEquipo,
  INFO_PASARELA,
  PASARELAS,
  type Permiso,
  ROLES_EQUIPO,
  tienePermiso,
} from '@nv/shared';
import { AsistenteService } from '../asistente/asistente.service.js';
import { ConfigAutomatizacionesService } from '../automatizaciones/configuracion.service.js';
import { PanelAutomatizacionesService } from '../automatizaciones/panel.service.js';
import { LATIDO_VIGENTE_MS } from '../automatizaciones/trabajador.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth } from '../comun/contexto.js';
import { PRISMA } from '../comun/tokens.js';
import { TasasService } from '../dinero/tasas.service.js';
import { InventarioService } from '../entregas/inventario.service.js';
import { RegistroPasarelas } from '../pagos-en-linea/registro.service.js';

const TICKETS_ABIERTOS = ['abierto', 'en_progreso', 'esperando_cliente'] as const;

/**
 * Centro de módulos del equipo: lo que espera en cada módulo, sus cifras y el
 * estado del sistema. Cada consulta corre solo si el rol tiene el permiso del
 * módulo; lo de clientes (tickets y facturas) pasa por el alcance de su
 * cartera, igual que en los listados.
 */
@Injectable()
export class CentroService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(InventarioService) private readonly inventario: InventarioService,
    @Inject(ConfigAutomatizacionesService)
    private readonly automatizaciones: ConfigAutomatizacionesService,
    @Inject(PanelAutomatizacionesService) private readonly panel: PanelAutomatizacionesService,
    @Inject(AsistenteService) private readonly asistente: AsistenteService,
    @Inject(RegistroPasarelas) private readonly pasarelas: RegistroPasarelas,
  ) {}

  async centro(auth: ContextoAuth, ahora = new Date()): Promise<CentroEquipo> {
    const puede = (p: Permiso) => tienePermiso(auth.usuario.rol, p);
    /** La consulta solo si tiene el permiso; si no, null sin tocar la base. */
    const si = <T>(p: Permiso, consulta: () => Promise<T>): Promise<T | null> =>
      puede(p) ? consulta() : Promise.resolve(null);
    const cliente = alcanceClientes(auth);

    const [
      pagosEnRevision,
      recargasBilletera,
      recargasRevendedor,
      tickets,
      entregas,
      revendedores,
      facturasVencidas,
      accionesAsistente,
      pocosCodigos,
      catalogo,
      cuponesActivos,
      equipo,
      automatizacionesActivas,
      paginasPublicadas,
      canales,
      asistente,
      tasasFaltantes,
    ] = await Promise.all([
      si('pagos.gestionar', () => this.prisma.pago.count({ where: { estado: 'en_revision' } })),
      si('pagos.gestionar', () =>
        this.prisma.recargaBilletera.count({ where: { estado: 'en_revision' } }),
      ),
      si('pagos.gestionar', () =>
        this.prisma.recargaSaldo.count({ where: { estado: 'en_revision' } }),
      ),
      si('tickets.ver', async () => {
        const abiertos = { cliente, estado: { in: [...TICKETS_ABIERTOS] } };
        const [total, fuera] = await Promise.all([
          this.prisma.ticket.count({ where: abiertos }),
          this.prisma.ticket.count({
            where: { ...abiertos, primeraRespuestaEn: null, slaPrimeraRespuesta: { lt: ahora } },
          }),
        ]);
        return { abiertos: total, fueraDePlazo: fuera };
      }),
      si('entregas.ver', async () => {
        const g = await this.prisma.entrega.groupBy({
          by: ['estado'],
          where: { estado: { in: ['fallida', 'pendiente'] } },
          _count: { _all: true },
        });
        const n = (e: string) => g.find((x) => x.estado === e)?._count._all ?? 0;
        return { fallidas: n('fallida'), pendientes: n('pendiente') };
      }),
      si('revendedores.ver', async () => {
        const g = await this.prisma.revendedor.groupBy({ by: ['estado'], _count: { _all: true } });
        const n = (e: string) => g.find((x) => x.estado === e)?._count._all ?? 0;
        return {
          solicitudes: n('solicitud'),
          aprobados: n('aprobado'),
          suspendidos: n('suspendido'),
        };
      }),
      si('facturas.ver', () =>
        this.prisma.factura.count({
          where: { cliente, estado: 'emitida', venceEn: { lt: ahora } },
        }),
      ),
      si('asistente.usar', () =>
        this.prisma.accionPropuesta.count({
          where: {
            ...(puede('asistente.configurar') ? {} : { solicitadaPorId: auth.usuario.id }),
            estado: 'propuesta',
            decididaEn: null,
            expiraEn: { gt: ahora },
          },
        }),
      ),
      si('inventario.gestionar', async () => {
        const config = await this.automatizaciones.leer('stock_bajo_codigos');
        const planes = await this.inventario.conPocosCodigos(config.parametros.umbral);
        return planes.map((p) => ({
          planId: p.plan.id,
          plan: p.plan.nombre,
          servicio: p.plan.servicio,
          disponibles: p.disponibles,
          pendientes: p.pendientes,
        }));
      }),
      si('catalogo.ver', async () => {
        const [servicios, planes] = await Promise.all([
          this.prisma.servicio.count({ where: { activo: true } }),
          this.prisma.plan.count({ where: { activo: true, servicio: { activo: true } } }),
        ]);
        return { servicios, planes };
      }),
      si('cupones.ver', () =>
        this.prisma.cupon.count({
          where: { activo: true, OR: [{ validoHasta: null }, { validoHasta: { gt: ahora } }] },
        }),
      ),
      si('usuarios.ver', () =>
        this.prisma.usuario.count({ where: { rol: { in: [...ROLES_EQUIPO] }, estado: 'activo' } }),
      ),
      si('automatizaciones.ver', () =>
        this.prisma.automatizacion.count({ where: { activa: true } }),
      ),
      si('sitio.editar', () =>
        this.prisma.pagina.count({
          where: { archivada: false, versionPublicadaId: { not: null } },
        }),
      ),
      si('automatizaciones.ver', () => this.panel.estadoCanales()),
      si('asistente.usar', () => this.asistente.estado(auth)),
      si('finanzas.configurar', () => this.tasas.faltantes()),
    ]);

    // El trabajador lo ve todo el equipo: si se detiene, nadie recibe sus avisos.
    const latido = await this.prisma.latidoTrabajador.findFirst({
      orderBy: { ultimoLatidoEn: 'desc' },
    });
    const trabajador = {
      activo: Boolean(
        latido && ahora.getTime() - latido.ultimoLatidoEn.getTime() < LATIDO_VIGENTE_MS,
      ),
      ultimoLatidoEn: latido?.ultimoLatidoEn.toISOString() ?? null,
    };

    return {
      colas: {
        pagosEnRevision,
        recargasBilletera,
        recargasRevendedor,
        tickets,
        entregas,
        solicitudesRevendedor: revendedores?.solicitudes ?? null,
        facturasVencidas,
        accionesAsistente,
        pocosCodigos,
      },
      modulos: {
        catalogo,
        cuponesActivos,
        equipo,
        revendedores: revendedores
          ? { aprobados: revendedores.aprobados, suspendidos: revendedores.suspendidos }
          : null,
        automatizacionesActivas,
        paginasPublicadas,
      },
      trabajador,
      sistema: {
        canales: canales
          ? {
              correo: canales.correo.proveedor,
              whatsapp:
                canales.whatsapp.proveedor === 'sandbox'
                  ? 'pruebas'
                  : canales.whatsapp.listo
                    ? 'listo'
                    : 'sin_configurar',
            }
          : null,
        asistente: asistente
          ? {
              activo: asistente.activo,
              disponible: asistente.disponible,
              mensajesRestantesHoy: asistente.mensajesRestantesHoy,
            }
          : null,
        pasarelas: puede('pasarelas.configurar')
          ? PASARELAS.map((p) => {
              const a = this.pasarelas.adaptador(p);
              return {
                pasarela: p,
                nombre: INFO_PASARELA[p].nombre,
                configurada: a.configurada(),
                modo: a.modo,
              };
            }).filter((p) => p.pasarela !== 'sandbox' || p.configurada)
          : null,
      },
      tasasFaltantes,
    };
  }
}
