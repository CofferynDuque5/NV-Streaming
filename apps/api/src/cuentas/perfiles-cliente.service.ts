import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type {
  EstadoSuscripcion,
  MensajePerfil,
  PerfilDelCliente,
  PerfilRevelado,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { fechaLarga } from '../automatizaciones/horario.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import {
  contextoClave,
  contextoPin,
  contextoUsuario,
  LIMITE_REVELAR_CUENTA,
} from './cuentas.service.js';

/** Cuántas veces por hora un cliente puede ver los datos de sus perfiles. */
export const LIMITE_REVELAR_PERFIL = { maximo: 15, ventanaSegundos: 3600 };

/** Solo con la suscripción vigente se ven los datos: al vencer o cancelarse dejan de mostrarse. */
const VIGENTES: readonly EstadoSuscripcion[] = ['activa', 'en_gracia'];

const SELECCION_PERFIL = {
  id: true,
  numero: true,
  nombre: true,
  pinCifrado: true,
  cuenta: {
    select: {
      id: true,
      modo: true,
      estado: true,
      usuarioCifrado: true,
      claveCifrada: true,
      servicio: { select: { id: true, nombre: true } },
    },
  },
} as const;

const noDisponible = (estado: EstadoSuscripcion) =>
  new ErrorApp(
    409,
    'PERFIL_NO_DISPONIBLE',
    estado === 'pendiente_pago'
      ? 'Los datos de tu perfil aparecen cuando se confirme tu pago.'
      : 'Los datos ya no están disponibles: tu suscripción no está vigente.',
  );

/** Solo dígitos, con el código de país (wa.me no acepta «+», espacios ni guiones). */
const numeroWhatsapp = (v: string) => v.replace(/\D/g, '');

/**
 * Datos de los perfiles de cuentas compartidas para su dueño («Mis accesos»)
 * y el mensaje que arma el equipo para enviárselos a mano. Se descifran en
 * el momento, quedan en la auditoría sin los valores y tienen límite por hora.
 */
@Injectable()
export class PerfilesClienteService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  private descifrar(p: {
    id: string;
    nombre: string;
    pinCifrado: string | null;
    cuenta: { id: string; usuarioCifrado: string; claveCifrada: string };
  }): PerfilRevelado {
    return {
      usuario: this.cifrador.descifrar(p.cuenta.usuarioCifrado, contextoUsuario(p.cuenta.id)),
      clave: this.cifrador.descifrar(p.cuenta.claveCifrada, contextoClave(p.cuenta.id)),
      perfil: p.nombre,
      pin: p.pinCifrado ? this.cifrador.descifrar(p.pinCifrado, contextoPin(p.id)) : null,
    };
  }

  /** Perfiles asignados a las suscripciones del cliente que inició sesión. Sin credenciales. */
  async mios(auth: ContextoAuth): Promise<PerfilDelCliente[]> {
    const filas = await this.prisma.perfilCuenta.findMany({
      where: {
        estado: 'asignado',
        suscripcion: {
          cliente: { usuarioId: auth.usuario.id },
          estado: { notIn: ['vencida', 'cancelada'] },
        },
      },
      select: {
        numero: true,
        nombre: true,
        pinCifrado: true,
        cuenta: {
          select: { modo: true, estado: true, servicio: { select: { id: true, nombre: true } } },
        },
        suscripcion: {
          select: {
            id: true,
            estado: true,
            venceEn: true,
            plan: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: [{ asignadoEn: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    return filas.flatMap((p) =>
      p.suscripcion
        ? [
            {
              suscripcionId: p.suscripcion.id,
              servicio: p.cuenta.servicio,
              plan: p.suscripcion.plan,
              estado: p.suscripcion.estado,
              venceEn: iso(p.suscripcion.venceEn),
              perfil: { numero: p.numero, nombre: p.nombre, tienePin: Boolean(p.pinCifrado) },
              modo: p.cuenta.modo,
              disponible: p.cuenta.estado === 'activa' && VIGENTES.includes(p.suscripcion.estado),
            },
          ]
        : [],
    );
  }

  /** Datos del perfil de una suscripción propia y vigente. */
  async revelarMio(
    auth: ContextoAuth,
    suscripcionId: string,
    cliente: InfoCliente,
  ): Promise<PerfilRevelado> {
    await this.limites.consumir(`revelar_perfil:${auth.usuario.id}`, LIMITE_REVELAR_PERFIL);
    const s = await this.prisma.suscripcion.findFirst({
      where: { id: suscripcionId, cliente: { usuarioId: auth.usuario.id } },
      select: { estado: true, perfilCuenta: { select: SELECCION_PERFIL } },
    });
    if (!s?.perfilCuenta) throw Errores.noEncontrado('El perfil');
    if (!VIGENTES.includes(s.estado)) throw noDisponible(s.estado);
    const p = s.perfilCuenta;
    if (p.cuenta.estado !== 'activa') {
      throw new ErrorApp(
        409,
        'CUENTA_EN_REVISION',
        'Estamos revisando esta cuenta. Te escribiremos con los datos nuevos; si lo necesitas antes, abre un ticket.',
      );
    }
    const datos = this.descifrar(p);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'perfil_cuenta.visto_por_cliente',
      entidad: 'perfil_cuenta',
      entidadId: p.id,
      despues: { cuentaId: p.cuenta.id, suscripcionId, conPin: Boolean(datos.pin) },
      cliente,
    });
    return datos;
  }

  /** Arma el mensaje con los datos de un perfil asignado. El equipo lo envía a mano. */
  async mensaje(
    auth: ContextoAuth,
    cuentaId: string,
    perfilId: string,
    cliente: InfoCliente,
  ): Promise<MensajePerfil> {
    await this.limites.consumir(`revelar_cuenta:${auth.usuario.id}`, LIMITE_REVELAR_CUENTA);
    const p = await this.prisma.perfilCuenta.findFirst({
      where: { id: perfilId, cuentaId },
      select: {
        ...SELECCION_PERFIL,
        suscripcion: {
          select: {
            id: true,
            estado: true,
            venceEn: true,
            plan: { select: { nombre: true } },
            cliente: {
              select: {
                nombre: true,
                correo: true,
                contactos: {
                  where: { tipo: 'whatsapp', consentimientoEn: { not: null } },
                  select: { valor: true },
                  orderBy: { creadoEn: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!p) throw Errores.noEncontrado('El perfil');
    const s = p.suscripcion;
    if (!s) throw new ErrorApp(409, 'PERFIL_NO_ASIGNADO', 'El perfil no está asignado.');
    if (!VIGENTES.includes(s.estado)) throw noDisponible(s.estado);
    if (p.cuenta.estado !== 'activa') {
      throw new ErrorApp(409, 'CUENTA_NO_ACTIVA', 'La cuenta no está activa: revísala primero.');
    }
    const d = this.descifrar(p);
    const nombre = s.cliente.nombre.split(/\s+/)[0] ?? s.cliente.nombre;
    const texto = [
      `Hola, ${nombre}. Estos son los datos de tu ${
        p.cuenta.modo === 'completa' ? 'cuenta' : 'perfil'
      } de ${p.cuenta.servicio.nombre} (${s.plan.nombre}):`,
      '',
      `Correo o usuario: ${d.usuario}`,
      `Clave: ${d.clave}`,
      ...(p.cuenta.modo === 'perfiles' ? [`Perfil: ${d.perfil}`] : []),
      ...(d.pin ? [`PIN: ${d.pin}`] : []),
      ...(s.venceEn ? [`Vence el ${fechaLarga(s.venceEn)}.`] : []),
      '',
      p.cuenta.modo === 'perfiles'
        ? 'Usa solo tu perfil y no cambies la clave, el correo ni los otros perfiles. También los ves en «Mis accesos» de tu panel.'
        : 'No cambies la clave ni el correo de la cuenta. También los ves en «Mis accesos» de tu panel.',
    ].join('\n');
    const wa = s.cliente.contactos[0]?.valor;
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'perfil_cuenta.mensaje_armado',
      entidad: 'perfil_cuenta',
      entidadId: p.id,
      despues: {
        cuentaId,
        suscripcionId: s.id,
        conWhatsapp: Boolean(wa),
        conCorreo: Boolean(s.cliente.correo),
      },
      cliente,
    });
    const asunto = `Datos de tu ${p.cuenta.servicio.nombre}`;
    return {
      texto,
      whatsapp: wa ? `https://wa.me/${numeroWhatsapp(wa)}?text=${encodeURIComponent(texto)}` : null,
      correo: s.cliente.correo
        ? `mailto:${encodeURIComponent(s.cliente.correo)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`
        : null,
    };
  }
}
