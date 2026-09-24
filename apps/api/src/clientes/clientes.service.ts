import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, Usuario } from '@nv/db';
import {
  type ActualizarClienteEntrada,
  type ClienteDetalle,
  type ClienteEntrada,
  type ClienteResumen,
  limitadoACartera,
  type ListarClientesEntrada,
  type NotaPublica,
  type Pagina,
  type PerfilClienteEntrada,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { clienteDetalle, clienteResumen, INCLUIR_CLIENTE } from './presentacion.js';

type Tx = Prisma.TransactionClient;

const INCLUIR_DETALLE = {
  ...INCLUIR_CLIENTE,
  contactos: { orderBy: { creadoEn: 'asc' } },
} as const;

@Injectable()
export class ClientesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  async listar(auth: ContextoAuth, filtro: ListarClientesEntrada): Promise<Pagina<ClienteResumen>> {
    const where: Prisma.ClienteWhereInput = {
      AND: [
        alcanceClientes(auth),
        filtro.estado ? { estado: filtro.estado } : { estado: 'activo' },
        filtro.asignadoAId ? { asignadoAId: filtro.asignadoAId } : {},
        filtro.busqueda
          ? {
              OR: [
                { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
                { correo: { contains: filtro.busqueda.toLowerCase() } },
                { documento: { contains: filtro.busqueda, mode: 'insensitive' } },
                { contactos: { some: { valor: { contains: filtro.busqueda } } } },
              ],
            }
          : {},
      ],
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        include: INCLUIR_CLIENTE,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(clienteResumen),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(auth: ContextoAuth, id: string): Promise<ClienteDetalle> {
    const c = await this.prisma.cliente.findFirst({
      where: { AND: [{ id }, alcanceClientes(auth)] },
      include: INCLUIR_DETALLE,
    });
    if (!c) throw Errores.noEncontrado('El cliente');
    return clienteDetalle(c);
  }

  /** Comprueba que el cliente existe y está al alcance de quien pide. */
  async exigirAlcance(auth: ContextoAuth, id: string, tx: Tx | PrismaClient = this.prisma) {
    const c = await tx.cliente.findFirst({ where: { AND: [{ id }, alcanceClientes(auth)] } });
    if (!c) throw Errores.noEncontrado('El cliente');
    return c;
  }

  async crear(
    auth: ContextoAuth,
    entrada: ClienteEntrada,
    cliente: InfoCliente,
  ): Promise<ClienteDetalle> {
    const asignadoAId = limitadoACartera(auth.usuario.rol)
      ? auth.usuario.id
      : (entrada.asignadoAId ?? null);
    return this.prisma.$transaction(async (tx) => {
      if (asignadoAId) await this.exigirVendedor(tx, asignadoAId);
      await this.exigirCorreoLibre(tx, entrada.correo);
      const c = await tx.cliente.create({
        data: {
          nombre: entrada.nombre,
          correo: entrada.correo ?? null,
          documento: entrada.documento ?? null,
          pais: entrada.pais ?? null,
          monedaPreferida: entrada.monedaPreferida,
          asignadoAId,
          origen: 'equipo',
          creadoPorId: auth.usuario.id,
          ...(entrada.whatsapp
            ? {
                contactos: {
                  create: {
                    tipo: 'whatsapp',
                    valor: entrada.whatsapp,
                    consentimientoEn: entrada.aceptaWhatsapp ? new Date() : null,
                  },
                },
              }
            : {}),
        },
        include: INCLUIR_DETALLE,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cliente.creado',
          entidad: 'cliente',
          entidadId: c.id,
          despues: { nombre: c.nombre, correo: c.correo, asignadoAId },
          cliente,
        },
        tx,
      );
      return clienteDetalle(c);
    });
  }

  async actualizar(
    auth: ContextoAuth,
    id: string,
    entrada: ActualizarClienteEntrada,
    cliente: InfoCliente,
  ): Promise<ClienteDetalle> {
    if (entrada.asignadoAId !== undefined && limitadoACartera(auth.usuario.rol)) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'Solo administración u operación reasignan clientes.');
    }
    return this.prisma.$transaction(async (tx) => {
      const antes = await this.exigirAlcance(auth, id, tx);
      if (entrada.asignadoAId) await this.exigirVendedor(tx, entrada.asignadoAId);
      if (entrada.correo && entrada.correo !== antes.correo) {
        if (antes.usuarioId) {
          throw new ErrorApp(
            409,
            'CORREO_DE_ACCESO',
            'Este cliente ya entra con su correo; lo cambia él desde su cuenta.',
          );
        }
        await this.exigirCorreoLibre(tx, entrada.correo, id);
      }
      await tx.cliente.update({
        where: { id },
        data: {
          ...(entrada.nombre !== undefined ? { nombre: entrada.nombre } : {}),
          ...(entrada.correo !== undefined ? { correo: entrada.correo } : {}),
          ...(entrada.documento !== undefined ? { documento: entrada.documento } : {}),
          ...(entrada.pais !== undefined ? { pais: entrada.pais } : {}),
          ...(entrada.monedaPreferida !== undefined
            ? { monedaPreferida: entrada.monedaPreferida }
            : {}),
          ...(entrada.asignadoAId !== undefined ? { asignadoAId: entrada.asignadoAId } : {}),
        },
      });
      if (entrada.whatsapp !== undefined) {
        await this.fijarWhatsapp(tx, id, entrada.whatsapp, entrada.aceptaWhatsapp ?? false);
      }
      const c = await tx.cliente.findUniqueOrThrow({ where: { id }, include: INCLUIR_DETALLE });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cliente.actualizado',
          entidad: 'cliente',
          entidadId: id,
          antes: {
            nombre: antes.nombre,
            correo: antes.correo,
            documento: antes.documento,
            pais: antes.pais,
            monedaPreferida: antes.monedaPreferida,
            asignadoAId: antes.asignadoAId,
          },
          despues: entrada as Prisma.InputJsonObject,
          cliente,
        },
        tx,
      );
      return clienteDetalle(c);
    });
  }

  async cambiarEstado(
    auth: ContextoAuth,
    id: string,
    archivar: boolean,
    motivo: string,
    cliente: InfoCliente,
  ): Promise<ClienteDetalle> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await this.exigirAlcance(auth, id, tx);
      const estado = archivar ? 'archivado' : 'activo';
      if (antes.estado !== estado) {
        if (archivar) {
          const vivas = await tx.suscripcion.count({
            where: {
              clienteId: id,
              estado: { in: ['pendiente_pago', 'activa', 'en_gracia', 'pausada'] },
            },
          });
          if (vivas > 0) {
            throw new ErrorApp(
              409,
              'CLIENTE_CON_SUSCRIPCIONES',
              'Cancela primero sus suscripciones activas o pendientes.',
            );
          }
        }
        await tx.cliente.update({ where: { id }, data: { estado } });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: archivar ? 'cliente.archivado' : 'cliente.reactivado',
            entidad: 'cliente',
            entidadId: id,
            antes: { estado: antes.estado },
            despues: { estado, motivo },
            cliente,
          },
          tx,
        );
      }
      return clienteDetalle(
        await tx.cliente.findUniqueOrThrow({ where: { id }, include: INCLUIR_DETALLE }),
      );
    });
  }

  async notas(auth: ContextoAuth, id: string): Promise<NotaPublica[]> {
    await this.exigirAlcance(auth, id);
    const filas = await this.prisma.notaInterna.findMany({
      where: { clienteId: id },
      orderBy: { creadoEn: 'desc' },
      take: 100,
      include: { autor: { select: { id: true, nombre: true } } },
    });
    return filas.map((n) => ({
      id: n.id,
      texto: n.texto,
      autor: n.autor,
      creadoEn: iso(n.creadoEn)!,
    }));
  }

  async agregarNota(
    auth: ContextoAuth,
    id: string,
    texto: string,
    cliente: InfoCliente,
  ): Promise<NotaPublica> {
    return this.prisma.$transaction(async (tx) => {
      await this.exigirAlcance(auth, id, tx);
      const n = await tx.notaInterna.create({
        data: { clienteId: id, autorId: auth.usuario.id, texto },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cliente.nota_agregada',
          entidad: 'cliente',
          entidadId: id,
          despues: { notaId: n.id },
          cliente,
        },
        tx,
      );
      return {
        id: n.id,
        texto: n.texto,
        autor: { id: auth.usuario.id, nombre: auth.usuario.nombre },
        creadoEn: iso(n.creadoEn)!,
      };
    });
  }

  /** Crea la cuenta de acceso del cliente y le envía una invitación a su correo. */
  async invitar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<ClienteDetalle> {
    const { usuario, token } = await this.prisma.$transaction(async (tx) => {
      const c = await this.exigirAlcance(auth, id, tx);
      if (c.usuarioId) {
        throw new ErrorApp(409, 'CLIENTE_CON_ACCESO', 'Este cliente ya tiene acceso a su panel.');
      }
      if (!c.correo) {
        throw new ErrorApp(409, 'CLIENTE_SIN_CORREO', 'Añade primero el correo del cliente.', {
          correo: ['Añade el correo del cliente.'],
        });
      }
      if (await tx.usuario.findUnique({ where: { correo: c.correo } })) {
        throw new ErrorApp(409, 'CORREO_EN_USO', 'Ya existe una cuenta con ese correo.');
      }
      const usuario = await tx.usuario.create({
        data: { correo: c.correo, nombre: c.nombre, rol: 'cliente' },
      });
      await tx.cliente.update({ where: { id }, data: { usuarioId: usuario.id } });
      const token = await this.tokens.emitir(usuario.id, 'invitacion', tx);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cliente.invitado',
          entidad: 'cliente',
          entidadId: id,
          despues: { usuarioId: usuario.id, correo: usuario.correo },
          cliente,
        },
        tx,
      );
      return { usuario, token };
    });
    await this.correo.enviar(
      usuario.correo,
      'invitacionCliente',
      Plantillas.invitacionCliente(usuario.nombre, this.correo.urlWeb('/invitacion', { token })),
    );
    return this.obtener(auth, id);
  }

  /**
   * Ficha de cliente de una cuenta con rol cliente. Se crea al registrarse; si
   * la cuenta es anterior o cambió de rol, se crea aquí la primera vez.
   */
  async deUsuario(usuario: Usuario, tx: Tx | PrismaClient = this.prisma) {
    const existente = await tx.cliente.findUnique({ where: { usuarioId: usuario.id } });
    if (existente) return existente;
    return tx.cliente.upsert({
      where: { usuarioId: usuario.id },
      update: {},
      create: {
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        origen: 'registro_web',
      },
    });
  }

  async actualizarPerfil(
    auth: ContextoAuth,
    entrada: PerfilClienteEntrada,
    cliente: InfoCliente,
  ): Promise<ClienteDetalle> {
    const propio = await this.deUsuario(auth.usuario);
    await this.prisma.$transaction(async (tx) => {
      await tx.cliente.update({
        where: { id: propio.id },
        data: {
          ...(entrada.documento !== undefined ? { documento: entrada.documento } : {}),
          ...(entrada.pais !== undefined ? { pais: entrada.pais } : {}),
          ...(entrada.monedaPreferida ? { monedaPreferida: entrada.monedaPreferida } : {}),
        },
      });
      if (entrada.whatsapp !== undefined) {
        await this.fijarWhatsapp(tx, propio.id, entrada.whatsapp, entrada.aceptaWhatsapp ?? false);
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cliente.perfil_actualizado',
          entidad: 'cliente',
          entidadId: propio.id,
          despues: entrada as Prisma.InputJsonObject,
          cliente,
        },
        tx,
      );
    });
    return this.obtener(auth, propio.id);
  }

  private async fijarWhatsapp(tx: Tx, clienteId: string, numero: string | null, acepta: boolean) {
    await tx.contactoCliente.deleteMany({ where: { clienteId, tipo: 'whatsapp' } });
    if (numero) {
      await tx.contactoCliente.create({
        data: {
          clienteId,
          tipo: 'whatsapp',
          valor: numero,
          consentimientoEn: acepta ? new Date() : null,
        },
      });
    }
  }

  private async exigirVendedor(tx: Tx, usuarioId: string): Promise<void> {
    const u = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!u || u.estado !== 'activo' || !['admin', 'operador', 'ventas'].includes(u.rol)) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Revisa los datos del formulario.', {
        asignadoAId: ['Elige a una persona activa del equipo.'],
      });
    }
  }

  private async exigirCorreoLibre(tx: Tx, correo: string | undefined, excepto?: string) {
    if (!correo) return;
    const otro = await tx.cliente.findFirst({
      where: { correo, ...(excepto ? { id: { not: excepto } } : {}) },
      select: { id: true },
    });
    if (otro) {
      throw new ErrorApp(409, 'CORREO_EN_USO', 'Ya hay un cliente con ese correo.', {
        correo: ['Ya hay un cliente con ese correo.'],
      });
    }
  }
}
