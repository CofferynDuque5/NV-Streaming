import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import {
  type AvisarCuentaEntrada,
  contratoServicio,
  fechaContrato,
  type AvisosCuenta,
  esCuentaIndividual,
  esTitular,
  type EstadoSuscripcion,
  mensajeDatosCuenta,
  type MensajePerfil,
  type PerfilDelCliente,
  type PerfilRevelado,
  type TipoPlataforma,
  tipoPlataforma,
  unaPersonaEnTodos,
  urlMedio,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { fechaCaracas, fechaLarga } from '../automatizaciones/horario.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import { revendedorPropio } from '../revendedores/libro-mayor.js';
import {
  contextoClave,
  contextoClaveMiembro,
  contextoMiembro,
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
  usuarioMiembroCifrado: true,
  claveMiembroCifrada: true,
  cuenta: {
    select: {
      id: true,
      modo: true,
      estado: true,
      usuarioCifrado: true,
      claveCifrada: true,
      servicio: { select: { id: true, nombre: true } },
      _count: { select: { perfiles: true } },
      // Para saber si una sola persona ocupa todos los perfiles (cuenta completa).
      perfiles: {
        select: {
          estado: true,
          suscripcion: { select: { cliente: { select: { nombre: true } } } },
        },
      },
    },
  },
} as const;

/** De quién es la suscripción y quién la creó: decide qué va en «Perfil». */
const SELECCION_ORIGEN = {
  clienteId: true,
  creadoPor: { select: { rol: true } },
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

interface DatosTexto {
  nombreCliente: string;
  servicio: string;
  plan: string;
  modo: 'perfiles' | 'completa';
  datos: PerfilRevelado;
  venceEn: Date | null;
}

/** Los datos de acceso en un mensaje, según cómo se entra a la plataforma. */
export function textoDatos(d: DatosTexto, intro?: string): string[] {
  const { datos } = d;
  const nombre = d.nombreCliente.split(/\s+/)[0] ?? d.nombreCliente;
  const lugar = d.modo === 'completa' ? 'cuenta' : datos.tipo === 'perfiles' ? 'perfil' : 'cupo';
  const lineas = [
    intro
      ? `Hola, ${nombre}. ${intro}`
      : `Hola, ${nombre}. Estos son los datos de tu ${lugar} de ${d.servicio} (${d.plan}):`,
    '',
  ];
  if (datos.miembro) {
    lineas.push(
      `Entras con tu propio correo: ${datos.usuario}`,
      ...(datos.clave ? [`Tu clave: ${datos.clave}`] : []),
      'Acepta la invitación al plan familiar que llega a ese correo.',
    );
  } else {
    lineas.push(
      `Correo o usuario: ${datos.usuario}`,
      ...(datos.tipo === 'correo'
        ? ['Al entrar te piden un código: pídelo en «Mis accesos» o escríbenos.']
        : [`Clave: ${datos.clave}`]),
      ...(d.modo === 'perfiles' && datos.tipo === 'perfiles' ? [`Perfil: ${datos.perfil}`] : []),
      ...(datos.pin ? [`PIN: ${datos.pin}`] : []),
    );
  }
  if (d.venceEn) lineas.push(`Vence el ${fechaLarga(d.venceEn)}.`);
  lineas.push(
    '',
    datos.miembro
      ? 'No salgas del plan ni invites a otras personas. También ves estos datos en «Mis accesos» de tu panel.'
      : d.modo === 'perfiles' && datos.tipo === 'perfiles'
        ? 'Usa solo tu perfil y no cambies la clave, el correo ni los otros perfiles. También los ves en «Mis accesos» de tu panel.'
        : 'No cambies la clave ni el correo de la cuenta. También los ves en «Mis accesos» de tu panel.',
  );
  return lineas;
}

/** Cuenta de varios perfiles con la misma persona en todos (se trata como cuenta completa). */
function deUnaPersona(cuenta: {
  perfiles: { estado: string; suscripcion: { cliente: { nombre: string } } | null }[];
}): boolean {
  return Boolean(
    unaPersonaEnTodos(
      cuenta.perfiles.map((x) => ({
        asignado: x.estado === 'asignado',
        nombre: x.suscripcion?.cliente.nombre,
      })),
    ),
  );
}

/**
 * Qué va en «Perfil» del contrato y del mensaje:
 * - Cuenta individual: «Cuenta individual».
 * - Todos los perfiles de la misma persona: «Cuenta completa» (y sin PIN).
 * - Plan familiar o correo: nada (no hay perfil).
 * - Perfil de una cuenta compartida: el nombre del cliente si lo agregó o le
 *   actualizó los datos el equipo; el número del perfil si lo compró en la web.
 */
export function lugarEnContrato(
  datos: PerfilRevelado,
  cuenta: {
    modo: 'perfiles' | 'completa';
    _count: { perfiles: number };
    perfiles: { estado: string; suscripcion: { cliente: { nombre: string } } | null }[];
  },
  nombreCliente: string,
  web: boolean,
): { perfil: string; pin: string } {
  if (esCuentaIndividual(cuenta.modo, cuenta._count.perfiles)) {
    return { perfil: 'Cuenta individual', pin: datos.pin ?? '' };
  }
  if (deUnaPersona(cuenta)) return { perfil: 'Cuenta completa', pin: '' };
  if (datos.tipo !== 'perfiles') return { perfil: '', pin: datos.pin ?? '' };
  return { perfil: web ? datos.perfil : nombreCliente.trim(), pin: datos.pin ?? '' };
}

/**
 * «CONTRATO – FACTURA DE SERVICIO» (formato del Gestor) con los datos del
 * lugar entregado (ver `lugarEnContrato`), PIN o «NO APLICA» y el
 * vencimiento del cliente en dd/mm/aaaa (hora de Venezuela).
 */
export function contratoDe(
  servicio: string,
  datos: PerfilRevelado,
  lugar: { perfil: string; pin: string },
  venceEn: Date | null,
): string {
  return contratoServicio({
    servicio,
    correo: datos.usuario,
    clave: datos.clave,
    perfil: lugar.perfil,
    pin: lugar.pin,
    vence: venceEn ? fechaContrato(fechaCaracas(venceEn)) : '',
  });
}

/** Contacto del cliente para armar los enlaces (WhatsApp con consentimiento, correo, Telegram). */
const SELECCION_CONTACTO = {
  nombre: true,
  correo: true,
  contactos: {
    where: {
      OR: [{ tipo: 'whatsapp', consentimientoEn: { not: null } }, { tipo: 'telegram' }],
    },
    select: { tipo: true, valor: true },
    orderBy: { creadoEn: 'desc' },
  },
} satisfies Prisma.ClienteSelect;

function enlaces(
  c: { correo: string | null; contactos: { tipo: string; valor: string }[] },
  asunto: string,
  texto: string,
) {
  const wa = c.contactos.find((x) => x.tipo === 'whatsapp')?.valor;
  const tg = c.contactos.find((x) => x.tipo === 'telegram')?.valor;
  return {
    whatsapp: wa ? `https://wa.me/${numeroWhatsapp(wa)}?text=${encodeURIComponent(texto)}` : null,
    correo: c.correo
      ? `mailto:${encodeURIComponent(c.correo)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`
      : null,
    telegram: tg ?? null,
  };
}

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

  /**
   * Datos para entrar. En un plan familiar, el miembro de un cupo con correo
   * propio entra con ese correo (nunca ve la clave de la cuenta); el titular
   * (cupo 1) y las plataformas sin PIN no muestran PIN.
   */
  private descifrar(p: {
    id: string;
    numero: number;
    nombre: string;
    pinCifrado: string | null;
    usuarioMiembroCifrado: string | null;
    claveMiembroCifrada: string | null;
    cuenta: {
      id: string;
      usuarioCifrado: string;
      claveCifrada: string;
      servicio: { nombre: string };
    };
  }): PerfilRevelado {
    const tipo: TipoPlataforma = tipoPlataforma(p.cuenta.servicio.nombre);
    const pin =
      tipo === 'perfiles' && p.pinCifrado
        ? this.cifrador.descifrar(p.pinCifrado, contextoPin(p.id))
        : null;
    if (p.usuarioMiembroCifrado && !esTitular(tipo, p.numero)) {
      return {
        usuario: this.cifrador.descifrar(p.usuarioMiembroCifrado, contextoMiembro(p.id)),
        clave: p.claveMiembroCifrada
          ? this.cifrador.descifrar(p.claveMiembroCifrada, contextoClaveMiembro(p.id))
          : '',
        perfil: tipo === 'perfiles' ? String(p.numero) : p.nombre,
        pin,
        tipo,
        miembro: true,
      };
    }
    return {
      usuario: this.cifrador.descifrar(p.cuenta.usuarioCifrado, contextoUsuario(p.cuenta.id)),
      clave: this.cifrador.descifrar(p.cuenta.claveCifrada, contextoClave(p.cuenta.id)),
      perfil: tipo === 'perfiles' ? String(p.numero) : p.nombre,
      pin,
      tipo,
      miembro: false,
    };
  }

  /** Perfiles asignados a las suscripciones del cliente que inició sesión. Sin credenciales. */
  async mios(auth: ContextoAuth): Promise<PerfilDelCliente[]> {
    return this.listar({ cliente: { usuarioId: auth.usuario.id } });
  }

  /** Perfiles entregados a los clientes de un revendedor (lo que compró con su saldo). */
  async deRevendedor(auth: ContextoAuth): Promise<PerfilDelCliente[]> {
    const r = await revendedorPropio(auth, this.prisma);
    return this.listar({ revendedorId: r.id }, true);
  }

  private async listar(
    dueno: Prisma.SuscripcionWhereInput,
    conCliente = false,
  ): Promise<PerfilDelCliente[]> {
    const [buzones, conAsuntos] = await Promise.all([
      this.prisma.buzonCodigos.count({ where: { activo: true } }),
      this.prisma.asuntoCodigo.findMany({
        where: { activo: true },
        select: { servicioId: true },
        distinct: ['servicioId'],
      }),
    ]);
    const conCodigos = new Set(buzones > 0 ? conAsuntos.map((a) => a.servicioId) : []);
    const filas = await this.prisma.perfilCuenta.findMany({
      where: {
        estado: 'asignado',
        suscripcion: { ...dueno, estado: { notIn: ['vencida', 'cancelada'] } },
      },
      select: {
        numero: true,
        nombre: true,
        pinCifrado: true,
        asignadoEn: true,
        datosCambiadosEn: true,
        datosCambiados: true,
        cuenta: {
          select: {
            modo: true,
            estado: true,
            servicio: {
              select: { id: true, nombre: true, slug: true, categoria: true, imagenId: true },
            },
            _count: { select: { perfiles: true } },
            perfiles: SELECCION_PERFIL.cuenta.select.perfiles,
          },
        },
        suscripcion: {
          select: {
            id: true,
            estado: true,
            venceEn: true,
            ...SELECCION_ORIGEN,
            plan: { select: { id: true, nombre: true } },
            cliente: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: [{ asignadoEn: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    // Clientes que el equipo editó: su perfil se llama con su nombre aunque lo hayan comprado en la web.
    const idsWeb = [
      ...new Set(
        filas.flatMap((p) =>
          p.suscripcion?.creadoPor &&
          ['cliente', 'revendedor'].includes(p.suscripcion.creadoPor.rol)
            ? [p.suscripcion.clienteId]
            : [],
        ),
      ),
    ];
    const editados = new Set(
      idsWeb.length
        ? (
            await this.prisma.auditoria.findMany({
              where: {
                entidad: 'cliente',
                entidadId: { in: idsWeb },
                accion: 'cliente.actualizado',
              },
              select: { entidadId: true },
              distinct: ['entidadId'],
            })
          ).map((a) => a.entidadId)
        : [],
    );
    /** «Cuenta individual», «Cuenta completa», «Perfil 3» (web) o «Perfil: Ana Pérez» (equipo). */
    const lugarDe = (p: (typeof filas)[number]): string => {
      const tipo = tipoPlataforma(p.cuenta.servicio.nombre);
      if (esCuentaIndividual(p.cuenta.modo, p.cuenta._count.perfiles)) return 'Cuenta individual';
      if (deUnaPersona(p.cuenta)) return 'Cuenta completa';
      if (tipo !== 'perfiles') return p.nombre;
      const s = p.suscripcion!;
      const web =
        Boolean(s.creadoPor && ['cliente', 'revendedor'].includes(s.creadoPor.rol)) &&
        !editados.has(s.clienteId);
      return web ? `Perfil ${p.numero}` : `Perfil: ${s.cliente.nombre}`;
    };
    return filas.flatMap((p) =>
      p.suscripcion
        ? [
            {
              suscripcionId: p.suscripcion.id,
              servicio: { id: p.cuenta.servicio.id, nombre: p.cuenta.servicio.nombre },
              servicioSlug: p.cuenta.servicio.slug,
              categoria: p.cuenta.servicio.categoria,
              servicioImagen: p.cuenta.servicio.imagenId
                ? urlMedio(p.cuenta.servicio.imagenId)
                : null,
              plan: p.suscripcion.plan,
              estado: p.suscripcion.estado,
              venceEn: iso(p.suscripcion.venceEn),
              perfil: {
                numero: p.numero,
                nombre: p.nombre,
                tienePin:
                  Boolean(p.pinCifrado) && tipoPlataforma(p.cuenta.servicio.nombre) === 'perfiles',
              },
              tipo: tipoPlataforma(p.cuenta.servicio.nombre),
              modo: p.cuenta.modo,
              lugar: lugarDe(p),
              disponible: p.cuenta.estado === 'activa' && VIGENTES.includes(p.suscripcion.estado),
              pideCodigos: conCodigos.has(p.cuenta.servicio.id),
              // Nombre y apellidos completos: así se distingue a quién es cada perfil.
              titular: p.suscripcion.cliente.nombre,
              ...(conCliente ? { cliente: p.suscripcion.cliente } : {}),
              cambioReciente:
                p.datosCambiadosEn &&
                p.datosCambiados &&
                (!p.asignadoEn || p.datosCambiadosEn >= p.asignadoEn) &&
                Date.now() - p.datosCambiadosEn.getTime() < 15 * 86_400_000
                  ? { en: p.datosCambiadosEn.toISOString(), cambios: p.datosCambiados.split(',') }
                  : null,
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
    return this.revelar(auth, { cliente: { usuarioId: auth.usuario.id } }, suscripcionId, cliente);
  }

  /** El revendedor ve los datos (y el contrato) del perfil que compró para su cliente. */
  async revelarDeRevendedor(
    auth: ContextoAuth,
    suscripcionId: string,
    cliente: InfoCliente,
  ): Promise<PerfilRevelado> {
    const r = await revendedorPropio(auth, this.prisma);
    return this.revelar(auth, { revendedorId: r.id }, suscripcionId, cliente);
  }

  private async revelar(
    auth: ContextoAuth,
    dueno: Prisma.SuscripcionWhereInput,
    suscripcionId: string,
    cliente: InfoCliente,
  ): Promise<PerfilRevelado> {
    await this.limites.consumir(`revelar_perfil:${auth.usuario.id}`, LIMITE_REVELAR_PERFIL);
    const s = await this.prisma.suscripcion.findFirst({
      where: { id: suscripcionId, ...dueno },
      select: {
        estado: true,
        venceEn: true,
        ...SELECCION_ORIGEN,
        cliente: { select: { nombre: true } },
        perfilCuenta: { select: SELECCION_PERFIL },
      },
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
    const revelado = this.descifrar(p);
    const lugar = lugarEnContrato(revelado, p.cuenta, s.cliente.nombre, await this.compraWeb(s));
    // En «Mis accesos» el perfil se llama igual que en el contrato.
    const datos =
      revelado.tipo === 'perfiles' && lugar.perfil
        ? { ...revelado, perfil: lugar.perfil }
        : revelado;
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion:
        'revendedorId' in dueno
          ? 'perfil_cuenta.visto_por_revendedor'
          : 'perfil_cuenta.visto_por_cliente',
      entidad: 'perfil_cuenta',
      entidadId: p.id,
      despues: { cuentaId: p.cuenta.id, suscripcionId, conPin: Boolean(datos.pin) },
      cliente,
    });
    return {
      ...datos,
      contrato: contratoDe(p.cuenta.servicio.nombre, datos, lugar, s.venceEn),
    };
  }

  /**
   * Comprado en la web (por el cliente o un revendedor con su saldo) y nunca
   * editado por el equipo: su perfil se nombra por el número. Lo que agregó o
   * actualizó el equipo lleva el nombre del cliente.
   */
  private async compraWeb(s: {
    clienteId: string;
    creadoPor: { rol: string } | null;
  }): Promise<boolean> {
    if (!s.creadoPor || !['cliente', 'revendedor'].includes(s.creadoPor.rol)) return false;
    const editado = await this.prisma.auditoria.count({
      where: { entidad: 'cliente', entidadId: s.clienteId, accion: 'cliente.actualizado' },
    });
    return editado === 0;
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
            ...SELECCION_ORIGEN,
            plan: { select: { nombre: true } },
            cliente: { select: SELECCION_CONTACTO },
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
    const lugar = lugarEnContrato(d, p.cuenta, s.cliente.nombre, await this.compraWeb(s));
    // Formato de Nathan: saludo, correo, contraseña, perfil, PIN (si tiene) y vencimiento.
    const texto = mensajeDatosCuenta({
      cliente: s.cliente.nombre,
      servicio: p.cuenta.servicio.nombre,
      correo: d.usuario,
      // Las de correo con código no usan la contraseña.
      clave: d.tipo === 'correo' ? '' : d.clave,
      perfil: lugar.perfil,
      pin: lugar.pin,
      vence: s.venceEn ? fechaContrato(fechaCaracas(s.venceEn)) : '',
    });
    const e = enlaces(s.cliente, `Datos de tu ${p.cuenta.servicio.nombre}`, texto);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'perfil_cuenta.mensaje_armado',
      entidad: 'perfil_cuenta',
      entidadId: p.id,
      despues: {
        cuentaId,
        suscripcionId: s.id,
        conWhatsapp: Boolean(e.whatsapp),
        conCorreo: Boolean(s.cliente.correo),
      },
      cliente,
    });
    return { texto, ...e };
  }

  /**
   * Un mensaje por cliente de la cuenta con los datos actualizados (después de
   * cambiar la clave o de un corte). Se envían a mano, uno por uno.
   */
  async avisos(
    auth: ContextoAuth,
    cuentaId: string,
    e: AvisarCuentaEntrada,
    cliente: InfoCliente,
  ): Promise<AvisosCuenta> {
    await this.limites.consumir(`revelar_cuenta:${auth.usuario.id}`, LIMITE_REVELAR_CUENTA);
    const c = await this.prisma.cuentaServicio.findUnique({
      where: { id: cuentaId },
      select: { pista: true, estado: true, servicio: { select: { nombre: true } } },
    });
    if (!c) throw Errores.noEncontrado('La cuenta');
    if (c.estado !== 'activa') {
      throw new ErrorApp(409, 'CUENTA_NO_ACTIVA', 'La cuenta no está activa: revísala primero.');
    }
    const filas = await this.prisma.perfilCuenta.findMany({
      where: {
        cuentaId,
        estado: 'asignado',
        suscripcion: {
          estado: e.incluir === 'activos' ? { in: [...VIGENTES] } : { not: 'cancelada' },
        },
      },
      orderBy: { numero: 'asc' },
      select: {
        ...SELECCION_PERFIL,
        suscripcion: {
          select: {
            id: true,
            estado: true,
            venceEn: true,
            plan: { select: { nombre: true } },
            cliente: { select: { id: true, ...SELECCION_CONTACTO } },
          },
        },
      },
    });
    const servicio = c.servicio.nombre;
    const avisos = filas.flatMap((p) => {
      const s = p.suscripcion;
      if (!s) return [];
      const datos = this.descifrar(p);
      const lineas = textoDatos(
        {
          nombreCliente: s.cliente.nombre,
          servicio,
          plan: s.plan.nombre,
          modo: p.cuenta.modo,
          datos,
          venceEn: s.venceEn,
        },
        `Actualizamos los datos de tu ${servicio}. Estos son los de ahora:`,
      );
      if (e.nota) lineas.push('', e.nota);
      const texto = lineas.join('\n');
      return [
        {
          perfilId: p.id,
          numero: p.numero,
          perfil: p.nombre,
          cliente: { id: s.cliente.id, nombre: s.cliente.nombre },
          estado: s.estado,
          texto,
          ...enlaces(s.cliente, `Datos nuevos de tu ${servicio}`, texto),
        },
      ];
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'cuenta_servicio.avisos_armados',
      entidad: 'cuenta_servicio',
      entidadId: cuentaId,
      despues: { incluir: e.incluir, clientes: avisos.length, conNota: Boolean(e.nota) },
      cliente,
    });
    return { servicio, pista: c.pista, avisos };
  }
}
