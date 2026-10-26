import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type {
  CredencialesCuenta,
  CrearCuentaEntrada,
  CuentaServicioDetalle,
  CuentaServicioResumen,
  EditarCuentaEntrada,
  EditarPerfilEntrada,
  EstadoSuscripcion,
  ListarCuentasEntrada,
  PaginaCuentas,
  PerfilCuentaPublico,
  SuscripcionAsignable,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { dec2, esUnicoDuplicado, iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';

type Tx = Prisma.TransactionClient;

/** Cuántas veces por hora una persona puede ver credenciales (frena la extracción masiva). */
export const LIMITE_REVELAR_CUENTA = { maximo: 30, ventanaSegundos: 3600 };

/** Suscripciones que ya no usan su perfil: conviene liberarlo. */
const TERMINADAS: readonly EstadoSuscripcion[] = ['vencida', 'cancelada'];

const CONTEXTO_HUELLA_USUARIO = 'cuenta:usuario';
export const contextoUsuario = (id: string) => `cuenta:${id}:usuario`;
export const contextoClave = (id: string) => `cuenta:${id}:clave`;
export const contextoPin = (perfilId: string) => `perfil:${perfilId}:pin`;

/** Correo o usuario tal como se compara: sin espacios y en minúsculas. */
const normalizarUsuario = (u: string) => u.trim().toLowerCase();

/** «ma•••@gmail.com» o «ma•••»: basta para reconocerla sin mostrar el correo. */
export function pistaUsuario(usuario: string): string {
  const u = usuario.trim();
  const arroba = u.lastIndexOf('@');
  const local = arroba > 0 ? u.slice(0, arroba) : u;
  const inicio = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return arroba > 0 ? `${inicio}•••${u.slice(arroba)}` : `${inicio}•••`;
}

const nombrePerfil = (modo: 'perfiles' | 'completa', numero: number) =>
  modo === 'completa' ? 'Cuenta completa' : `Perfil ${numero}`;

const INCLUIR_RESUMEN = {
  servicio: { select: { id: true, nombre: true } },
  perfiles: { select: { estado: true } },
} as const satisfies Prisma.CuentaServicioInclude;

const INCLUIR_DETALLE = {
  servicio: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, nombre: true } },
  perfiles: {
    orderBy: { numero: 'asc' },
    include: {
      suscripcion: {
        select: {
          id: true,
          estado: true,
          venceEn: true,
          cliente: { select: { id: true, nombre: true } },
          plan: { select: { id: true, nombre: true } },
        },
      },
    },
  },
} as const satisfies Prisma.CuentaServicioInclude;

type FilaResumen = Prisma.CuentaServicioGetPayload<{ include: typeof INCLUIR_RESUMEN }>;
type FilaDetalle = Prisma.CuentaServicioGetPayload<{ include: typeof INCLUIR_DETALLE }>;

function resumen(c: FilaResumen | FilaDetalle): CuentaServicioResumen {
  const cuenta = (e: string) => c.perfiles.filter((p) => p.estado === e).length;
  return {
    id: c.id,
    servicio: c.servicio,
    pista: c.pista,
    modo: c.modo,
    estado: c.estado,
    plan: c.plan,
    pais: c.pais,
    costoUsd: dec2(c.costoUsd),
    cicloMeses: c.cicloMeses,
    facturaEn: dia(c.facturaEn),
    metodoPago: c.metodoPago,
    proveedor: c.proveedor,
    perfiles: {
      total: c.perfiles.length,
      libres: cuenta('libre'),
      asignados: cuenta('asignado'),
      bloqueados: cuenta('bloqueado'),
    },
    creadoEn: c.creadoEn.toISOString(),
  };
}

function detalle(c: FilaDetalle): CuentaServicioDetalle {
  return {
    ...resumen(c),
    notas: c.notas,
    creadoPor: c.creadoPor,
    listaPerfiles: c.perfiles.map((p): PerfilCuentaPublico => ({
      id: p.id,
      numero: p.numero,
      nombre: p.nombre,
      estado: p.estado,
      tienePin: Boolean(p.pinCifrado),
      asignacion: p.suscripcion
        ? {
            suscripcionId: p.suscripcion.id,
            estado: p.suscripcion.estado,
            venceEn: iso(p.suscripcion.venceEn),
            cliente: p.suscripcion.cliente,
            plan: p.suscripcion.plan,
            terminada: TERMINADAS.includes(p.suscripcion.estado),
          }
        : null,
    })),
  };
}

/** «AAAA-MM-DD» de una columna DATE. */
export const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export const fechaODb = (d: string | null | undefined) =>
  d === undefined ? undefined : d === null ? null : new Date(`${d}T00:00:00Z`);

const cuentaRepetida = () =>
  new ErrorApp(409, 'CUENTA_REPETIDA', 'Ya hay una cuenta guardada con ese correo o usuario.');

/**
 * Cuentas de servicio que NV revende y sus perfiles (lo que hacía el Gestor
 * con «correo, clave, perfiles y PIN»). Las credenciales se guardan cifradas y
 * nunca salen en listas, registros ni auditoría: se piden con «Ver
 * credenciales», que descifra en el momento, queda auditado y tiene límite.
 */
@Injectable()
export class CuentasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  private huella(usuario: string) {
    return this.cifrador.huella(normalizarUsuario(usuario), CONTEXTO_HUELLA_USUARIO);
  }

  async listar(f: ListarCuentasEntrada): Promise<PaginaCuentas> {
    const busqueda = f.busqueda?.trim();
    const where: Prisma.CuentaServicioWhereInput = {
      ...(f.servicioId ? { servicioId: f.servicioId } : {}),
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.conLibres ? { perfiles: { some: { estado: 'libre' } } } : {}),
      ...(busqueda
        ? {
            OR: [
              { usuarioHuella: this.huella(busqueda) },
              { pista: { contains: busqueda, mode: 'insensitive' } },
              { notas: { contains: busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.cuentaServicio.count({ where }),
      this.prisma.cuentaServicio.findMany({
        where,
        include: INCLUIR_RESUMEN,
        orderBy: [{ estado: 'asc' }, { creadoEn: 'desc' }, { id: 'asc' }],
        skip: (f.pagina - 1) * f.porPagina,
        take: f.porPagina,
      }),
    ]);
    return { elementos: filas.map(resumen), total, pagina: f.pagina, porPagina: f.porPagina };
  }

  async ver(id: string, tx: Tx | PrismaClient = this.prisma): Promise<CuentaServicioDetalle> {
    const c = await tx.cuentaServicio.findUnique({ where: { id }, include: INCLUIR_DETALLE });
    if (!c) throw Errores.noEncontrado('La cuenta');
    return detalle(c);
  }

  async crear(
    auth: ContextoAuth,
    e: CrearCuentaEntrada,
    cliente: InfoCliente,
  ): Promise<CuentaServicioDetalle> {
    const servicio = await this.prisma.servicio.findUnique({
      where: { id: e.servicioId },
      select: { id: true },
    });
    if (!servicio) throw Errores.noEncontrado('El servicio');
    const id = randomUUID();
    const perfiles = e.modo === 'completa' ? 1 : e.perfiles;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.cuentaServicio.create({
          data: {
            id,
            servicioId: e.servicioId,
            usuarioCifrado: this.cifrador.cifrar(e.usuario.trim(), contextoUsuario(id)),
            usuarioHuella: this.huella(e.usuario),
            pista: pistaUsuario(e.usuario),
            claveCifrada: this.cifrador.cifrar(e.clave, contextoClave(id)),
            modo: e.modo,
            plan: e.plan ?? null,
            pais: e.pais ?? null,
            costoUsd: e.costoUsd ?? '0',
            cicloMeses: e.cicloMeses ?? 1,
            facturaEn: fechaODb(e.facturaEn) ?? null,
            metodoPago: e.metodoPago ?? null,
            proveedor: e.proveedor ?? null,
            notas: e.notas ?? null,
            creadoPorId: auth.usuario.id,
            perfiles: {
              create: Array.from({ length: perfiles }, (_, i) => ({
                numero: i + 1,
                nombre: nombrePerfil(e.modo, i + 1),
              })),
            },
          },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'cuenta_servicio.creada',
            entidad: 'cuenta_servicio',
            entidadId: id,
            despues: { servicioId: e.servicioId, modo: e.modo, perfiles },
            cliente,
          },
          tx,
        );
        return this.ver(id, tx);
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) throw cuentaRepetida();
      throw err;
    }
  }

  async editar(
    auth: ContextoAuth,
    id: string,
    e: EditarCuentaEntrada,
    cliente: InfoCliente,
  ): Promise<CuentaServicioDetalle> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const c = await tx.cuentaServicio.findUnique({
          where: { id },
          select: {
            id: true,
            modo: true,
            perfiles: { select: { id: true, numero: true, estado: true } },
          },
        });
        if (!c) throw Errores.noEncontrado('La cuenta');
        const cambios: string[] = [];
        const data: Prisma.CuentaServicioUpdateInput = {};
        if (e.usuario !== undefined) {
          data.usuarioCifrado = this.cifrador.cifrar(e.usuario.trim(), contextoUsuario(id));
          data.usuarioHuella = this.huella(e.usuario);
          data.pista = pistaUsuario(e.usuario);
          cambios.push('usuario');
        }
        if (e.clave !== undefined) {
          data.claveCifrada = this.cifrador.cifrar(e.clave, contextoClave(id));
          cambios.push('clave');
        }
        for (const campo of [
          'estado',
          'plan',
          'pais',
          'costoUsd',
          'cicloMeses',
          'metodoPago',
          'proveedor',
          'notas',
        ] as const) {
          if (e[campo] !== undefined) {
            (data as Record<string, unknown>)[campo] = e[campo];
            cambios.push(campo);
          }
        }
        if (e.facturaEn !== undefined) {
          data.facturaEn = fechaODb(e.facturaEn);
          cambios.push('facturaEn');
        }
        if (e.perfiles !== undefined && e.perfiles !== c.perfiles.length) {
          if (c.modo === 'completa') {
            throw new ErrorApp(409, 'CUENTA_COMPLETA', 'Una cuenta completa tiene un solo cupo.');
          }
          await this.ajustarPerfiles(tx, c.id, c.perfiles, e.perfiles);
          cambios.push('perfiles');
        }
        await tx.cuentaServicio.update({ where: { id }, data });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'cuenta_servicio.editada',
            entidad: 'cuenta_servicio',
            entidadId: id,
            // Solo qué cambió, nunca los valores de usuario o clave.
            despues: { cambios, ...(e.estado ? { estado: e.estado } : {}) },
            cliente,
          },
          tx,
        );
        return this.ver(id, tx);
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) throw cuentaRepetida();
      throw err;
    }
  }

  /** Agrega perfiles al final o quita los últimos, solo si están libres. */
  private async ajustarPerfiles(
    tx: Tx,
    cuentaId: string,
    actuales: { id: string; numero: number; estado: string }[],
    total: number,
  ) {
    const ordenados = [...actuales].sort((a, b) => a.numero - b.numero);
    if (total > ordenados.length) {
      const ultimo = ordenados.at(-1)?.numero ?? 0;
      await tx.perfilCuenta.createMany({
        data: Array.from({ length: total - ordenados.length }, (_, i) => ({
          cuentaId,
          numero: ultimo + i + 1,
          nombre: nombrePerfil('perfiles', ultimo + i + 1),
        })),
      });
      return;
    }
    const sobran = ordenados.slice(total);
    if (sobran.some((p) => p.estado !== 'libre')) {
      throw new ErrorApp(
        409,
        'PERFILES_OCUPADOS',
        'Solo se pueden quitar perfiles libres. Libera los últimos perfiles antes de reducir la cuenta.',
      );
    }
    await tx.perfilCuenta.deleteMany({ where: { id: { in: sobran.map((p) => p.id) } } });
  }

  private async perfil(tx: Tx, cuentaId: string, perfilId: string) {
    const p = await tx.perfilCuenta.findFirst({
      where: { id: perfilId, cuentaId },
      include: { cuenta: { select: { servicioId: true, estado: true } } },
    });
    if (!p) throw Errores.noEncontrado('El perfil');
    return p;
  }

  async editarPerfil(
    auth: ContextoAuth,
    cuentaId: string,
    perfilId: string,
    e: EditarPerfilEntrada,
    cliente: InfoCliente,
  ): Promise<CuentaServicioDetalle> {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.perfil(tx, cuentaId, perfilId);
      const data: Prisma.PerfilCuentaUpdateInput = {};
      const cambios: string[] = [];
      if (e.nombre !== undefined) {
        data.nombre = e.nombre;
        cambios.push('nombre');
      }
      if (e.pin !== undefined) {
        data.pinCifrado = e.pin === null ? null : this.cifrador.cifrar(e.pin, contextoPin(p.id));
        cambios.push(e.pin === null ? 'pin_quitado' : 'pin');
      }
      if (e.bloqueado !== undefined && e.bloqueado !== (p.estado === 'bloqueado')) {
        if (p.estado === 'asignado') {
          throw new ErrorApp(409, 'PERFIL_ASIGNADO', 'Libera el perfil antes de bloquearlo.');
        }
        data.estado = e.bloqueado ? 'bloqueado' : 'libre';
        cambios.push(e.bloqueado ? 'bloqueado' : 'desbloqueado');
      }
      await tx.perfilCuenta.update({ where: { id: p.id }, data });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'perfil_cuenta.editado',
          entidad: 'perfil_cuenta',
          entidadId: p.id,
          despues: { cuentaId, numero: p.numero, cambios },
          cliente,
        },
        tx,
      );
      return this.ver(cuentaId, tx);
    });
  }

  async asignar(
    auth: ContextoAuth,
    cuentaId: string,
    perfilId: string,
    suscripcionId: string,
    cliente: InfoCliente,
  ): Promise<CuentaServicioDetalle> {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.perfil(tx, cuentaId, perfilId);
      if (p.cuenta.estado !== 'activa') {
        throw new ErrorApp(409, 'CUENTA_NO_ACTIVA', 'Solo se asignan perfiles de cuentas activas.');
      }
      if (p.estado !== 'libre') {
        throw new ErrorApp(
          409,
          'PERFIL_NO_LIBRE',
          p.estado === 'asignado' ? 'Este perfil ya está asignado.' : 'Este perfil está bloqueado.',
        );
      }
      const s = await tx.suscripcion.findUnique({
        where: { id: suscripcionId },
        select: {
          id: true,
          estado: true,
          plan: { select: { servicioId: true } },
          perfilCuenta: { select: { id: true } },
        },
      });
      if (!s) throw Errores.noEncontrado('La suscripción');
      if (s.plan.servicioId !== p.cuenta.servicioId) {
        throw new ErrorApp(409, 'OTRO_SERVICIO', 'La suscripción es de otro servicio.');
      }
      if (TERMINADAS.includes(s.estado)) {
        throw new ErrorApp(409, 'SUSCRIPCION_TERMINADA', 'La suscripción ya terminó.');
      }
      if (s.perfilCuenta) {
        throw new ErrorApp(409, 'SUSCRIPCION_CON_PERFIL', 'Esa suscripción ya tiene un perfil.');
      }
      // La condición sobre el estado evita que dos personas asignen el mismo perfil a la vez.
      const r = await tx.perfilCuenta.updateMany({
        where: { id: p.id, estado: 'libre' },
        data: { estado: 'asignado', suscripcionId: s.id, asignadoEn: new Date() },
      });
      if (r.count === 0) {
        throw new ErrorApp(409, 'PERFIL_NO_LIBRE', 'Este perfil ya está asignado.');
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'perfil_cuenta.asignado',
          entidad: 'perfil_cuenta',
          entidadId: p.id,
          despues: { cuentaId, numero: p.numero, suscripcionId: s.id },
          cliente,
        },
        tx,
      );
      return this.ver(cuentaId, tx);
    });
  }

  async liberar(
    auth: ContextoAuth,
    cuentaId: string,
    perfilId: string,
    cliente: InfoCliente,
  ): Promise<CuentaServicioDetalle> {
    return this.prisma.$transaction(async (tx) => {
      const p = await this.perfil(tx, cuentaId, perfilId);
      if (p.estado !== 'asignado') {
        throw new ErrorApp(409, 'PERFIL_NO_ASIGNADO', 'Este perfil no está asignado.');
      }
      await tx.perfilCuenta.update({
        where: { id: p.id },
        data: { estado: 'libre', suscripcionId: null, asignadoEn: null },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'perfil_cuenta.liberado',
          entidad: 'perfil_cuenta',
          entidadId: p.id,
          despues: { cuentaId, numero: p.numero, suscripcionId: p.suscripcionId },
          cliente,
        },
        tx,
      );
      return this.ver(cuentaId, tx);
    });
  }

  /** Suscripciones vigentes del mismo servicio que todavía no tienen perfil. */
  async asignables(cuentaId: string, busqueda?: string): Promise<SuscripcionAsignable[]> {
    const c = await this.prisma.cuentaServicio.findUnique({
      where: { id: cuentaId },
      select: { servicioId: true },
    });
    if (!c) throw Errores.noEncontrado('La cuenta');
    const filas = await this.prisma.suscripcion.findMany({
      where: {
        plan: { servicioId: c.servicioId },
        estado: { notIn: [...TERMINADAS] },
        perfilCuenta: null,
        ...(busqueda?.trim()
          ? { cliente: { nombre: { contains: busqueda.trim(), mode: 'insensitive' } } }
          : {}),
      },
      select: {
        id: true,
        estado: true,
        venceEn: true,
        cliente: { select: { id: true, nombre: true } },
        plan: { select: { id: true, nombre: true } },
      },
      orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    return filas.map((s) => ({ ...s, venceEn: iso(s.venceEn) }));
  }

  /** Descifra usuario, clave y PIN. Con límite por persona y siempre auditado. */
  async revelar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<CredencialesCuenta> {
    await this.limites.consumir(`revelar_cuenta:${auth.usuario.id}`, LIMITE_REVELAR_CUENTA);
    const c = await this.prisma.cuentaServicio.findUnique({
      where: { id },
      select: {
        id: true,
        usuarioCifrado: true,
        claveCifrada: true,
        perfiles: {
          orderBy: { numero: 'asc' },
          select: { id: true, numero: true, nombre: true, pinCifrado: true },
        },
      },
    });
    if (!c) throw Errores.noEncontrado('La cuenta');
    const credenciales: CredencialesCuenta = {
      usuario: this.cifrador.descifrar(c.usuarioCifrado, contextoUsuario(c.id)),
      clave: this.cifrador.descifrar(c.claveCifrada, contextoClave(c.id)),
      perfiles: c.perfiles.map((p) => ({
        numero: p.numero,
        nombre: p.nombre,
        pin: p.pinCifrado ? this.cifrador.descifrar(p.pinCifrado, contextoPin(p.id)) : null,
      })),
    };
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'cuenta_servicio.credenciales_vistas',
      entidad: 'cuenta_servicio',
      entidadId: c.id,
      despues: { perfilesConPin: credenciales.perfiles.filter((p) => p.pin).length },
      cliente,
    });
    return credenciales;
  }
}
