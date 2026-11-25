import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConectorCodigos, Prisma, PrismaClient } from '@nv/db';
import {
  ACCIONES_POR_PLATAFORMA,
  ACCIONES_PROVEEDOR,
  type AccionProveedor,
  type ConectorEntrada,
  type ConectorPublico,
  type DiagnosticoConector,
  type EstadoConector,
  type EstadoSuscripcion,
  type PedirProveedorEntrada,
  type PlataformaProveedor,
  plataformaProveedor,
  type ResultadoProveedor,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { contextoUsuario, pistaUsuario } from '../cuentas/cuentas.service.js';
import { LimitesService } from '../limites/limites.service.js';
import { revendedorPropio } from '../revendedores/libro-mayor.js';
import { LIMITE_CODIGOS_CLIENTE, LIMITE_CODIGOS_EQUIPO } from './codigos.service.js';
import { leerRespuestaProveedor } from './extraer-proveedor.js';
import { ErrorBuzon, LectorImap } from './lector-imap.js';
import { ErrorRobot, RobotProveedor } from './robot-proveedor.js';

/** Único conector por ahora. */
export const NOMBRE_CONECTOR = 'ikercuentas';
const URL_PREDETERMINADA = 'https://ikercuentas.com';
const REMITENTE_PREDETERMINADO = 'no-reply@ikercuentas.com';
const VIGENTES: readonly EstadoSuscripcion[] = ['activa', 'en_gracia'];
/** Cuánto se espera el correo de aprobación de IP. */
const ESPERA_APROBACION_MS = 120_000;

const ctxUsuario = (id: string) => `conector:${id}:usuario`;
const ctxClave = (id: string) => `conector:${id}:clave`;
const ctxSesion = (id: string) => `conector:${id}:sesion`;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ¿La cuenta se compró en este proveedor? Compara el campo «Proveedor» sin tildes ni mayúsculas. */
export function esDelProveedor(proveedorCuenta: string | null, marca: string): boolean {
  if (!proveedorCuenta || !marca.trim()) return false;
  const n = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return n(proveedorCuenta).includes(n(marca));
}

/** Botones del proveedor que ve un cliente para una cuenta, según el servicio y el conector. */
export function accionesDelProveedor(
  conector: Pick<ConectorCodigos, 'activo' | 'marcaProveedor' | 'accionesCliente'> | null,
  cuenta: { proveedor: string | null; servicio: { nombre: string } },
): AccionProveedor[] {
  if (!conector?.activo || !esDelProveedor(cuenta.proveedor, conector.marcaProveedor)) return [];
  const plataforma = plataformaProveedor(cuenta.servicio.nombre);
  if (!plataforma) return [];
  return ACCIONES_POR_PLATAFORMA[plataforma].filter((a) => conector.accionesCliente.includes(a));
}

/** Enlace de aprobación de IP dentro del correo: solo del host del panel y su ruta approve-ip. */
export function enlaceAprobacion(texto: string, urlBase: string): string | null {
  const host = new URL(urlBase).hostname.toLowerCase();
  for (const m of texto.matchAll(/https:\/\/[^\s"'<>]+/gi)) {
    const crudo = m[0].replace(/&amp;/g, '&').replace(/[).,;>\]]+$/, '');
    try {
      const u = new URL(crudo);
      const h = u.hostname.toLowerCase();
      if ((h === host || h === `www.${host}`) && /^\/api\/auth\/approve-ip\b/i.test(u.pathname)) {
        return u.toString();
      }
    } catch {
      // Enlace mal formado: se ignora.
    }
  }
  return null;
}

/**
 * Conector con el panel de un proveedor de cuentas (ikercuentas.com): guarda el
 * usuario y la clave cifrados, aprueba la IP del servidor leyendo el correo
 * «Nuevo dispositivo detectado» y pulsa los botones de códigos para el equipo,
 * los clientes y los revendedores. Los códigos nunca se guardan ni se registran.
 */
@Injectable()
export class ConectorCodigosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(LectorImap) private readonly lector: LectorImap,
    @Inject(RobotProveedor) private readonly robot: RobotProveedor,
  ) {}

  private publico(c: ConectorCodigos | null): ConectorPublico {
    return {
      nombre: NOMBRE_CONECTOR,
      activo: c?.activo ?? false,
      urlBase: c?.urlBase ?? URL_PREDETERMINADA,
      pista: c?.pista ?? null,
      tieneClave: Boolean(c?.claveCifrada),
      marcaProveedor: c?.marcaProveedor ?? 'Iker',
      buzonId: c?.buzonId ?? null,
      carpetaAprobacion: c?.carpetaAprobacion ?? 'NV-Iker',
      remitenteAprobacion: c?.remitenteAprobacion ?? REMITENTE_PREDETERMINADO,
      // Por defecto los clientes ven todos los botones (también «Link»: pueden cambiar la clave).
      accionesCliente: (c?.accionesCliente ?? [...ACCIONES_PROVEEDOR]) as AccionProveedor[],
      estado: (c?.estado ?? 'sin_probar') as EstadoConector,
      ultimoError: c?.ultimoError ?? null,
      probadoEn: iso(c?.probadoEn ?? null),
      diagnostico: (c?.diagnostico ?? null) as DiagnosticoConector | null,
    };
  }

  private fila() {
    return this.prisma.conectorCodigos.findUnique({ where: { nombre: NOMBRE_CONECTOR } });
  }

  async ver(): Promise<ConectorPublico> {
    return this.publico(await this.fila());
  }

  async guardar(
    auth: ContextoAuth,
    e: ConectorEntrada,
    cliente: InfoCliente,
  ): Promise<ConectorPublico> {
    const previo = await this.fila();
    const id = previo?.id ?? randomUUID();
    if (e.buzonId) {
      const b = await this.prisma.buzonCodigos.findUnique({ where: { id: e.buzonId } });
      if (!b) throw Errores.noEncontrado('El buzón');
    }
    const cambiaAcceso = Boolean(e.usuario || e.clave) || previo?.urlBase !== e.urlBase;
    const datos = {
      urlBase: e.urlBase,
      marcaProveedor: e.marcaProveedor,
      buzonId: e.buzonId,
      carpetaAprobacion: e.carpetaAprobacion,
      remitenteAprobacion: e.remitenteAprobacion,
      accionesCliente: [...new Set(e.accionesCliente)],
      activo: e.activo,
      ...(e.usuario
        ? {
            usuarioCifrado: this.cifrador.cifrar(e.usuario, ctxUsuario(id)),
            pista: pistaUsuario(e.usuario),
          }
        : {}),
      ...(e.clave ? { claveCifrada: this.cifrador.cifrar(e.clave, ctxClave(id)) } : {}),
      // Otro usuario u otra dirección: la sesión guardada ya no sirve.
      ...(cambiaAcceso && previo
        ? { sesionCifrada: null, estado: 'sin_probar', ultimoError: null }
        : {}),
    };
    if (e.activo && !(e.usuario || previo?.usuarioCifrado)) {
      throw new ErrorApp(422, 'VALIDACION', 'Escribe el correo del panel del proveedor.', {
        usuario: ['Escribe el correo del panel del proveedor.'],
      });
    }
    if (e.activo && !(e.clave || previo?.claveCifrada)) {
      throw new ErrorApp(422, 'VALIDACION', 'Escribe la clave del panel del proveedor.', {
        clave: ['Escribe la clave del panel del proveedor.'],
      });
    }
    const c = previo
      ? await this.prisma.conectorCodigos.update({ where: { id }, data: datos })
      : await this.prisma.conectorCodigos.create({
          data: { id, nombre: NOMBRE_CONECTOR, ...datos },
        });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: previo ? 'conector_codigos.actualizado' : 'conector_codigos.creado',
      entidad: 'conector_codigos',
      entidadId: id,
      despues: {
        activo: c.activo,
        urlBase: c.urlBase,
        marcaProveedor: c.marcaProveedor,
        buzonId: c.buzonId,
        accionesCliente: c.accionesCliente,
        cambioUsuario: Boolean(e.usuario),
        cambioClave: Boolean(e.clave),
      },
      cliente,
    });
    return this.publico(c);
  }

  // ── Robot ──────────────────────────────────────────────────────────────────

  private credenciales(c: ConectorCodigos) {
    if (!c.usuarioCifrado || !c.claveCifrada) {
      throw new ErrorApp(
        409,
        'CONECTOR_SIN_DATOS',
        'Falta guardar el correo y la clave del panel del proveedor.',
      );
    }
    let sesion: string | null = null;
    if (c.sesionCifrada) {
      try {
        sesion = this.cifrador.descifrar(c.sesionCifrada, ctxSesion(c.id));
      } catch {
        sesion = null;
      }
    }
    return {
      urlBase: c.urlBase,
      usuario: this.cifrador.descifrar(c.usuarioCifrado, ctxUsuario(c.id)),
      clave: this.cifrador.descifrar(c.claveCifrada, ctxClave(c.id)),
      sesion,
      aprobar: (desde: Date) => this.esperarAprobacion(c, desde),
    };
  }

  /** Lee el buzón hasta que llegue el correo con el enlace de aprobación de IP. */
  private async esperarAprobacion(c: ConectorCodigos, desde: Date): Promise<string | null> {
    if (!c.buzonId) return null;
    const b = await this.prisma.buzonCodigos.findUnique({ where: { id: c.buzonId } });
    if (!b) return null;
    await this.prisma.conectorCodigos.update({
      where: { id: c.id },
      data: { estado: 'esperando_aprobacion' },
    });
    const conexion = {
      host: b.host,
      puerto: b.puerto,
      seguro: b.seguro,
      usuario: this.cifrador.descifrar(b.usuarioCifrado, `buzon:${b.id}:usuario`),
      clave: this.cifrador.descifrar(b.claveCifrada, `buzon:${b.id}:clave`),
      carpeta: c.carpetaAprobacion,
    };
    const limite = Date.now() + ESPERA_APROBACION_MS;
    while (Date.now() < limite) {
      await espera(5000);
      try {
        const correos = await this.lector.deRemitente(conexion, c.remitenteAprobacion, desde);
        for (const correo of correos) {
          const enlace = enlaceAprobacion(`${correo.html ?? ''}\n${correo.texto ?? ''}`, c.urlBase);
          if (enlace) return enlace;
        }
      } catch (err) {
        if (err instanceof ErrorBuzon) return null;
        throw err;
      }
    }
    return null;
  }

  private async anotar(
    c: ConectorCodigos,
    r: {
      estado: EstadoConector;
      error?: string | null;
      sesion?: string | null;
      diag?: DiagnosticoConector | null;
    },
  ) {
    await this.prisma.conectorCodigos.update({
      where: { id: c.id },
      data: {
        estado: r.estado,
        ultimoError: r.error ?? null,
        probadoEn: new Date(),
        ...(r.sesion ? { sesionCifrada: this.cifrador.cifrar(r.sesion, ctxSesion(c.id)) } : {}),
        ...(r.diag ? { diagnostico: r.diag as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /** Entra al panel (aprobando la IP si hace falta) y guarda la sesión. */
  async probar(auth: ContextoAuth, cliente: InfoCliente): Promise<ConectorPublico> {
    const c = await this.fila();
    if (!c) throw Errores.noEncontrado('El conector');
    try {
      const r = await this.robot.entrar(this.credenciales(c));
      await this.anotar(c, { estado: 'conectado', sesion: r.sesion, diag: r.diagnostico });
    } catch (err) {
      if (!(err instanceof ErrorRobot)) throw err;
      await this.anotar(c, {
        estado: err.motivo === 'APROBACION' ? 'esperando_aprobacion' : 'error',
        error: err.message,
        sesion: err.sesion,
        diag: err.diagnostico,
      });
    }
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'conector_codigos.probado',
      entidad: 'conector_codigos',
      entidadId: c.id,
      cliente,
    });
    return this.ver();
  }

  private async pulsar(
    c: ConectorCodigos,
    correoCuenta: string,
    plataforma: PlataformaProveedor,
    accion: AccionProveedor,
  ): Promise<ResultadoProveedor> {
    if (!ACCIONES_POR_PLATAFORMA[plataforma].includes(accion)) {
      throw new ErrorApp(409, 'ACCION_NO_DISPONIBLE', 'Esa plataforma no tiene ese botón.');
    }
    try {
      const r = await this.robot.pulsar({
        ...this.credenciales(c),
        correoCuenta,
        plataforma,
        accion,
      });
      const host = new URL(c.urlBase).hostname.toLowerCase();
      const l = leerRespuestaProveedor(accion, r.textos, host);
      await this.anotar(c, { estado: 'conectado', sesion: r.sesion, diag: r.diagnostico });
      return {
        codigo: l.codigo,
        enlace: l.enlace,
        mensaje:
          l.codigo || l.enlace
            ? null
            : (l.mensaje ??
              'El proveedor no mostró ningún código. Espera un minuto y vuelve a intentar.'),
        obtenidoEn: new Date().toISOString(),
      };
    } catch (err) {
      if (!(err instanceof ErrorRobot)) throw err;
      const delPanel = ['NO_ENCONTRADA', 'SIN_BOTON'].includes(err.motivo);
      await this.anotar(c, {
        estado: delPanel
          ? 'conectado'
          : err.motivo === 'APROBACION'
            ? 'esperando_aprobacion'
            : 'error',
        error: delPanel ? null : err.message,
        sesion: err.sesion,
        diag: err.diagnostico,
      });
      throw new ErrorApp(
        delPanel ? 404 : 502,
        err.motivo === 'NO_ENCONTRADA' ? 'CUENTA_NO_ENCONTRADA_PROVEEDOR' : 'PROVEEDOR_NO_RESPONDE',
        err.message,
      );
    }
  }

  private async activo(): Promise<ConectorCodigos> {
    const c = await this.fila();
    if (!c?.activo) {
      throw new ErrorApp(409, 'CONECTOR_INACTIVO', 'La conexión con el proveedor no está activa.');
    }
    return c;
  }

  /** El equipo pulsa un botón para una cuenta guardada o un correo escrito a mano. */
  async pedir(
    auth: ContextoAuth,
    e: PedirProveedorEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoProveedor> {
    await this.limites.consumir(`codigos:${auth.usuario.id}`, LIMITE_CODIGOS_EQUIPO);
    const c = await this.fila();
    if (!c) throw Errores.noEncontrado('El conector');
    let correo: string;
    let plataforma: PlataformaProveedor | null = e.plataforma ?? null;
    let cuentaId: string | null = null;
    if (e.cuentaId) {
      const cuenta = await this.prisma.cuentaServicio.findUnique({
        where: { id: e.cuentaId },
        select: { id: true, usuarioCifrado: true, servicio: { select: { nombre: true } } },
      });
      if (!cuenta) throw Errores.noEncontrado('La cuenta');
      correo = this.cifrador
        .descifrar(cuenta.usuarioCifrado, contextoUsuario(cuenta.id))
        .trim()
        .toLowerCase();
      plataforma = plataformaProveedor(cuenta.servicio.nombre);
      cuentaId = cuenta.id;
    } else {
      correo = e.correo!;
    }
    if (!plataforma) {
      throw new ErrorApp(
        409,
        'ACCION_NO_DISPONIBLE',
        'Elige la plataforma (Netflix, Disney+ o HBO Max).',
      );
    }
    let r: ResultadoProveedor | null = null;
    try {
      r = await this.pulsar(c, correo, plataforma, e.accion);
      return r;
    } finally {
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'codigo_proveedor.consultado',
        entidad: cuentaId ? 'cuenta_servicio' : 'conector_codigos',
        entidadId: cuentaId ?? c.id,
        despues: {
          porCuenta: Boolean(cuentaId),
          plataforma,
          boton: e.accion,
          encontrado: Boolean(r?.codigo || r?.enlace),
        },
        cliente,
      });
    }
  }

  accionesPara(
    conector: Parameters<typeof accionesDelProveedor>[0],
    cuenta: Parameters<typeof accionesDelProveedor>[1],
  ): AccionProveedor[] {
    return accionesDelProveedor(conector, cuenta);
  }

  /** El cliente pulsa un botón del proveedor para su propio perfil. */
  pedirMio(
    auth: ContextoAuth,
    suscripcionId: string,
    accion: AccionProveedor,
    cliente: InfoCliente,
  ) {
    return this.pedirDe(
      auth,
      suscripcionId,
      accion,
      { cliente: { usuarioId: auth.usuario.id } },
      'codigo_proveedor.consultado_por_cliente',
      cliente,
    );
  }

  /** El revendedor pulsa un botón del proveedor para un perfil de su cartera. */
  async pedirDeRevendedor(
    auth: ContextoAuth,
    suscripcionId: string,
    accion: AccionProveedor,
    cliente: InfoCliente,
  ) {
    const r = await revendedorPropio(auth, this.prisma);
    return this.pedirDe(
      auth,
      suscripcionId,
      accion,
      { revendedorId: r.id },
      'codigo_proveedor.consultado_por_revendedor',
      cliente,
    );
  }

  private async pedirDe(
    auth: ContextoAuth,
    suscripcionId: string,
    accion: AccionProveedor,
    dueno: Prisma.SuscripcionWhereInput,
    accionAuditoria: string,
    cliente: InfoCliente,
  ): Promise<ResultadoProveedor> {
    await this.limites.consumir(`codigos_cliente:${auth.usuario.id}`, LIMITE_CODIGOS_CLIENTE);
    const s = await this.prisma.suscripcion.findFirst({
      where: { id: suscripcionId, ...dueno },
      select: {
        estado: true,
        perfilCuenta: {
          select: {
            cuenta: {
              select: {
                id: true,
                estado: true,
                proveedor: true,
                usuarioCifrado: true,
                servicio: { select: { nombre: true } },
              },
            },
          },
        },
      },
    });
    const cuenta = s?.perfilCuenta?.cuenta;
    if (!s || !cuenta) throw Errores.noEncontrado('El perfil');
    if (!VIGENTES.includes(s.estado)) {
      throw new ErrorApp(409, 'PERFIL_NO_DISPONIBLE', 'Tu suscripción no está vigente.');
    }
    if (cuenta.estado !== 'activa') {
      throw new ErrorApp(409, 'CUENTA_EN_REVISION', 'Estamos revisando esta cuenta.');
    }
    const c = await this.activo();
    if (!this.accionesPara(c, cuenta).includes(accion)) {
      throw new ErrorApp(409, 'ACCION_NO_DISPONIBLE', 'Este perfil no tiene ese botón.');
    }
    const correo = this.cifrador
      .descifrar(cuenta.usuarioCifrado, contextoUsuario(cuenta.id))
      .trim()
      .toLowerCase();
    let r: ResultadoProveedor | null = null;
    try {
      r = await this.pulsar(c, correo, plataformaProveedor(cuenta.servicio.nombre)!, accion);
      return r;
    } finally {
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: accionAuditoria,
        entidad: 'cuenta_servicio',
        entidadId: cuenta.id,
        despues: { suscripcionId, boton: accion, encontrado: Boolean(r?.codigo || r?.enlace) },
        cliente,
      });
    }
  }
}
