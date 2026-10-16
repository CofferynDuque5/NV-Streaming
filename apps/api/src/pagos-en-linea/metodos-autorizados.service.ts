import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IntentoPago, MetodoPagoAutorizado, Prisma, PrismaClient } from '@nv/db';
import type { MetodoAutorizadoPublico } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador, sha256 } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { admiteRecurrente, esPasarela } from './pasarelas.js';
import { INCLUIR_METODO, metodoAutorizadoPublico } from './presentacion.js';
import { RegistroPasarelas } from './registro.service.js';

type Tx = Prisma.TransactionClient;

/** Contexto del cifrado de los tokens: un valor cifrado no sirve en otro campo. */
export const CONTEXTO_TOKEN = 'metodo-autorizado';

/** Ruta de la web donde el cliente ve y revoca sus métodos guardados. */
export const RUTA_METODOS = '/cuenta/metodos-pago';

/**
 * Métodos que el cliente autorizó para cobros automáticos. Sin una fila activa
 * el sistema nunca cobra solo; el cliente la revoca cuando quiera y la
 * revocación desengancha sus suscripciones y cancela los cobros programados.
 */
@Injectable()
export class MetodosAutorizadosService {
  private readonly logger = new Logger('MetodosAutorizados');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
  ) {}

  /** Métodos del propio cliente. */
  async propios(auth: ContextoAuth): Promise<MetodoAutorizadoPublico[]> {
    const c = await this.clientes.deUsuario(auth.usuario);
    return this.deCliente(c.id);
  }

  /** Métodos de un cliente para el equipo (respeta la cartera de ventas). */
  async deClienteConAlcance(auth: ContextoAuth, clienteId: string) {
    await this.clientes.exigirAlcance(auth, clienteId);
    return this.deCliente(clienteId);
  }

  private async deCliente(clienteId: string): Promise<MetodoAutorizadoPublico[]> {
    const filas = await this.prisma.metodoPagoAutorizado.findMany({
      where: { clienteId },
      include: INCLUIR_METODO,
      orderBy: [{ estado: 'asc' }, { autorizadoEn: 'desc' }],
    });
    return filas.map(metodoAutorizadoPublico);
  }

  /**
   * Revoca una autorización (el cliente la suya; el equipo, las de su alcance).
   * Desengancha las suscripciones y cancela los cobros programados.
   */
  async revocar(
    auth: ContextoAuth,
    metodoId: string,
    motivo: string | null,
    cliente: InfoCliente,
    clienteId?: string,
  ): Promise<MetodoAutorizadoPublico> {
    const visible = await this.prisma.metodoPagoAutorizado.findFirst({
      where: {
        id: metodoId,
        ...(clienteId ? { clienteId } : {}),
        cliente: alcanceClientes(auth),
      },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('El método de pago');
    const metodo = await this.prisma.$transaction(async (tx) => {
      const m = await this.bloquear(tx, metodoId);
      if (m.estado !== 'activo') {
        throw new ErrorApp(409, 'METODO_NO_ACTIVO', 'Esta autorización ya no está activa.');
      }
      const desenganchadas = await this.desenganchar(tx, m.id);
      await tx.metodoPagoAutorizado.update({
        where: { id: m.id },
        data: {
          estado: 'revocado',
          revocadoEn: new Date(),
          revocadoPorId: auth.usuario.id,
          motivoEstado:
            motivo ??
            (auth.usuario.rol === 'cliente'
              ? 'Revocada por el cliente.'
              : 'Revocada por el equipo.'),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'metodo_autorizado.revocado',
          entidad: 'metodo_autorizado',
          entidadId: m.id,
          antes: { estado: m.estado },
          despues: { estado: 'revocado', motivo, suscripciones: desenganchadas },
          cliente,
        },
        tx,
      );
      return m;
    });
    // Se avisa a la pasarela para que borre el token (si lo admite). No bloquea la revocación.
    await this.revocarEnPasarela(metodo);
    await this.avisarCliente(metodo, 'metodoAutorizadoRevocado', `revocado:${metodo.id}`);
    const [fila] = await this.prisma.metodoPagoAutorizado.findMany({
      where: { id: metodo.id },
      include: INCLUIR_METODO,
    });
    return metodoAutorizadoPublico(fila!);
  }

  /**
   * La pasarela dijo que el token ya no sirve: el método queda inválido, se
   * desengancha de sus suscripciones y se avisa al cliente. Dentro de `tx`.
   */
  async invalidar(tx: Tx, metodoId: string, motivo: string): Promise<boolean> {
    const m = await this.bloquear(tx, metodoId);
    if (m.estado !== 'activo') return false;
    const desenganchadas = await this.desenganchar(tx, m.id);
    await tx.metodoPagoAutorizado.update({
      where: { id: m.id },
      data: { estado: 'invalido', motivoEstado: motivo.slice(0, 500) },
    });
    await this.auditoria.registrar(
      {
        actorTipo: 'sistema',
        accion: 'metodo_autorizado.invalidado',
        entidad: 'metodo_autorizado',
        entidadId: m.id,
        antes: { estado: m.estado },
        despues: { estado: 'invalido', motivo, suscripciones: desenganchadas },
      },
      tx,
    );
    return true;
  }

  /** Aviso al cliente de que su método quedó inválido (después de confirmar la transacción). */
  async avisarInvalido(metodoId: string): Promise<void> {
    const m = await this.prisma.metodoPagoAutorizado.findUnique({ where: { id: metodoId } });
    if (m) await this.avisarCliente(m, 'metodoAutorizadoInvalido', `invalido:${m.id}`);
  }

  /** Webhook "token revocado": busca el método por su token (se comparan descifrados). */
  async invalidarPorToken(pasarela: string, huellaToken: string, motivo: string): Promise<number> {
    const candidatos = await this.prisma.metodoPagoAutorizado.findMany({
      where: { pasarela, estado: 'activo' },
      select: { id: true, tokenCifrado: true },
    });
    let n = 0;
    for (const c of candidatos) {
      let token: string;
      try {
        token = this.cifrador.descifrar(c.tokenCifrado, CONTEXTO_TOKEN);
      } catch {
        continue;
      }
      if (sha256(token) !== huellaToken) continue;
      const ok = await this.prisma.$transaction((tx) => this.invalidar(tx, c.id, motivo));
      if (ok) {
        n += 1;
        await this.avisarInvalido(c.id);
      }
    }
    return n;
  }

  /**
   * Crea el método autorizado al aprobarse un pago en el que el cliente pidió
   * guardarlo. Copia la evidencia del intento (texto exacto, versión, fecha, IP
   * y navegador) y guarda el token cifrado. Si el intento no traía la
   * autorización, no guarda nada. Dentro de `tx`.
   */
  async crearDesdeIntento(
    tx: Tx,
    intento: IntentoPago,
    guardado: { token: string; descripcion: string },
  ): Promise<MetodoPagoAutorizado | null> {
    if (
      !intento.guardarMetodo ||
      !intento.textoAutorizacion ||
      !intento.versionTexto ||
      !intento.autorizadoEn ||
      !esPasarela(intento.pasarela) ||
      !admiteRecurrente(intento.pasarela) ||
      intento.moneda === 'VES'
    ) {
      return null;
    }
    const m = await tx.metodoPagoAutorizado.create({
      data: {
        clienteId: intento.clienteId,
        pasarela: intento.pasarela,
        metodoCobroId: intento.metodoCobroId,
        tokenCifrado: this.cifrador.cifrar(guardado.token, CONTEXTO_TOKEN),
        descripcion: guardado.descripcion.slice(0, 120),
        moneda: intento.moneda,
        textoAceptado: intento.textoAutorizacion,
        versionTexto: intento.versionTexto,
        autorizadoEn: intento.autorizadoEn,
        autorizadoIp: intento.autorizadoIp,
        autorizadoAgente: intento.autorizadoAgente,
      },
    });
    await this.auditoria.registrar(
      {
        actorTipo: 'sistema',
        accion: 'metodo_autorizado.creado',
        entidad: 'metodo_autorizado',
        entidadId: m.id,
        despues: {
          clienteId: m.clienteId,
          pasarela: m.pasarela,
          moneda: m.moneda,
          descripcion: m.descripcion,
          versionTexto: m.versionTexto,
          intentoId: intento.id,
          ip: intento.autorizadoIp,
        },
      },
      tx,
    );
    return m;
  }

  /** Token en claro para cobrar (solo el núcleo de cobros lo usa, nunca sale de la API). */
  token(m: Pick<MetodoPagoAutorizado, 'tokenCifrado'>): string {
    return this.cifrador.descifrar(m.tokenCifrado, CONTEXTO_TOKEN);
  }

  /**
   * Activa (con un método) o desactiva (null) el cobro automático de una
   * suscripción. Exige un método activo del mismo cliente, una pasarela que
   * admita cobros recurrentes y la misma moneda. Las suscripciones de la
   * cartera de un revendedor no pueden usarlo (les cobra el revendedor).
   */
  async asignar(
    auth: ContextoAuth,
    suscripcionId: string,
    metodoId: string | null,
    cliente: InfoCliente | null,
  ): Promise<{ metodoAutorizadoId: string | null }> {
    const visible = await this.prisma.suscripcion.findFirst({
      where: { id: suscripcionId, cliente: alcanceClientes(auth) },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('La suscripción');
    return this.prisma.$transaction((tx) =>
      this.asignarEnTx(tx, suscripcionId, metodoId, auth.usuario.id, cliente),
    );
  }

  /** Igual que `asignar`, dentro de una transacción (lo usa también la aprobación de un pago). */
  async asignarEnTx(
    tx: Tx,
    suscripcionId: string,
    metodoId: string | null,
    actorId: string | null,
    cliente: InfoCliente | null,
  ): Promise<{ metodoAutorizadoId: string | null }> {
    await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${suscripcionId}::uuid FOR UPDATE`;
    const s = await tx.suscripcion.findUniqueOrThrow({
      where: { id: suscripcionId },
      include: { cliente: { select: { revendedorId: true } } },
    });
    if (metodoId === null) {
      if (s.metodoAutorizadoId === null) return { metodoAutorizadoId: null };
      await tx.suscripcion.update({ where: { id: s.id }, data: { metodoAutorizadoId: null } });
      await this.cancelarProgramados(tx, { suscripcionId: s.id }, 'Cobro automático desactivado.');
      await this.auditoria.registrar(
        {
          actorId,
          accion: 'suscripcion.cobro_automatico_desactivado',
          entidad: 'suscripcion',
          entidadId: s.id,
          antes: { metodoAutorizadoId: s.metodoAutorizadoId },
          despues: { metodoAutorizadoId: null },
          ...(cliente ? { cliente } : {}),
        },
        tx,
      );
      return { metodoAutorizadoId: null };
    }
    const m = await this.bloquear(tx, metodoId);
    if (m.clienteId !== s.clienteId) throw Errores.noEncontrado('El método de pago');
    if (s.revendedorId !== null || s.cliente.revendedorId !== null) {
      throw new ErrorApp(
        409,
        'COBRO_AUTOMATICO_NO_DISPONIBLE',
        'Este servicio lo gestiona un revendedor: el cobro automático no está disponible.',
      );
    }
    if (s.estado === 'cancelada' || s.estado === 'pendiente_pago') {
      throw new ErrorApp(
        409,
        'COBRO_AUTOMATICO_NO_DISPONIBLE',
        s.estado === 'cancelada'
          ? 'La suscripción está cancelada.'
          : 'Paga primero el alta de la suscripción.',
      );
    }
    const noValido = (mensaje: string) =>
      new ErrorApp(400, 'DATOS_INVALIDOS', mensaje, { metodoAutorizadoId: [mensaje] });
    if (m.estado !== 'activo') throw noValido('Ese método ya no está autorizado.');
    if (!esPasarela(m.pasarela) || !admiteRecurrente(m.pasarela)) {
      throw noValido('Esa pasarela no admite cobros automáticos.');
    }
    if (!this.registro.disponible(m.pasarela)) {
      throw noValido('Esa pasarela no está disponible ahora.');
    }
    if (m.moneda !== s.moneda) {
      throw noValido(`El método cobra en ${m.moneda} y la suscripción se paga en ${s.moneda}.`);
    }
    if (s.metodoAutorizadoId === m.id) return { metodoAutorizadoId: m.id };
    await tx.suscripcion.update({ where: { id: s.id }, data: { metodoAutorizadoId: m.id } });
    if (s.metodoAutorizadoId) {
      await this.cancelarProgramados(tx, { suscripcionId: s.id }, 'Cambió el método de cobro.');
    }
    await this.auditoria.registrar(
      {
        actorId,
        accion: 'suscripcion.cobro_automatico_activado',
        entidad: 'suscripcion',
        entidadId: s.id,
        antes: { metodoAutorizadoId: s.metodoAutorizadoId },
        despues: { metodoAutorizadoId: m.id, pasarela: m.pasarela, moneda: m.moneda },
        ...(cliente ? { cliente } : {}),
      },
      tx,
    );
    return { metodoAutorizadoId: m.id };
  }

  /** Cancela los cobros automáticos aún no ejecutados. */
  async cancelarProgramados(
    tx: Tx,
    where: { suscripcionId?: string; metodoId?: string },
    motivo: string,
  ): Promise<number> {
    const r = await tx.cobroAutomatico.updateMany({
      where: { ...where, estado: 'programado' },
      data: { estado: 'cancelado', error: motivo.slice(0, 500) },
    });
    return r.count;
  }

  private async desenganchar(tx: Tx, metodoId: string): Promise<string[]> {
    const subs = await tx.suscripcion.findMany({
      where: { metodoAutorizadoId: metodoId },
      select: { id: true },
    });
    await tx.suscripcion.updateMany({
      where: { metodoAutorizadoId: metodoId },
      data: { metodoAutorizadoId: null },
    });
    await this.cancelarProgramados(tx, { metodoId }, 'La autorización ya no está activa.');
    return subs.map((s) => s.id);
  }

  private async bloquear(tx: Tx, id: string): Promise<MetodoPagoAutorizado> {
    await tx.$queryRaw`SELECT id FROM metodos_pago_autorizados WHERE id = ${id}::uuid FOR UPDATE`;
    const m = await tx.metodoPagoAutorizado.findUnique({ where: { id } });
    if (!m) throw Errores.noEncontrado('El método de pago');
    return m;
  }

  private async revocarEnPasarela(m: MetodoPagoAutorizado): Promise<void> {
    if (!esPasarela(m.pasarela)) return;
    const a = this.registro.adaptador(m.pasarela);
    if (!a.revocarMetodo || !a.configurada()) return;
    try {
      await a.revocarMetodo(this.token(m));
    } catch (e) {
      this.logger.warn(
        `No se pudo borrar el token en ${m.pasarela} (método ${m.id}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Aviso al cliente sobre su método (guardado, revocado o inválido). Nunca lanza. */
  async avisarCliente(
    m: Pick<MetodoPagoAutorizado, 'id' | 'clienteId' | 'descripcion'>,
    plantilla: 'metodoAutorizadoGuardado' | 'metodoAutorizadoRevocado' | 'metodoAutorizadoInvalido',
    clave: string,
  ): Promise<void> {
    try {
      const url = this.correo.urlWeb(RUTA_METODOS);
      await this.avisos.avisar({
        plantilla,
        destinatario: { clienteId: m.clienteId },
        claveUnica: `metodo_autorizado:${clave}`,
        automatizacion: null,
        entidad: { tipo: 'metodo_autorizado', id: m.id },
        contenido: (nombre) => ({ correo: Plantillas[plantilla](nombre, m.descripcion, url) }),
      });
    } catch (e) {
      this.logger.warn(
        `Aviso ${plantilla} no enviado: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
