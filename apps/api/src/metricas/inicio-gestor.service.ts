import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type InicioGestor,
  limitadoACartera,
  type MetaMesEntrada,
  type PlataformaInicio,
  tienePermiso,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  DESFASE_CARACAS_MS,
  inicioDiaCaracas,
  partesCaracas,
} from '../automatizaciones/horario.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { PRISMA } from '../comun/tokens.js';
import { CERO } from '../dinero/dinero.js';
import { NotasService } from '../clientes/notas.service.js';

const VIGENTES = ['activa', 'en_gracia'] as const;

/** Mes de Caracas de `d`: primer día (para la meta) y su rango como instantes UTC. */
function mesCaracas(d: Date) {
  const { anio, mes, dia } = partesCaracas(d);
  const inicio = new Date(Date.UTC(anio, mes - 1, 1) - DESFASE_CARACAS_MS);
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    clave: `${anio}-${String(mes).padStart(2, '0')}`,
    primerDia: new Date(Date.UTC(anio, mes - 1, 1)),
    inicio,
    dia,
    diasDelMes,
  };
}

/**
 * Lo que el Gestor mostraba arriba del panel: tarjetas por plataforma (activas,
 * vencen hoy y mañana, por reponer, libres), renovados hoy «x de y», notas por
 * avisar y la meta del mes con su proyección.
 */
@Injectable()
export class InicioGestorService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(NotasService) private readonly notas: NotasService,
  ) {}

  async ver(auth: ContextoAuth, ahora = new Date()): Promise<InicioGestor> {
    const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(auth.usuario.rol, p);
    const cliente = alcanceClientes(auth);
    const hoy = inicioDiaCaracas(ahora);
    const manana = inicioDiaCaracas(ahora, 1);
    const pasado = inicioDiaCaracas(ahora, 2);
    const verCuentas = puede('cuentas.ver');
    const cartera = limitadoACartera(auth.usuario.rol);
    const mes = mesCaracas(ahora);

    const [vigentes, renovadas, porReponer, libres, notasPorAvisar, liberadas, meta, pagosMes] =
      await Promise.all([
        this.prisma.suscripcion.findMany({
          where: { cliente, estado: { in: [...VIGENTES] } },
          select: {
            venceEn: true,
            plan: { select: { servicio: { select: { id: true, nombre: true } } } },
          },
        }),
        this.prisma.eventoSuscripcion.findMany({
          where: { tipo: 'renovacion', creadoEn: { gte: hoy }, suscripcion: { cliente } },
          select: { suscripcionId: true },
          distinct: ['suscripcionId'],
        }),
        verCuentas
          ? this.prisma.perfilCuenta.findMany({
              where: {
                estado: 'asignado',
                cuenta: { estado: 'caida' },
                suscripcion: { estado: { notIn: ['cancelada', 'vencida'] } },
              },
              select: { cuenta: { select: { servicio: { select: { id: true, nombre: true } } } } },
            })
          : Promise.resolve([]),
        verCuentas
          ? this.prisma.perfilCuenta.findMany({
              where: { estado: 'libre', cuenta: { estado: 'activa' } },
              select: { cuenta: { select: { servicio: { select: { id: true, nombre: true } } } } },
            })
          : Promise.resolve([]),
        puede('clientes.notas') ? this.notas.porAvisar(auth, ahora) : Promise.resolve(0),
        verCuentas
          ? this.prisma.cuentaServicio.count({
              where: { estado: 'en_espera', liberacionEn: { lt: manana } },
            })
          : Promise.resolve(0),
        cartera
          ? Promise.resolve(null)
          : this.prisma.metaMes.findUnique({ where: { mes: mes.primerDia } }),
        cartera
          ? Promise.resolve([])
          : this.prisma.pago.findMany({
              where: { estado: 'confirmado', revisadoEn: { gte: mes.inicio } },
              select: { factura: { select: { totalUsd: true } } },
            }),
      ]);

    const mapa = new Map<string, PlataformaInicio>();
    const de = (s: { id: string; nombre: string }) => {
      let p = mapa.get(s.id);
      if (!p) {
        p = { servicio: s, activas: 0, vencenHoy: 0, vencenManana: 0, porReponer: 0, libres: 0 };
        mapa.set(s.id, p);
      }
      return p;
    };
    let pendientesHoy = 0;
    for (const s of vigentes) {
      const p = de(s.plan.servicio);
      p.activas++;
      if (s.venceEn && s.venceEn >= hoy && s.venceEn < manana) {
        p.vencenHoy++;
        pendientesHoy++;
      } else if (s.venceEn && s.venceEn >= manana && s.venceEn < pasado) {
        p.vencenManana++;
      }
    }
    for (const f of porReponer) de(f.cuenta.servicio).porReponer++;
    for (const f of libres) de(f.cuenta.servicio).libres++;

    const logrado = pagosMes.reduce((suma, p) => suma.add(p.factura.totalUsd), CERO);
    const proyeccion = logrado.div(mes.dia).mul(mes.diasDelMes);

    return {
      plataformas: [...mapa.values()].sort(
        (a, b) => b.activas - a.activas || a.servicio.nombre.localeCompare(b.servicio.nombre, 'es'),
      ),
      renovadosHoy: { hechos: renovadas.length, total: renovadas.length + pendientesHoy },
      notasPorAvisar,
      cuentasLiberadas: liberadas,
      meta: cartera
        ? null
        : {
            mes: mes.clave,
            montoUsd: meta ? meta.montoUsd.toFixed(2) : null,
            logradoUsd: logrado.toFixed(2),
            proyeccionUsd: proyeccion.toFixed(2),
            diasTranscurridos: mes.dia,
            diasDelMes: mes.diasDelMes,
          },
    };
  }

  /** Fija o quita la meta del mes en curso. */
  async fijarMeta(auth: ContextoAuth, e: MetaMesEntrada, cliente: InfoCliente, ahora = new Date()) {
    const mes = mesCaracas(ahora);
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.metaMes.findUnique({ where: { mes: mes.primerDia } });
      if (e.montoUsd === null) {
        if (antes) await tx.metaMes.delete({ where: { mes: mes.primerDia } });
      } else {
        await tx.metaMes.upsert({
          where: { mes: mes.primerDia },
          create: { mes: mes.primerDia, montoUsd: e.montoUsd, definidaPorId: auth.usuario.id },
          update: { montoUsd: e.montoUsd, definidaPorId: auth.usuario.id },
        });
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'meta_mes.fijada',
          entidad: 'meta_mes',
          entidadId: mes.clave,
          antes: { montoUsd: antes ? antes.montoUsd.toFixed(2) : null },
          despues: { montoUsd: e.montoUsd },
          cliente,
        },
        tx,
      );
    });
    return this.ver(auth, ahora);
  }
}
