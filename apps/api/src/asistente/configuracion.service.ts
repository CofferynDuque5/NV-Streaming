import { Inject, Injectable } from '@nestjs/common';
import { type ConfiguracionAsistente, Prisma, type PrismaClient } from '@nv/db';
import {
  type ConfigurarAsistenteEntrada,
  type ConfiguracionAsistentePublica,
  INFO_PROVEEDOR_IA,
  PROVEEDORES_IA,
  type ProveedorIa,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CERO, D, type Dec } from '../dinero/dinero.js';
import { LimitesService } from '../limites/limites.service.js';
import { mesCaracas } from './fechas.js';
import type { Disponibilidad, ProveedorAsistente } from './proveedores/proveedor.js';
import { RegistroProveedoresIa } from './proveedores/registro.js';

const LIMITE_CONFIGURAR = { maximo: 30, ventanaSegundos: 3600 };
const MILLON = D(1_000_000);

const esProveedor = (v: string): v is ProveedorIa =>
  (PROVEEDORES_IA as readonly string[]).includes(v);

/** Mes "YYYY-MM" desplazado n meses. */
function mesMenos(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const topeAlcanzado = () =>
  new ErrorApp(
    409,
    'TOPE_MENSUAL',
    'Se alcanzó el tope de gasto del mes del asistente. Administración puede subirlo en Asistente de IA.',
  );

/**
 * Configuración del asistente (una sola fila, id = 1), motor vigente, uso
 * mensual y tope de gasto. Las claves nunca están aquí: van en el entorno.
 */
@Injectable()
export class ConfiguracionAsistenteService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RegistroProveedoresIa) private readonly registro: RegistroProveedoresIa,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  /** La fila de configuración; si falta (base vaciada), se crea con los valores por defecto. */
  async leer(): Promise<ConfiguracionAsistente> {
    const fila = await this.prisma.configuracionAsistente.findUnique({ where: { id: 1 } });
    if (fila) return fila;
    await this.prisma.configuracionAsistente.createMany({
      data: [{ id: 1 }],
      skipDuplicates: true,
    });
    return this.prisma.configuracionAsistente.findUniqueOrThrow({ where: { id: 1 } });
  }

  proveedorDe(conf: Pick<ConfiguracionAsistente, 'proveedor'>): ProveedorIa {
    return esProveedor(conf.proveedor) ? conf.proveedor : 'local';
  }

  motor(conf: ConfiguracionAsistente): {
    proveedor: ProveedorIa;
    motor: ProveedorAsistente;
    modelo: string;
    disponible: Disponibilidad;
  } {
    const proveedor = this.proveedorDe(conf);
    const motor = this.registro.de(proveedor);
    return {
      proveedor,
      motor,
      modelo: conf.modelo || motor.modelo,
      disponible: motor.disponible(),
    };
  }

  // ── Uso y tope ─────────────────────────────────────────────────────────────

  /** Costo en USD de una llamada (solo Claude tiene costo). */
  costo(proveedor: ProveedorIa, tokensEntrada: number, tokensSalida: number): Dec {
    if (!INFO_PROVEEDOR_IA[proveedor].deCosto) return CERO;
    const p = this.registro.claude.precios;
    return D(tokensEntrada)
      .mul(D(p.entrada))
      .add(D(tokensSalida).mul(D(p.salida)))
      .div(MILLON)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_UP);
  }

  /** Suma una llamada al uso del mes (atómico: un solo INSERT … ON CONFLICT). */
  async registrarUso(proveedor: ProveedorIa, tokensEntrada: number, tokensSalida: number) {
    const costo = this.costo(proveedor, tokensEntrada, tokensSalida);
    await this.prisma.$executeRaw`
      INSERT INTO uso_asistente (mes, proveedor, peticiones, tokens_entrada, tokens_salida, costo_usd, actualizado_en)
      VALUES (${mesCaracas()}, ${proveedor}, 1, ${tokensEntrada}::bigint, ${tokensSalida}::bigint, ${costo.toFixed(4)}::numeric, now())
      ON CONFLICT (mes, proveedor) DO UPDATE SET
        peticiones = uso_asistente.peticiones + 1,
        tokens_entrada = uso_asistente.tokens_entrada + EXCLUDED.tokens_entrada,
        tokens_salida = uso_asistente.tokens_salida + EXCLUDED.tokens_salida,
        costo_usd = uso_asistente.costo_usd + EXCLUDED.costo_usd,
        actualizado_en = now()`;
  }

  /** true si el motor es de pago y el gasto del mes ya llegó al tope. */
  async topeSuperado(conf: ConfiguracionAsistente): Promise<boolean> {
    const proveedor = this.proveedorDe(conf);
    if (!INFO_PROVEEDOR_IA[proveedor].deCosto) return false;
    const uso = await this.prisma.usoAsistente.findUnique({
      where: { mes_proveedor: { mes: mesCaracas(), proveedor } },
      select: { costoUsd: true },
    });
    return (uso?.costoUsd ?? CERO).gte(conf.topeMensualUsd);
  }

  // ── Panel de configuración ─────────────────────────────────────────────────

  async publica(): Promise<ConfiguracionAsistentePublica> {
    const conf = await this.leer();
    const actual = this.proveedorDe(conf);
    const mes = mesCaracas();
    const [actualizadoPor, usos, proveedores] = await Promise.all([
      conf.actualizadoPorId
        ? this.prisma.usuario.findUnique({
            where: { id: conf.actualizadoPorId },
            select: { id: true, nombre: true },
          })
        : null,
      this.prisma.usoAsistente.findMany({
        where: { mes: { gte: mesMenos(mes, 2) } },
        orderBy: [{ mes: 'desc' }, { proveedor: 'asc' }],
      }),
      Promise.all(
        PROVEEDORES_IA.map(async (p) => {
          const motor = this.registro.de(p);
          let d = motor.disponible();
          // Solo el modelo local se comprueba de verdad (rápido y gratis).
          if (p === 'local' && d.ok) {
            d = await this.registro.local.comprobar(
              actual === 'local' && conf.modelo ? conf.modelo : motor.modelo,
              1500,
            );
          }
          return {
            proveedor: p,
            nombre: INFO_PROVEEDOR_IA[p].nombre,
            disponible: d.ok,
            modeloPorDefecto: motor.modelo,
            motivo: d.motivo,
          };
        }),
      ),
    ]);
    return {
      activo: conf.activo,
      proveedor: actual,
      modelo: conf.modelo,
      topeMensualUsd: conf.topeMensualUsd.toFixed(2),
      mensajesDiariosPorUsuario: conf.mensajesDiariosPorUsuario,
      proveedores,
      usoMes: usos
        .filter((u) => esProveedor(u.proveedor))
        .map((u) => ({
          mes: u.mes,
          proveedor: u.proveedor as ProveedorIa,
          peticiones: u.peticiones,
          tokensEntrada: Number(u.tokensEntrada),
          tokensSalida: Number(u.tokensSalida),
          costoUsd: u.costoUsd.toFixed(4),
        })),
      actualizadoPor,
      actualizadoEn: conf.actualizadoPorId ? iso(conf.actualizadoEn) : null,
    };
  }

  async actualizar(
    auth: ContextoAuth,
    entrada: ConfigurarAsistenteEntrada,
    cliente: InfoCliente,
  ): Promise<ConfiguracionAsistentePublica> {
    await this.limites.consumir(`asistente:configurar:${auth.usuario.id}`, LIMITE_CONFIGURAR);
    if (entrada.activo) {
      const d = this.registro.de(entrada.proveedor).disponible();
      if (!d.ok) {
        throw new ErrorApp(
          409,
          'MOTOR_NO_DISPONIBLE',
          `No se puede activar ${INFO_PROVEEDOR_IA[entrada.proveedor].nombre}: ${d.motivo ?? 'falta configuración en el servidor.'}`,
        );
      }
    }
    const antes = await this.leer();
    const resumen = (c: {
      activo: boolean;
      proveedor: string;
      modelo: string | null;
      topeMensualUsd: string;
      mensajesDiariosPorUsuario: number;
    }) => ({
      activo: c.activo,
      proveedor: c.proveedor,
      modelo: c.modelo,
      topeMensualUsd: c.topeMensualUsd,
      mensajesDiariosPorUsuario: c.mensajesDiariosPorUsuario,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracionAsistente.update({
        where: { id: 1 },
        data: {
          activo: entrada.activo,
          proveedor: entrada.proveedor,
          modelo: entrada.modelo,
          topeMensualUsd: D(entrada.topeMensualUsd),
          mensajesDiariosPorUsuario: entrada.mensajesDiariosPorUsuario,
          actualizadoPorId: auth.usuario.id,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'asistente.configurado',
          entidad: 'configuracion_asistente',
          entidadId: '1',
          antes: resumen({ ...antes, topeMensualUsd: antes.topeMensualUsd.toFixed(2) }),
          despues: resumen({
            ...entrada,
            topeMensualUsd: D(entrada.topeMensualUsd).toFixed(2),
          }),
          cliente,
        },
        tx,
      );
    });
    return this.publica();
  }
}
