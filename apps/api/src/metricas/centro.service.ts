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
import { latidoVigenteMs } from '../automatizaciones/ahorro.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth } from '../comun/contexto.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { correoSinConfigurar } from '../correo/correo.service.js';
import { TasasService } from '../dinero/tasas.service.js';
import { InventarioService } from '../entregas/inventario.service.js';
import { RegistroPasarelas } from '../pagos-en-linea/registro.service.js';
import { versionDatos } from '../comun/version-datos.js';

/** Cuánto vale un centro ya calculado si no hubo cambios (ver `centro`). */
const CENTRO_VIGENCIA_MS = 15_000;

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
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  /** Último centro calculado por persona, mientras no cambie nada y por pocos segundos. */
  private readonly guardados = new Map<
    string,
    { version: number; vence: number; valor: CentroEquipo }
  >();

  /**
   * El marco del panel pide el centro en cada página para sus insignias. Calcularlo
   * son unas 20 consultas: con la base lejos (Neon) eso sumaba más de un segundo a
   * cada clic. Se reutiliza el de hace menos de CENTRO_VIGENCIA_MS si desde entonces
   * no hubo ningún cambio en este proceso (lo que hace el trabajador aparece al vencer).
   */
  async centro(auth: ContextoAuth, ahora = new Date()): Promise<CentroEquipo> {
    const clave = `${auth.usuario.id}:${auth.usuario.rol}`;
    const version = versionDatos();
    const guardado = this.guardados.get(clave);
    if (guardado && guardado.version === version && guardado.vence > ahora.getTime()) {
      return guardado.valor;
    }
    const valor = await this.calcular(auth, ahora);
    // Solo se guarda si nada cambió mientras se calculaba.
    if (versionDatos() === version) {
      if (this.guardados.size > 200) this.guardados.clear();
      this.guardados.set(clave, { version, vence: ahora.getTime() + CENTRO_VIGENCIA_MS, valor });
    }
    return valor;
  }

  private async calcular(auth: ContextoAuth, ahora: Date): Promise<CentroEquipo> {
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
      inventario,
      catalogo,
      cuponesActivos,
      equipo,
      automatizacionesActivas,
      paginasPublicadas,
      canales,
      asistente,
      tasasFaltantes,
      metodosCobro,
      latido,
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
        const { pocos, conCodigos } = await this.inventario.estadoStock(config.parametros.umbral);
        return {
          conCodigos,
          pocos: pocos.map((p) => ({
            planId: p.plan.id,
            plan: p.plan.nombre,
            servicio: p.plan.servicio,
            disponibles: p.disponibles,
            pendientes: p.pendientes,
          })),
        };
      }),
      si('catalogo.ver', async () => {
        const [proveedores, servicios, planes] = await Promise.all([
          this.prisma.proveedor.count({ where: { activo: true } }),
          this.prisma.servicio.count({ where: { activo: true } }),
          this.prisma.plan.count({ where: { activo: true, servicio: { activo: true } } }),
        ]);
        return { proveedores, servicios, planes };
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
      si('finanzas.configurar', () =>
        this.prisma.metodoCobro.count({ where: { activo: true, tipo: 'manual' } }),
      ),
      // El trabajador lo ve todo el equipo: si se detiene, nadie recibe sus avisos.
      this.prisma.latidoTrabajador.findFirst({ orderBy: { ultimoLatidoEn: 'desc' } }),
    ]);

    const trabajador = {
      activo: Boolean(
        latido && ahora.getTime() - latido.ultimoLatidoEn.getTime() < latidoVigenteMs(this.entorno),
      ),
      ultimoLatidoEn: latido?.ultimoLatidoEn.toISOString() ?? null,
      pausaMinutos: this.entorno.BASE_AHORRO ? this.entorno.TRABAJADOR_PAUSA_MINUTOS : null,
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
        pocosCodigos: inventario?.pocos ?? null,
      },
      modulos: {
        catalogo,
        planesConCodigos: inventario?.conCodigos ?? null,
        cuponesActivos,
        equipo,
        revendedores: revendedores
          ? { aprobados: revendedores.aprobados, suspendidos: revendedores.suspendidos }
          : null,
        automatizacionesActivas,
        paginasPublicadas,
        metodosCobro,
      },
      trabajador,
      sistema: {
        canales: canales
          ? {
              correo: canales.correo.estado,
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
      correoSinConfigurar: correoSinConfigurar(this.entorno),
    };
  }
}
