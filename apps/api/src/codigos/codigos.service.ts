import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { BuzonCodigos, PrismaClient } from '@nv/db';
import {
  type ActualizarBuzonEntrada,
  type AsuntoCodigoEntrada,
  type AsuntoCodigoPublico,
  asuntosSugeridos,
  type BuscarCodigoEntrada,
  type BuzonEntrada,
  type BuzonPublico,
  type CodigoDelCliente,
  type EstadoSuscripcion,
  MINUTOS_CODIGO_CLIENTE,
  type MensajeCodigo,
  type ResultadoCodigo,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { contextoUsuario, pistaUsuario } from '../cuentas/cuentas.service.js';
import { LimitesService } from '../limites/limites.service.js';
import { coincideAsunto, leerCorreo } from './extraer.js';
import { type ConexionBuzon, type CorreoLeido, ErrorBuzon, LectorImap } from './lector-imap.js';

/** Consultas del equipo por hora y persona. */
export const LIMITE_CODIGOS_EQUIPO = { maximo: 60, ventanaSegundos: 3600 };
/** Consultas de un cliente cada 10 minutos (cada una abre los buzones). */
export const LIMITE_CODIGOS_CLIENTE = { maximo: 5, ventanaSegundos: 600 };

const VIGENTES: readonly EstadoSuscripcion[] = ['activa', 'en_gracia'];
const MAX_MENSAJES = 5;

const contextoUsuarioBuzon = (id: string) => `buzon:${id}:usuario`;
const contextoClaveBuzon = (id: string) => `buzon:${id}:clave`;

function publico(b: BuzonCodigos): BuzonPublico {
  return {
    id: b.id,
    nombre: b.nombre,
    host: b.host,
    puerto: b.puerto,
    seguro: b.seguro,
    pista: b.pista,
    carpeta: b.carpeta,
    activo: b.activo,
    probadoEn: iso(b.probadoEn),
    ultimoError: b.ultimoError,
  };
}

const buzonRepetido = () =>
  new ErrorApp(409, 'DUPLICADO', 'Ya hay un buzón con ese nombre.', {
    nombre: ['Ya hay un buzón con ese nombre.'],
  });

/**
 * Correos de códigos: buzones IMAP donde llegan los códigos de las cuentas
 * (Netflix, Disney+…), los asuntos que se buscan por servicio y la consulta
 * del último código para el equipo y para el cliente dueño del perfil.
 * El correo y la clave de cada buzón se guardan cifrados.
 */
@Injectable()
export class CodigosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(LectorImap) private readonly lector: LectorImap,
  ) {}

  private conexion(b: BuzonCodigos): ConexionBuzon {
    return {
      host: b.host,
      puerto: b.puerto,
      seguro: b.seguro,
      usuario: this.cifrador.descifrar(b.usuarioCifrado, contextoUsuarioBuzon(b.id)),
      clave: this.cifrador.descifrar(b.claveCifrada, contextoClaveBuzon(b.id)),
      carpeta: b.carpeta,
    };
  }

  // ── Buzones ────────────────────────────────────────────────────────────────

  async buzones(): Promise<BuzonPublico[]> {
    const filas = await this.prisma.buzonCodigos.findMany({
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map(publico);
  }

  async crearBuzon(auth: ContextoAuth, e: BuzonEntrada, cliente: InfoCliente) {
    const id = randomUUID();
    try {
      const b = await this.prisma.buzonCodigos.create({
        data: {
          id,
          nombre: e.nombre,
          host: e.host,
          puerto: e.puerto,
          seguro: e.seguro,
          usuarioCifrado: this.cifrador.cifrar(e.usuario.trim(), contextoUsuarioBuzon(id)),
          pista: pistaUsuario(e.usuario),
          claveCifrada: this.cifrador.cifrar(e.clave, contextoClaveBuzon(id)),
          carpeta: e.carpeta,
          activo: e.activo,
        },
      });
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'buzon_codigos.creado',
        entidad: 'buzon_codigos',
        entidadId: id,
        despues: { nombre: b.nombre, host: b.host, puerto: b.puerto, activo: b.activo },
        cliente,
      });
      return publico(b);
    } catch (err) {
      if (esUnicoDuplicado(err)) throw buzonRepetido();
      throw err;
    }
  }

  async actualizarBuzon(
    auth: ContextoAuth,
    id: string,
    e: ActualizarBuzonEntrada,
    cliente: InfoCliente,
  ): Promise<BuzonPublico> {
    const antes = await this.prisma.buzonCodigos.findUnique({ where: { id } });
    if (!antes) throw Errores.noEncontrado('El buzón');
    const cambiaConexion =
      e.host !== undefined ||
      e.puerto !== undefined ||
      e.seguro !== undefined ||
      e.usuario !== undefined ||
      e.clave !== undefined ||
      e.carpeta !== undefined;
    try {
      const b = await this.prisma.buzonCodigos.update({
        where: { id },
        data: {
          ...(e.nombre !== undefined ? { nombre: e.nombre } : {}),
          ...(e.host !== undefined ? { host: e.host } : {}),
          ...(e.puerto !== undefined ? { puerto: e.puerto } : {}),
          ...(e.seguro !== undefined ? { seguro: e.seguro } : {}),
          ...(e.carpeta !== undefined ? { carpeta: e.carpeta } : {}),
          ...(e.activo !== undefined ? { activo: e.activo } : {}),
          ...(e.usuario !== undefined
            ? {
                usuarioCifrado: this.cifrador.cifrar(e.usuario.trim(), contextoUsuarioBuzon(id)),
                pista: pistaUsuario(e.usuario),
              }
            : {}),
          ...(e.clave
            ? { claveCifrada: this.cifrador.cifrar(e.clave, contextoClaveBuzon(id)) }
            : {}),
          // Datos nuevos: la prueba anterior ya no vale.
          ...(cambiaConexion ? { probadoEn: null, ultimoError: null } : {}),
        },
      });
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'buzon_codigos.actualizado',
        entidad: 'buzon_codigos',
        entidadId: id,
        antes: {
          nombre: antes.nombre,
          host: antes.host,
          puerto: antes.puerto,
          activo: antes.activo,
        },
        despues: {
          nombre: b.nombre,
          host: b.host,
          puerto: b.puerto,
          activo: b.activo,
          claveCambiada: Boolean(e.clave),
          usuarioCambiado: e.usuario !== undefined,
        },
        cliente,
      });
      return publico(b);
    } catch (err) {
      if (esUnicoDuplicado(err)) throw buzonRepetido();
      throw err;
    }
  }

  async eliminarBuzon(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<void> {
    const antes = await this.prisma.buzonCodigos.findUnique({ where: { id } });
    if (!antes) throw Errores.noEncontrado('El buzón');
    await this.prisma.buzonCodigos.delete({ where: { id } });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'buzon_codigos.eliminado',
      entidad: 'buzon_codigos',
      entidadId: id,
      antes: { nombre: antes.nombre, host: antes.host },
      cliente,
    });
  }

  /** Conecta con el buzón y guarda si funcionó. */
  async probarBuzon(id: string): Promise<BuzonPublico> {
    const b = await this.prisma.buzonCodigos.findUnique({ where: { id } });
    if (!b) throw Errores.noEncontrado('El buzón');
    let error: string | null = null;
    try {
      await this.lector.probar(this.conexion(b));
    } catch (err) {
      error = err instanceof ErrorBuzon ? err.message : 'No se pudo leer el buzón.';
    }
    const actualizado = await this.prisma.buzonCodigos.update({
      where: { id },
      data: { probadoEn: new Date(), ultimoError: error },
    });
    return publico(actualizado);
  }

  // ── Asuntos por servicio ───────────────────────────────────────────────────

  async asuntos(): Promise<AsuntoCodigoPublico[]> {
    const filas = await this.prisma.asuntoCodigo.findMany({
      include: { servicio: { select: { id: true, nombre: true } } },
      orderBy: [{ servicio: { nombre: 'asc' } }, { asunto: 'asc' }],
    });
    return filas.map((a) => ({
      id: a.id,
      servicio: a.servicio,
      asunto: a.asunto,
      activo: a.activo,
    }));
  }

  async crearAsunto(auth: ContextoAuth, e: AsuntoCodigoEntrada, cliente: InfoCliente) {
    const s = await this.prisma.servicio.findUnique({
      where: { id: e.servicioId },
      select: { id: true },
    });
    if (!s) throw Errores.noEncontrado('El servicio');
    try {
      const a = await this.prisma.asuntoCodigo.create({
        data: { servicioId: e.servicioId, asunto: e.asunto },
      });
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'asunto_codigo.creado',
        entidad: 'asunto_codigo',
        entidadId: a.id,
        despues: { servicioId: e.servicioId, asunto: e.asunto },
        cliente,
      });
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(409, 'DUPLICADO', 'Ese asunto ya está en el servicio.', {
          asunto: ['Ese asunto ya está en el servicio.'],
        });
      }
      throw err;
    }
    return this.asuntos();
  }

  /** Agrega los asuntos sugeridos para el servicio que todavía no estén. */
  async sugerirAsuntos(auth: ContextoAuth, servicioId: string, cliente: InfoCliente) {
    const s = await this.prisma.servicio.findUnique({
      where: { id: servicioId },
      select: { id: true, nombre: true, slug: true },
    });
    if (!s) throw Errores.noEncontrado('El servicio');
    const sugeridos = asuntosSugeridos(`${s.nombre} ${s.slug}`);
    if (sugeridos.length === 0) {
      throw new ErrorApp(
        409,
        'SIN_SUGERENCIAS',
        `No hay asuntos sugeridos para ${s.nombre}. Escribe el asunto de uno de sus correos.`,
      );
    }
    const r = await this.prisma.asuntoCodigo.createMany({
      data: sugeridos.map((asunto) => ({ servicioId, asunto })),
      skipDuplicates: true,
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'asunto_codigo.sugeridos',
      entidad: 'servicio',
      entidadId: servicioId,
      despues: { agregados: r.count },
      cliente,
    });
    return this.asuntos();
  }

  async eliminarAsunto(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    const a = await this.prisma.asuntoCodigo.findUnique({ where: { id } });
    if (!a) throw Errores.noEncontrado('El asunto');
    await this.prisma.asuntoCodigo.delete({ where: { id } });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'asunto_codigo.eliminado',
      entidad: 'asunto_codigo',
      entidadId: id,
      antes: { servicioId: a.servicioId, asunto: a.asunto },
      cliente,
    });
    return this.asuntos();
  }

  /** Servicios con asuntos activos, si hay al menos un buzón activo. */
  async serviciosConCodigos(): Promise<Set<string>> {
    const [buzones, filas] = await Promise.all([
      this.prisma.buzonCodigos.count({ where: { activo: true } }),
      this.prisma.asuntoCodigo.findMany({
        where: { activo: true },
        select: { servicioId: true },
        distinct: ['servicioId'],
      }),
    ]);
    return buzones > 0 ? new Set(filas.map((f) => f.servicioId)) : new Set();
  }

  // ── Consultas ──────────────────────────────────────────────────────────────

  /** Lee todos los buzones activos y devuelve los correos para `para`, filtrados por asunto. */
  private async leer(
    para: string,
    servicioId: string | null,
    minutos: number,
    exigirAsuntos: boolean,
  ): Promise<ResultadoCodigo> {
    const [buzones, asuntos] = await Promise.all([
      this.prisma.buzonCodigos.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      servicioId
        ? this.prisma.asuntoCodigo.findMany({
            where: { servicioId, activo: true },
            select: { asunto: true },
          })
        : Promise.resolve([]),
    ]);
    if (buzones.length === 0) {
      throw new ErrorApp(
        409,
        'SIN_BUZONES',
        'Todavía no hay buzones de correo activos. Agrégalos en «Correos de códigos».',
      );
    }
    if (exigirAsuntos && asuntos.length === 0) {
      throw new ErrorApp(409, 'SIN_ASUNTOS', 'Este servicio no tiene códigos por correo.');
    }
    const desde = new Date(Date.now() - minutos * 60_000);
    const resultados = await Promise.all(
      buzones.map(async (b) => {
        try {
          const correos = await this.lector.buscar(this.conexion(b), para, desde);
          if (b.ultimoError) {
            await this.prisma.buzonCodigos.update({
              where: { id: b.id },
              data: { ultimoError: null, probadoEn: new Date() },
            });
          }
          return { correos, error: null };
        } catch (err) {
          const mensaje = err instanceof ErrorBuzon ? err.message : 'No se pudo leer el buzón.';
          await this.prisma.buzonCodigos.update({
            where: { id: b.id },
            data: { ultimoError: mensaje, probadoEn: new Date() },
          });
          return { correos: [] as CorreoLeido[], error: { nombre: b.nombre, error: mensaje } };
        }
      }),
    );
    const lista = asuntos.map((a) => a.asunto);
    const mensajes: MensajeCodigo[] = resultados
      .flatMap((r) => r.correos)
      .filter((c) => lista.length === 0 || coincideAsunto(c.asunto, lista))
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
      .slice(0, MAX_MENSAJES)
      .map((c) => ({
        asunto: c.asunto.slice(0, 200),
        de: c.de.slice(0, 200),
        recibidoEn: c.fecha.toISOString(),
        ...leerCorreo(c.asunto, c.texto, c.html),
      }));
    return {
      mensajes,
      buzonesConError: resultados.flatMap((r) => (r.error ? [r.error] : [])),
      sinFiltroAsunto: lista.length === 0,
    };
  }

  private async registrarConsulta(
    usuarioId: string,
    cuentaId: string | null,
    r: ResultadoCodigo | null,
  ) {
    await this.prisma.consultaCodigo.create({
      data: {
        usuarioId,
        cuentaId,
        resultado: !r
          ? 'error'
          : r.mensajes.length > 0
            ? 'encontrado'
            : r.buzonesConError.length > 0
              ? 'error'
              : 'sin_resultados',
      },
    });
  }

  /** El equipo busca el último código de una cuenta guardada o de un correo escrito a mano. */
  async buscar(
    auth: ContextoAuth,
    e: BuscarCodigoEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoCodigo> {
    await this.limites.consumir(`codigos:${auth.usuario.id}`, LIMITE_CODIGOS_EQUIPO);
    let para: string;
    let servicioId = e.servicioId ?? null;
    let cuentaId: string | null = null;
    if (e.cuentaId) {
      const c = await this.prisma.cuentaServicio.findUnique({
        where: { id: e.cuentaId },
        select: { id: true, servicioId: true, usuarioCifrado: true },
      });
      if (!c) throw Errores.noEncontrado('La cuenta');
      para = this.cifrador.descifrar(c.usuarioCifrado, contextoUsuario(c.id)).trim().toLowerCase();
      servicioId = c.servicioId;
      cuentaId = c.id;
      if (!para.includes('@')) {
        throw new ErrorApp(409, 'SIN_CORREO', 'Esta cuenta usa un usuario, no un correo.');
      }
    } else {
      para = e.correo!;
    }
    let r: ResultadoCodigo | null = null;
    try {
      r = await this.leer(para, servicioId, e.minutos, false);
      return r;
    } finally {
      await this.registrarConsulta(auth.usuario.id, cuentaId, r);
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'codigo.consultado',
        entidad: cuentaId ? 'cuenta_servicio' : 'buzon_codigos',
        entidadId: cuentaId,
        despues: {
          porCuenta: Boolean(cuentaId),
          servicioId,
          minutos: e.minutos,
          encontrados: r?.mensajes.length ?? 0,
        },
        cliente,
      });
    }
  }

  /** El cliente pide el último código de su propio perfil (suscripción vigente). */
  async buscarMio(
    auth: ContextoAuth,
    suscripcionId: string,
    cliente: InfoCliente,
  ): Promise<CodigoDelCliente | null> {
    await this.limites.consumir(`codigos_cliente:${auth.usuario.id}`, LIMITE_CODIGOS_CLIENTE);
    const s = await this.prisma.suscripcion.findFirst({
      where: { id: suscripcionId, cliente: { usuarioId: auth.usuario.id } },
      select: {
        estado: true,
        perfilCuenta: {
          select: {
            cuenta: {
              select: { id: true, estado: true, servicioId: true, usuarioCifrado: true },
            },
          },
        },
      },
    });
    const c = s?.perfilCuenta?.cuenta;
    if (!s || !c) throw Errores.noEncontrado('El perfil');
    if (!VIGENTES.includes(s.estado)) {
      throw new ErrorApp(409, 'PERFIL_NO_DISPONIBLE', 'Tu suscripción no está vigente.');
    }
    if (c.estado !== 'activa') {
      throw new ErrorApp(409, 'CUENTA_EN_REVISION', 'Estamos revisando esta cuenta.');
    }
    const para = this.cifrador
      .descifrar(c.usuarioCifrado, contextoUsuario(c.id))
      .trim()
      .toLowerCase();
    let r: ResultadoCodigo | null = null;
    try {
      r = await this.leer(para, c.servicioId, MINUTOS_CODIGO_CLIENTE, true);
    } finally {
      await this.registrarConsulta(auth.usuario.id, c.id, r);
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'codigo.consultado_por_cliente',
        entidad: 'cuenta_servicio',
        entidadId: c.id,
        despues: { suscripcionId, encontrado: Boolean(r?.mensajes.length) },
        cliente,
      });
    }
    const m = r.mensajes.find((x) => x.codigo || x.enlace);
    return m ? { codigo: m.codigo, enlace: m.enlace, recibidoEn: m.recibidoEn } : null;
  }
}
