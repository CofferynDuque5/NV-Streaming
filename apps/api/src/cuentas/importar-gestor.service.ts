import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type {
  CambiarPlataformaLoteEntrada,
  CambioPlataformaLote,
  ClienteGestor,
  ClienteSueltoGestor,
  CuadreGestor,
  CuentaGestor,
  ImportarGestorEntrada,
  LoteGestorPublico,
  PerfilGestor,
} from '@nv/shared';
import { esCorreoProvisionalGestor } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import {
  contextoClave,
  contextoClaveMiembro,
  contextoMiembro,
  contextoPin,
  contextoUsuario,
  CuentasService,
  fechaODb,
  pistaUsuario,
} from './cuentas.service.js';

/** Simulaciones e importaciones por persona y hora. */
export const LIMITE_IMPORTAR_GESTOR = { maximo: 30, ventanaSegundos: 3600 };

type Tx = Prisma.TransactionClient;

/** Nombre para comparar: sin tildes, mayúsculas ni espacios repetidos. */
const nombreComparable = (n: string) =>
  n.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
/**
 * Cliente del Gestor: igual que su «Ficha del cliente», la misma persona es el mismo
 * nombre completo con el mismo contacto. Un revendedor pone su número a varios
 * clientes con nombres distintos: cada uno es un cliente aparte que comparte ese
 * contacto (pedido de Nathan, 20-11-2026). Sin contacto, el nombre y su responsable:
 * dos «María» de revendedores distintos no son la misma.
 */
const claveDe = (c: ClienteGestor) =>
  !c.contacto
    ? c.responsable
      ? `nombre:${c.nombre.toLowerCase()}|resp:${nombreComparable(c.responsable)}`.slice(0, 260)
      : `nombre:${c.nombre.toLowerCase()}`
    : // Un correo es de una sola persona: basta el correo, como antes.
      c.contacto.tipo === 'correo'
      ? c.contacto.valor
      : `${c.contacto.valor}#${nombreComparable(c.nombre)}`.slice(0, 260);
/** Mismo nombre completo, como compara el Gestor (perfilesDe: nombre + contacto). */
const mismoNombre = (a: string, b: string) => a === b;
/** El contacto de una clave (sin el nombre), o null si la clave es solo de nombre. */
const contactoDeClave = (k: string) => (k.startsWith('nombre:') ? null : k.split('#')[0]!);
/** El nombre de una clave con contacto y nombre, o null si la clave es solo el correo. */
const nombreDeClave = (k: string) => (k.includes('#') ? k.slice(k.indexOf('#') + 1) : null);
const claveCliente = (p: PerfilGestor) => claveDe(p.cliente!);

const MOTIVO_SUELTO: Record<ClienteSueltoGestor['motivo'], string> = {
  sin_cuenta: 'en el Gestor no tenía cuenta asignada',
  cuenta_borrada: 'su cuenta del Gestor ya no existía',
  cuenta_sin_correo: 'su cuenta del Gestor no tenía correo',
  repetida: 'su cuenta tenía el mismo correo que otra plataforma',
  papelera: 'estaba en la papelera del Gestor',
};

/** Notas de una cuenta importada: de dónde viene y lo que hay que revisar. */
export function notaCuenta(plataforma: string, c: CuentaGestor, enPanel = false): string {
  const partes = [`Importada del Gestor (${plataforma}).`];
  if (c.revisar) partes.push(c.revisar.endsWith('.') ? c.revisar : `${c.revisar}.`);
  if (enPanel)
    partes.push('Pendiente por revisar: ya había otra cuenta con este correo en el panel.');
  else if (c.correoRepetido && !c.revisar)
    partes.push('Pendiente por revisar: otra cuenta del Gestor tiene este mismo correo.');
  if (esCorreoProvisionalGestor(c.usuario))
    partes.push('En el Gestor no tenía correo: pon el correo real.');
  if (c.papelera) {
    partes.push(
      `Estaba en la papelera del Gestor${c.papelera.borradaEn ? ` (borrada el ${c.papelera.borradaEn})` : ''}.`,
    );
    if (c.papelera.clientes.length) partes.push(`Tenía a: ${c.papelera.clientes.join(', ')}.`);
  }
  return partes.join(' ').slice(0, 1000);
}

/** Nota que acompaña a un cliente que entra sin perfil: por qué y lo que tenía. */
export function notaClienteSuelto(plataforma: string, s: ClienteSueltoGestor): string {
  const partes = [
    `Importado del Gestor (${plataforma}) sin perfil: ${MOTIVO_SUELTO[s.motivo]}${s.borradoEn ? ` (borrado el ${s.borradoEn})` : ''}.`,
    s.venceEn ? `Vencía el ${s.venceEn}.` : 'Sin fecha de vencimiento.',
    Number(s.precioUsd) > 0 ? `Pagaba ${Number(s.precioUsd).toFixed(2)} USD.` : '',
    'Asígnale un perfil cuando lo revises.',
  ];
  return partes.filter(Boolean).join(' ').slice(0, 2000);
}

const hoyUtc = () => new Date().toISOString().slice(0, 10);

interface Plan {
  cuadre: CuadreGestor;
  nuevas: CuentaGestor[];
  /** origenId → huella con la que se guarda (otra, propia, si el correo ya está en el panel o se repite). */
  huellas: Map<string, string>;
  /** origenId de las cuentas cuyo correo ya estaba en el panel o se repite en el lote. */
  repetidasEnPanel: Set<string>;
  /** Clave del cliente → id del cliente que ya existe en el panel. */
  existentes: Map<string, string>;
  /** Clave del cliente → datos del primer perfil (o cliente sin perfil) que lo nombra. */
  porCrear: Map<string, ClienteGestor>;
  /** Clientes que entran sin perfil y aún no se importaron. */
  sueltos: ClienteSueltoGestor[];
  /**
   * Cupos de plan familiar ya importados (con una versión que no traía el correo y la
   * clave del miembro) que hoy no los tienen: se completan, sin tocar lo que ya hay.
   */
  miembros: { perfilId: string; usuario: string | null; clave: string | null }[];
  /**
   * Cupos ya importados que quedaron con otro cliente (el importador viejo unía por el
   * número del revendedor): pasan al cliente que tienen en el Gestor, sin borrar nada.
   */
  separar: { suscripcionId: string; deClienteId: string; cliente: ClienteGestor }[];
}

/**
 * Importación del Gestor viejo (G6): una plataforma por lote, todo o nada.
 * Crea cuentas, perfiles, clientes y sus suscripciones, y deja registrado
 * qué creó para no repetirlo y para poder deshacer el lote. Las claves y los
 * PIN se guardan cifrados; el cuadre y la auditoría solo llevan conteos.
 */
@Injectable()
export class ImportarGestorService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(CuentasService) private readonly cuentas: CuentasService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  private async preparar(auth: ContextoAuth, e: ImportarGestorEntrada) {
    if (auth.usuario.rol !== 'admin') {
      throw new ErrorApp(403, 'SOLO_ADMINISTRACION', 'Solo la administración importa el Gestor.');
    }
    await this.limites.consumir(`importar_gestor:${auth.usuario.id}`, LIMITE_IMPORTAR_GESTOR);
    const plan = await this.prisma.plan.findUnique({
      where: { id: e.planId },
      select: { servicioId: true },
    });
    if (!plan) throw Errores.noEncontrado('El plan');
    if (plan.servicioId !== e.servicioId) {
      throw new ErrorApp(400, 'PLAN_DE_OTRO_SERVICIO', 'El plan no es del servicio elegido.', {
        planId: ['Elige un plan del servicio.'],
      });
    }
    const origenes = e.cuentas.map((c) => c.origenId);
    if (new Set(origenes).size !== origenes.length) {
      throw new ErrorApp(400, 'FILAS_REPETIDAS', 'Hay cuentas repetidas en el envío.');
    }
  }

  /** Qué se crearía. No escribe nada (la importación lo vuelve a calcular dentro de su transacción). */
  private async planear(db: Tx | PrismaClient, e: ImportarGestorEntrada): Promise<Plan> {
    const avisos: string[] = [];
    const ya = await db.registroGestor.findMany({
      where: {
        tipo: 'cuenta',
        entidad: 'cuenta_servicio',
        origenId: { in: e.cuentas.map((c) => c.origenId) },
      },
      select: { origenId: true },
    });
    const importadas = new Set(ya.map((r) => r.origenId));
    const pendientes = e.cuentas.filter((c) => !importadas.has(c.origenId));
    const huellas = pendientes.map((c) => this.cuentas.huella(c.usuario));
    const guardadas = new Set(
      (
        await db.cuentaServicio.findMany({
          where: { usuarioHuella: { in: huellas } },
          select: { usuarioHuella: true },
        })
      ).map((c) => c.usuarioHuella),
    );
    // Nada se pierde: una cuenta cuyo correo ya está en el panel (o se repite en el lote)
    // entra igual, con una huella propia, y queda pendiente por revisar.
    const nuevas = pendientes;
    const usadas = new Set(guardadas);
    const huellasPorOrigen = new Map<string, string>();
    const repetidasEnPanel = new Set<string>();
    for (const [i, c] of pendientes.entries()) {
      let h = huellas[i]!;
      if (usadas.has(h)) {
        repetidasEnPanel.add(c.origenId);
        h = this.cuentas.huella(`${c.usuario}\u0000gestor:${c.origenId}`);
      }
      usadas.add(h);
      huellasPorOrigen.set(c.origenId, h);
    }
    const yaEnPanel = pendientes.filter((_, i) => guardadas.has(huellas[i]!)).length;
    if (yaEnPanel) {
      avisos.push(
        `${yaEnPanel} ${yaEnPanel === 1 ? 'cuenta tiene un correo que ya estaba' : 'cuentas tienen un correo que ya estaba'} en el panel; ${yaEnPanel === 1 ? 'entra igual y queda' : 'entran igual y quedan'} pendiente por revisar.`,
      );
    }

    const miembros = await this.miembrosPorRecuperar(
      db,
      e.cuentas.filter((c) => importadas.has(c.origenId)),
    );
    if (miembros.length) {
      avisos.push(
        `${miembros.length} ${miembros.length === 1 ? 'cupo ya importado recupera' : 'cupos ya importados recuperan'} el correo y la clave del miembro unido al plan (no se cambia nada más).`,
      );
    }

    const porSeparar = await this.cuposPorSeparar(
      db,
      e.cuentas.filter((c) => importadas.has(c.origenId)),
    );
    const perfiles = nuevas.flatMap((c) => c.perfiles);
    const conCliente = perfiles.filter((p) => p.cliente);
    const vistosSuelto = new Set<string>();
    const todosSueltos = (e.clientesSueltos ?? []).filter(
      (x) => !vistosSuelto.has(x.origenId) && vistosSuelto.add(x.origenId),
    );
    const sueltosYa = new Set(
      (
        await db.registroGestor.findMany({
          where: {
            tipo: 'suelto',
            entidad: 'nota_interna',
            origenId: { in: todosSueltos.map((x) => x.origenId) },
          },
          select: { origenId: true },
        })
      ).map((r) => r.origenId),
    );
    const sueltos = todosSueltos.filter((x) => !sueltosYa.has(x.origenId));
    const claves = [
      ...new Set([
        ...conCliente.map(claveCliente),
        ...sueltos.map(claveDe),
        ...porSeparar.map((x) => claveDe(x.cliente)),
      ]),
    ];
    const contactos = [...new Set(claves.map(contactoDeClave).filter((k) => k !== null))];
    const existentes = new Map<string, string>();
    for (const r of await db.registroGestor.findMany({
      where: { tipo: 'cliente', entidad: 'cliente', origenId: { in: claves } },
      select: { origenId: true, entidadId: true },
    })) {
      existentes.set(r.origenId, r.entidadId);
    }
    // Clientes que ya tienen ese contacto (importados antes, cuando la clave era solo el
    // contacto, o creados en NV): se reutiliza solo el que tiene el mismo nombre.
    const candidatos = new Map<string, Set<string>>();
    const agregarCandidato = (valor: string, clienteId: string) => {
      const v = candidatos.get(valor) ?? new Set<string>();
      v.add(clienteId);
      candidatos.set(valor, v);
    };
    for (const r of await db.registroGestor.findMany({
      where: { tipo: 'cliente', entidad: 'cliente', origenId: { in: contactos } },
      select: { origenId: true, entidadId: true },
    })) {
      agregarCandidato(r.origenId, r.entidadId);
    }
    for (const c of await db.contactoCliente.findMany({
      where: { valor: { in: contactos } },
      select: { valor: true, clienteId: true },
    })) {
      agregarCandidato(c.valor, c.clienteId);
    }
    for (const c of await db.cliente.findMany({
      where: { correo: { in: contactos.filter((k) => k.includes('@')), mode: 'insensitive' } },
      select: { correo: true, id: true },
    })) {
      agregarCandidato(c.correo!.toLowerCase(), c.id);
    }
    const idsCandidatos = [...new Set([...candidatos.values()].flatMap((v) => [...v]))];
    const nombreDe = new Map(
      (
        await db.cliente.findMany({
          where: { id: { in: idsCandidatos } },
          select: { id: true, nombre: true },
        })
      ).map((c) => [c.id, nombreComparable(c.nombre)]),
    );
    for (const k of claves) {
      if (existentes.has(k)) continue;
      const contacto = contactoDeClave(k);
      if (!contacto) continue;
      const nombre = nombreDeClave(k);
      const ids = [...(candidatos.get(contacto) ?? [])];
      const mismo =
        nombre === null
          ? ids[0]
          : ids.find((id) => {
              const n = nombreDe.get(id);
              return n !== undefined && mismoNombre(n, nombre);
            });
      if (mismo) existentes.set(k, mismo);
    }
    // Sin contacto y con responsable: antes la clave era solo el nombre; se reutiliza ese
    // cliente solo si tiene el mismo responsable.
    const soloNombre = claves.filter((k) => !existentes.has(k) && k.includes('|resp:'));
    if (soloNombre.length) {
      const viejas = new Map(soloNombre.map((k) => [k.slice(0, k.indexOf('|resp:')), k]));
      const filas = await db.registroGestor.findMany({
        where: { tipo: 'cliente', entidad: 'cliente', origenId: { in: [...viejas.keys()] } },
        select: { origenId: true, entidadId: true },
      });
      const responsableDe = new Map(
        (
          await db.cliente.findMany({
            where: { id: { in: filas.map((f) => f.entidadId) } },
            select: { id: true, responsable: true },
          })
        ).map((c) => [c.id, c.responsable ? nombreComparable(c.responsable) : '']),
      );
      for (const f of filas) {
        const k = viejas.get(f.origenId)!;
        if (responsableDe.get(f.entidadId) === k.slice(k.indexOf('|resp:') + 6)) {
          existentes.set(k, f.entidadId);
        }
      }
    }
    // Solo los que de verdad pasan a otro cliente (con un correo, el correo es la persona).
    const separar = porSeparar.filter((x) => existentes.get(claveDe(x.cliente)) !== x.deClienteId);
    if (separar.length) {
      avisos.push(
        `${separar.length} ${separar.length === 1 ? 'cupo ya importado quedó' : 'cupos ya importados quedaron'} con otro cliente: ${separar.length === 1 ? 'pasa' : 'pasan'} al cliente que ${separar.length === 1 ? 'tiene' : 'tienen'} en el Gestor (nombre y responsable). No se borra nada.`,
      );
    }

    const porCrear = new Map<string, ClienteGestor>();
    for (const c of [
      ...conCliente.map((p) => p.cliente!),
      ...sueltos,
      ...separar.map((x) => x.cliente),
    ]) {
      const k = claveDe(c);
      if (!existentes.has(k) && !porCrear.has(k)) porCrear.set(k, c);
    }
    if (sueltos.length) {
      avisos.push(
        `${sueltos.length} ${sueltos.length === 1 ? 'cliente entra' : 'clientes entran'} sin perfil, con una nota de su vencimiento y lo que pagaba.`,
      );
    }

    const hoy = hoyUtc();
    const sinFecha = conCliente.filter((p) => !p.cliente!.venceEn).length;
    if (sinFecha) {
      avisos.push(
        `${sinFecha} ${sinFecha === 1 ? 'cliente no tiene' : 'clientes no tienen'} fecha de vencimiento en el Gestor: ${sinFecha === 1 ? 'entra activo' : 'entran activos'} y sin fecha, como allá.`,
      );
    }
    const activas = conCliente.filter(
      (p) => !p.cliente!.venceEn || p.cliente!.venceEn >= hoy,
    ).length;
    const suma = (xs: string[]) => xs.reduce((s, x) => s + Number(x), 0).toFixed(2);
    return {
      nuevas,
      huellas: huellasPorOrigen,
      repetidasEnPanel,
      existentes,
      porCrear,
      sueltos,
      miembros,
      separar,
      cuadre: {
        cuentas: {
          enArchivo: e.cuentas.length,
          nuevas: nuevas.length,
          yaEstaban: guardadas.size,
          yaImportadas: importadas.size,
        },
        perfiles: {
          nuevos: perfiles.length,
          libres: perfiles.length - conCliente.length,
          asignados: conCliente.length,
          miembrosRecuperados: miembros.length,
          clientesCorregidos: separar.length,
        },
        clientes: {
          nuevos: porCrear.size,
          existentes: claves.length - porCrear.size,
          sinContacto: [...porCrear.keys()].filter((k) => k.startsWith('nombre:')).length,
          sinPerfil: sueltos.length,
        },
        suscripciones: { activas, vencidas: conCliente.length - activas },
        costoUsd: suma(nuevas.map((c) => c.costoUsd)),
        ventaUsd: suma(conCliente.map((p) => p.cliente!.precioUsd)),
        avisos,
      },
    };
  }

  /**
   * Cupos de cuentas ya importadas cuyo correo o clave de miembro trae el archivo y el
   * panel no tiene. Solo llena lo vacío: nunca reemplaza un dato guardado.
   */
  private async miembrosPorRecuperar(
    db: Tx | PrismaClient,
    cuentas: CuentaGestor[],
  ): Promise<Plan['miembros']> {
    const conMiembro = new Map(
      cuentas
        .flatMap((c) => c.perfiles)
        .filter((p) => p.usuarioMiembro || p.claveMiembro)
        .map((p) => [p.origenId, p] as const),
    );
    if (!conMiembro.size) return [];
    const registros = await db.registroGestor.findMany({
      where: { tipo: 'perfil', entidad: 'perfil_cuenta', origenId: { in: [...conMiembro.keys()] } },
      select: { origenId: true, entidadId: true },
    });
    const origenDe = new Map(registros.map((r) => [r.entidadId, r.origenId]));
    const guardados = await db.perfilCuenta.findMany({
      where: { id: { in: [...origenDe.keys()] } },
      select: { id: true, numero: true, usuarioMiembroCifrado: true, claveMiembroCifrada: true },
    });
    const salida: Plan['miembros'] = [];
    for (const g of guardados) {
      const p = conMiembro.get(origenDe.get(g.id)!)!;
      // El cupo 1 es el titular: entra con los datos de la cuenta.
      if (g.numero === 1) continue;
      const usuario = !g.usuarioMiembroCifrado && p.usuarioMiembro ? p.usuarioMiembro.trim() : null;
      // La clave sola, sin correo del miembro, no sirve: va con el correo nuevo o el guardado.
      const clave =
        !g.claveMiembroCifrada && p.claveMiembro && (usuario || g.usuarioMiembroCifrado)
          ? p.claveMiembro
          : null;
      if (usuario || clave) salida.push({ perfilId: g.id, usuario, clave });
    }
    return salida;
  }

  /**
   * Cupos ya importados cuyo cliente en el panel no tiene el nombre que tiene en el
   * Gestor (el importador viejo los unía por el número del revendedor).
   */
  private async cuposPorSeparar(
    db: Tx | PrismaClient,
    cuentas: CuentaGestor[],
  ): Promise<Plan['separar']> {
    const conCliente = new Map(
      cuentas
        .flatMap((c) => c.perfiles)
        .filter((p) => p.cliente)
        .map((p) => [p.origenId, p.cliente!] as const),
    );
    if (!conCliente.size) return [];
    const registros = await db.registroGestor.findMany({
      where: { tipo: 'perfil', entidad: 'suscripcion', origenId: { in: [...conCliente.keys()] } },
      select: { origenId: true, entidadId: true },
    });
    const origenDe = new Map(registros.map((r) => [r.entidadId, r.origenId]));
    const suscripciones = await db.suscripcion.findMany({
      where: { id: { in: [...origenDe.keys()] } },
      select: { id: true, clienteId: true, cliente: { select: { nombre: true } } },
    });
    const salida: Plan['separar'] = [];
    for (const s of suscripciones) {
      const c = conCliente.get(origenDe.get(s.id)!)!;
      if (mismoNombre(nombreComparable(s.cliente.nombre), nombreComparable(c.nombre))) continue;
      salida.push({ suscripcionId: s.id, deClienteId: s.clienteId, cliente: c });
    }
    return salida;
  }

  /** Completa los cupos de miembro (solo los campos vacíos) y lo deja en la auditoría. */
  private async recuperarMiembros(
    tx: Tx,
    miembros: Plan['miembros'],
    actor: string,
    plataforma: string,
    cliente: InfoCliente,
  ) {
    for (const m of miembros) {
      await tx.perfilCuenta.updateMany({
        where: {
          id: m.perfilId,
          ...(m.usuario ? { usuarioMiembroCifrado: null } : {}),
          ...(m.clave ? { claveMiembroCifrada: null } : {}),
        },
        data: {
          ...(m.usuario
            ? {
                usuarioMiembroCifrado: this.cifrador.cifrar(m.usuario, contextoMiembro(m.perfilId)),
              }
            : {}),
          ...(m.clave
            ? {
                claveMiembroCifrada: this.cifrador.cifrar(
                  m.clave,
                  contextoClaveMiembro(m.perfilId),
                ),
              }
            : {}),
        },
      });
    }
    if (miembros.length) {
      await this.auditoria.registrar(
        {
          actorId: actor,
          accion: 'gestor.miembros_recuperados',
          entidad: 'perfil_cuenta',
          entidadId: miembros[0]!.perfilId,
          despues: {
            plataforma,
            cupos: miembros.length,
            correos: miembros.filter((m) => m.usuario).length,
            claves: miembros.filter((m) => m.clave).length,
          },
          cliente,
        },
        tx,
      );
    }
  }

  async simular(auth: ContextoAuth, e: ImportarGestorEntrada, cliente: InfoCliente) {
    await this.preparar(auth, e);
    const { cuadre } = await this.planear(this.prisma, e);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'gestor.importacion_simulada',
      entidad: 'servicio',
      entidadId: e.servicioId,
      despues: { plataforma: e.plataforma.nombre, ...cuadre, avisos: undefined },
      cliente,
    });
    return cuadre;
  }

  async importar(auth: ContextoAuth, e: ImportarGestorEntrada, cliente: InfoCliente) {
    await this.preparar(auth, e);
    return this.prisma.$transaction(
      async (tx) => {
        const plan = await this.planear(tx, e);
        const actor = auth.usuario.id;
        await this.recuperarMiembros(tx, plan.miembros, actor, e.plataforma.nombre, cliente);
        if (!plan.nuevas.length && !plan.sueltos.length && !plan.separar.length) {
          if (plan.miembros.length) return { loteId: null, cuadre: plan.cuadre };
          throw new ErrorApp(
            409,
            'NADA_QUE_IMPORTAR',
            'Todas las cuentas y clientes ya están en el panel.',
          );
        }
        const lote = await tx.loteGestor.create({
          data: {
            plataformaOrigen: e.plataforma.origenId,
            plataformaNombre: e.plataforma.nombre,
            servicioId: e.servicioId,
            planId: e.planId,
            cuadre: plan.cuadre as unknown as Prisma.InputJsonValue,
            creadoPorId: actor,
          },
          select: { id: true },
        });
        const registros: Prisma.RegistroGestorCreateManyInput[] = [];
        const registrar = (tipo: string, origenId: string, entidad: string, entidadId: string) =>
          registros.push({ loteId: lote.id, tipo, origenId, entidad, entidadId });

        // Clientes nuevos y su contacto (sin consentimiento: no se les escribe hasta que acepten).
        const clienteDe = new Map(plan.existentes);
        const clientes: Prisma.ClienteCreateManyInput[] = [];
        const contactos: Prisma.ContactoClienteCreateManyInput[] = [];
        for (const [k, c] of plan.porCrear) {
          const id = randomUUID();
          clienteDe.set(k, id);
          // Todos sus contactos; el primer correo va también al campo correo del cliente.
          const todos = c.contactos.length ? c.contactos : c.contacto ? [c.contacto] : [];
          clientes.push({
            id,
            nombre: c.nombre,
            correo: todos.find((x) => x.tipo === 'correo')?.valor ?? null,
            responsable: c.responsable,
            monedaPreferida: e.moneda,
            origen: 'gestor',
            creadoPorId: actor,
          });
          registrar('cliente', k, 'cliente', id);
          let n = 0;
          for (const x of todos) {
            if (x.tipo === 'correo') continue;
            const cid = randomUUID();
            contactos.push({ id: cid, clienteId: id, tipo: x.tipo, valor: x.valor });
            // Un registro por contacto: el primero con la clave del cliente, como antes.
            registrar('cliente', n ? `c${n}:${k}`.slice(0, 260) : k, 'contacto_cliente', cid);
            n += 1;
          }
        }
        await tx.cliente.createMany({ data: clientes });
        await tx.contactoCliente.createMany({ data: contactos });

        // Clientes sin perfil: una nota con su vencimiento, lo que pagaba y por qué.
        const notas: Prisma.NotaInternaCreateManyInput[] = [];
        for (const x of plan.sueltos) {
          const nid = randomUUID();
          notas.push({
            id: nid,
            clienteId: clienteDe.get(claveDe(x))!,
            autorId: actor,
            tipo: 'otro',
            texto: notaClienteSuelto(e.plataforma.nombre, x),
          });
          registrar('suelto', x.origenId, 'nota_interna', nid);
        }
        await tx.notaInterna.createMany({ data: notas });

        const hoy = hoyUtc();
        const suscripciones: Prisma.SuscripcionCreateManyInput[] = [];
        const perfiles: Prisma.PerfilCuentaCreateManyInput[] = [];
        // La lista de cuentas va de la más nueva a la más vieja: la primera del Gestor
        // queda con la fecha de alta más reciente para que salga arriba, como allá.
        const ordenadas = [...plan.nuevas].sort((a, b) => a.orden - b.orden);
        const base = Date.now();
        for (const [i, c] of ordenadas.entries()) {
          const id = randomUUID();
          await tx.cuentaServicio.create({
            data: {
              id,
              servicioId: e.servicioId,
              usuarioCifrado: this.cifrador.cifrar(c.usuario.trim(), contextoUsuario(id)),
              usuarioHuella: plan.huellas.get(c.origenId)!,
              pista: pistaUsuario(c.usuario),
              claveCifrada: this.cifrador.cifrar(c.clave, contextoClave(id)),
              modo: c.modo,
              // De la papelera: retirada (se conserva para el historial y se puede reactivar).
              estado: c.papelera ? 'retirada' : c.caida ? 'caida' : 'activa',
              plan: c.plan,
              pais: c.pais,
              costoUsd: c.costoUsd,
              facturaEn: fechaODb(c.facturaEn) ?? null,
              metodoPago: c.metodoPago,
              proveedor: c.proveedor,
              notas: notaCuenta(e.plataforma.nombre, c, plan.repetidasEnPanel.has(c.origenId)),
              creadoPorId: actor,
              creadoEn: new Date(base - i * 1000),
            },
            select: { id: true },
          });
          registrar('cuenta', c.origenId, 'cuenta_servicio', id);
          for (const p of c.perfiles) {
            const pid = randomUUID();
            let suscripcionId: string | null = null;
            if (p.cliente) {
              suscripcionId = randomUUID();
              const vence = p.cliente.venceEn;
              suscripciones.push({
                id: suscripcionId,
                clienteId: clienteDe.get(claveCliente(p))!,
                planId: e.planId,
                // Sin fecha en el Gestor: activa y sin fecha, como allá.
                estado: !vence || vence >= hoy ? 'activa' : 'vencida',
                moneda: e.moneda,
                venceEn: vence ? new Date(`${vence}T23:59:59Z`) : null,
                creadoPorId: actor,
              });
              registrar('perfil', p.origenId, 'suscripcion', suscripcionId);
            }
            perfiles.push({
              id: pid,
              cuentaId: id,
              numero: p.numero,
              nombre: p.nombre,
              pinCifrado: p.pin ? this.cifrador.cifrar(p.pin, contextoPin(pid)) : null,
              usuarioMiembroCifrado: p.usuarioMiembro
                ? this.cifrador.cifrar(p.usuarioMiembro.trim(), contextoMiembro(pid))
                : null,
              claveMiembroCifrada: p.claveMiembro
                ? this.cifrador.cifrar(p.claveMiembro, contextoClaveMiembro(pid))
                : null,
              estado: suscripcionId ? 'asignado' : 'libre',
              suscripcionId,
              asignadoEn: suscripcionId ? new Date() : null,
            });
            registrar('perfil', p.origenId, 'perfil_cuenta', pid);
          }
        }
        // Cupos que quedaron con otro cliente: pasan (con sus facturas) al del Gestor.
        let corregidos = 0;
        for (const x of plan.separar) {
          const destino = clienteDe.get(claveDe(x.cliente));
          if (!destino || destino === x.deClienteId) continue;
          await tx.suscripcion.update({
            where: { id: x.suscripcionId },
            data: { clienteId: destino },
          });
          await tx.factura.updateMany({
            where: { suscripcionId: x.suscripcionId, clienteId: x.deClienteId },
            data: { clienteId: destino },
          });
          corregidos += 1;
        }
        if (corregidos) {
          await this.auditoria.registrar(
            {
              actorId: actor,
              accion: 'gestor.clientes_corregidos',
              entidad: 'lote_gestor',
              entidadId: lote.id,
              despues: { plataforma: e.plataforma.nombre, cupos: corregidos },
              cliente,
            },
            tx,
          );
        }
        await tx.suscripcion.createMany({ data: suscripciones });
        await tx.perfilCuenta.createMany({ data: perfiles });
        await tx.registroGestor.createMany({ data: registros });
        await this.auditoria.registrar(
          {
            actorId: actor,
            accion: 'gestor.lote_importado',
            entidad: 'lote_gestor',
            entidadId: lote.id,
            despues: { plataforma: e.plataforma.nombre, ...plan.cuadre, avisos: undefined },
            cliente,
          },
          tx,
        );
        return { loteId: lote.id, cuadre: plan.cuadre };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  async lotes(): Promise<LoteGestorPublico[]> {
    const lotes = await this.prisma.loteGestor.findMany({
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
    const ids = [...new Set(lotes.flatMap((l) => [l.servicioId, l.creadoPorId ?? '']))];
    const [servicios, usuarios] = await Promise.all([
      this.prisma.servicio.findMany({
        where: { id: { in: ids } },
        select: { id: true, nombre: true },
      }),
      this.prisma.usuario.findMany({
        where: { id: { in: ids } },
        select: { id: true, nombre: true },
      }),
    ]);
    const servicio = new Map(servicios.map((s) => [s.id, s]));
    const usuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
    return lotes.map((l) => ({
      id: l.id,
      plataforma: l.plataformaNombre,
      servicio: servicio.get(l.servicioId) ?? { id: l.servicioId, nombre: 'Servicio borrado' },
      cuadre: l.cuadre as unknown as CuadreGestor,
      creadoEn: l.creadoEn.toISOString(),
      creadoPor: l.creadoPorId ? (usuario.get(l.creadoPorId) ?? null) : null,
      revertidoEn: l.revertidoEn?.toISOString() ?? null,
    }));
  }

  /**
   * Pasa un lote a otro servicio (p. ej. «Gemini Plus» que entró en «Google One»):
   * sus cuentas cambian de servicio y sus suscripciones de plan. No borra nada; las
   * facturas y fechas quedan igual. Con confirmar=false solo cuenta lo que cambiaría.
   */
  async cambiarPlataforma(
    auth: ContextoAuth,
    id: string,
    e: CambiarPlataformaLoteEntrada,
    cliente: InfoCliente,
  ): Promise<CambioPlataformaLote> {
    if (auth.usuario.rol !== 'admin') {
      throw new ErrorApp(403, 'SOLO_ADMINISTRACION', 'Solo la administración corrige lotes.');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const lote = await tx.loteGestor.findUnique({
          where: { id },
          select: { id: true, revertidoEn: true, servicioId: true, plataformaNombre: true },
        });
        if (!lote) throw Errores.noEncontrado('El lote');
        if (lote.revertidoEn) throw new ErrorApp(409, 'LOTE_REVERTIDO', 'Este lote ya se deshizo.');
        const plan = await tx.plan.findUnique({
          where: { id: e.planId },
          select: { servicioId: true },
        });
        if (!plan) throw Errores.noEncontrado('El plan');
        if (plan.servicioId !== e.servicioId) {
          throw new ErrorApp(400, 'PLAN_DE_OTRO_SERVICIO', 'El plan no es del servicio elegido.', {
            planId: ['Elige un plan del servicio.'],
          });
        }
        if (e.servicioId === lote.servicioId) {
          throw new ErrorApp(400, 'MISMO_SERVICIO', 'El lote ya está en ese servicio.', {
            servicioId: ['Elige otro servicio.'],
          });
        }
        const regs = await tx.registroGestor.findMany({
          where: { loteId: id, entidad: { in: ['cuenta_servicio', 'suscripcion'] } },
          select: { entidad: true, entidadId: true },
        });
        const cuentas = regs.filter((r) => r.entidad === 'cuenta_servicio').map((r) => r.entidadId);
        const delLote = regs.filter((r) => r.entidad === 'suscripcion').map((r) => r.entidadId);
        // Las del lote y las que hoy ocupan cupos de sus cuentas, si siguen en el servicio viejo.
        const suscripciones = (
          await tx.suscripcion.findMany({
            where: {
              OR: [{ id: { in: delLote } }, { perfilCuenta: { cuentaId: { in: cuentas } } }],
              plan: { servicioId: lote.servicioId },
            },
            select: { id: true },
          })
        ).map((x) => x.id);
        const cuentasViejas = await tx.cuentaServicio.count({
          where: { id: { in: cuentas }, servicioId: lote.servicioId },
        });
        if (!e.confirmar) {
          return { cuentas: cuentasViejas, suscripciones: suscripciones.length, hecho: false };
        }
        await tx.cuentaServicio.updateMany({
          where: { id: { in: cuentas }, servicioId: lote.servicioId },
          data: { servicioId: e.servicioId },
        });
        await tx.suscripcion.updateMany({
          where: { id: { in: suscripciones } },
          data: { planId: e.planId },
        });
        await tx.loteGestor.update({
          where: { id },
          data: { servicioId: e.servicioId, planId: e.planId },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'gestor.lote_cambio_plataforma',
            entidad: 'lote_gestor',
            entidadId: id,
            antes: { servicioId: lote.servicioId },
            despues: {
              plataforma: lote.plataformaNombre,
              servicioId: e.servicioId,
              planId: e.planId,
              cuentas: cuentasViejas,
              suscripciones: suscripciones.length,
            },
            cliente,
          },
          tx,
        );
        return { cuentas: cuentasViejas, suscripciones: suscripciones.length, hecho: true };
      },
      { timeout: 60_000 },
    );
  }

  /**
   * Deshace un lote: borra lo que creó, solo si nada de eso se usó después
   * (facturas, pagos, otras suscripciones o perfiles reasignados).
   */
  async revertir(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    if (auth.usuario.rol !== 'admin') {
      throw new ErrorApp(403, 'SOLO_ADMINISTRACION', 'Solo la administración deshace lotes.');
    }
    await this.prisma.$transaction(
      async (tx) => {
        const lote = await tx.loteGestor.findUnique({
          where: { id },
          select: { id: true, revertidoEn: true, plataformaNombre: true },
        });
        if (!lote) throw Errores.noEncontrado('El lote');
        if (lote.revertidoEn) throw new ErrorApp(409, 'LOTE_REVERTIDO', 'Este lote ya se deshizo.');
        const regs = await tx.registroGestor.findMany({
          where: { loteId: id },
          select: { entidad: true, entidadId: true },
        });
        const de = (entidad: string) =>
          regs.filter((r) => r.entidad === entidad).map((r) => r.entidadId);
        const [cuentas, perfiles, suscripciones, clientes, contactos, notas] = [
          de('cuenta_servicio'),
          de('perfil_cuenta'),
          de('suscripcion'),
          de('cliente'),
          de('contacto_cliente'),
          de('nota_interna'),
        ];
        const usado = (
          await Promise.all([
            tx.factura.count({
              where: {
                OR: [{ suscripcionId: { in: suscripciones } }, { clienteId: { in: clientes } }],
              },
            }),
            tx.pagoCuentaServicio.count({ where: { cuentaId: { in: cuentas } } }),
            tx.suscripcion.count({
              where: { clienteId: { in: clientes }, id: { notIn: suscripciones } },
            }),
            tx.perfilCuenta.count({
              where: { cuentaId: { in: cuentas }, id: { notIn: perfiles } },
            }),
            tx.perfilCuenta.count({
              where: {
                cuentaId: { in: cuentas },
                suscripcionId: { not: null, notIn: suscripciones },
              },
            }),
          ])
        ).some((n) => n > 0);
        if (usado) {
          throw new ErrorApp(
            409,
            'LOTE_EN_USO',
            'No se puede deshacer: algo de este lote ya tiene facturas, pagos u otros movimientos.',
          );
        }
        try {
          await tx.perfilCuenta.deleteMany({ where: { id: { in: perfiles } } });
          await tx.suscripcion.deleteMany({ where: { id: { in: suscripciones } } });
          await tx.contactoCliente.deleteMany({ where: { id: { in: contactos } } });
          await tx.notaInterna.deleteMany({ where: { id: { in: notas } } });
          await tx.cliente.deleteMany({ where: { id: { in: clientes } } });
          await tx.cuentaServicio.deleteMany({ where: { id: { in: cuentas } } });
        } catch (err) {
          if ((err as { code?: string }).code === 'P2003') {
            throw new ErrorApp(
              409,
              'LOTE_EN_USO',
              'No se puede deshacer: algo de este lote ya se usó en otra parte del panel.',
            );
          }
          throw err;
        }
        await tx.registroGestor.deleteMany({ where: { loteId: id } });
        await tx.loteGestor.update({
          where: { id },
          data: { revertidoEn: new Date(), revertidoPorId: auth.usuario.id },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'gestor.lote_revertido',
            entidad: 'lote_gestor',
            entidadId: id,
            despues: {
              plataforma: lote.plataformaNombre,
              cuentas: cuentas.length,
              clientes: clientes.length,
              suscripciones: suscripciones.length,
            },
            cliente,
          },
          tx,
        );
      },
      { timeout: 60_000 },
    );
  }
}
