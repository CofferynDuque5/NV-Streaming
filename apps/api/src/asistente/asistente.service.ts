import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MensajeAsistente, Prisma, PrismaClient } from '@nv/db';
import {
  type ConversacionDetalle,
  type ConversacionResumen,
  type EnviarMensajeAsistenteEntrada,
  type EstadoAsistente,
  HERRAMIENTAS,
  INFO_PROVEEDOR_IA,
  type MensajeAsistentePublico,
  NOMBRES_HERRAMIENTA,
  type NombreHerramienta,
  PARAMETROS_HERRAMIENTA,
  type RespuestaAsistente,
  tienePermiso,
  type UsoHerramienta,
} from '@nv/shared';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import { AccionesAsistenteService } from './acciones.service.js';
import { ConfiguracionAsistenteService, topeAlcanzado } from './configuracion.service.js';
import { diaCaracas } from './fechas.js';
import { HerramientasAsistenteService } from './herramientas/herramientas.service.js';
import {
  ErrorProveedorIa,
  type LlamadaHerramienta,
  type MensajeIa,
  type ResultadoHerramienta,
  type SalidaModelo,
} from './proveedores/proveedor.js';
import { redactarTexto, redactarValor } from './redaccion.js';
import { ETIQUETA_DATOS, instruccionesSistema } from './sistema.js';

/** Rondas de herramientas por mensaje (cada ronda es una llamada al motor). */
export const MAX_RONDAS = 5;
const MAX_LLAMADAS_POR_RONDA = 5;
const MAX_PROPUESTAS_POR_MENSAJE = 3;
const MAX_TOKENS_RESPUESTA = 1024;
/** Historial que se reenvía al motor: últimos mensajes, hasta estos caracteres. */
const HISTORIAL_MENSAJES = 20;
const HISTORIAL_CARACTERES = 12_000;
/** Tamaño máximo de lo que devuelve una herramienta al modelo. */
const MAX_RESULTADO = 12_000;
const MAX_RESPUESTA = 8_000;
/**
 * Tiempo total para contestar un mensaje, con todas sus rondas. Queda por debajo
 * del tiempo que la web espera a la API (150 s) para devolver siempre algo.
 */
const PRESUPUESTO_MS = 140_000;
const LIMITE_POR_MINUTO = { maximo: 10, ventanaSegundos: 60 };
/** El contador diario vive un poco más de un día; la clave lleva la fecha de Caracas. */
const VENTANA_DIARIA_S = 26 * 3600;
const CONVERSACIONES_LISTADAS = 50;

type UsoGuardado = { herramienta: NombreHerramienta; ok: boolean; error: string | null };

const noDisponible = () =>
  new ErrorApp(
    503,
    'ASISTENTE_NO_DISPONIBLE',
    'El asistente no pudo responder ahora. Tu mensaje quedó guardado; inténtalo de nuevo en unos minutos.',
  );

/** Datos de una herramienta delimitados para el modelo; `<` y `>` van escapados en el JSON. */
export function envolverDatos(nombre: string, datos: unknown): string {
  let json = JSON.stringify(redactarValor(datos) ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  if (json.length > MAX_RESULTADO) json = `${json.slice(0, MAX_RESULTADO)}… (recortado)`;
  return `<${ETIQUETA_DATOS} nombre="${nombre}">\n${json}\n</${ETIQUETA_DATOS}>`;
}

/** Última pasada del filtro sobre todo lo que se envía al motor. */
function redactarMensajes(mensajes: MensajeIa[]): MensajeIa[] {
  return mensajes.map((m) => {
    if (m.rol === 'usuario') return { rol: 'usuario', texto: redactarTexto(m.texto) };
    if (m.rol === 'asistente') {
      return {
        rol: 'asistente',
        texto: redactarTexto(m.texto),
        ...(m.llamadas
          ? {
              llamadas: m.llamadas.map((l) => ({ ...l, argumentos: redactarValor(l.argumentos) })),
            }
          : {}),
      };
    }
    // Los resultados ya se redactaron al crearse (redactarValor en envolverDatos).
    return m;
  });
}

function usosPublicos(valor: Prisma.JsonValue): UsoHerramienta[] {
  if (!Array.isArray(valor)) return [];
  const usos: UsoHerramienta[] = [];
  for (const u of valor) {
    if (!u || typeof u !== 'object' || Array.isArray(u)) continue;
    const nombre = u['herramienta'];
    if (typeof nombre !== 'string' || !(nombre in HERRAMIENTAS)) continue;
    const def = HERRAMIENTAS[nombre as NombreHerramienta];
    usos.push({
      herramienta: def.nombre as NombreHerramienta,
      tipo: def.tipo,
      etiqueta: def.etiqueta,
      ok: u['ok'] === true,
      error: typeof u['error'] === 'string' ? u['error'] : null,
    });
  }
  return usos;
}

/**
 * Orquestador del asistente: guarda la pregunta, arma las instrucciones y el
 * historial, deja que el motor pida herramientas (hasta MAX_RONDAS), ejecuta
 * las consultas con los permisos de quien pregunta, convierte las acciones en
 * propuestas y guarda la respuesta ya redactada. Nunca se registran mensajes,
 * resultados ni claves: solo ids y recuentos.
 */
@Injectable()
export class AsistenteService {
  private readonly logger = new Logger('Asistente');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ConfiguracionAsistenteService) private readonly config: ConfiguracionAsistenteService,
    @Inject(HerramientasAsistenteService)
    private readonly herramientas: HerramientasAsistenteService,
    @Inject(AccionesAsistenteService) private readonly acciones: AccionesAsistenteService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  // ── Estado y límites ───────────────────────────────────────────────────────

  private claveDiaria(usuarioId: string) {
    return `asistente:dia:${usuarioId}:${diaCaracas()}`;
  }

  private async usadosHoy(usuarioId: string): Promise<number> {
    const fila = await this.prisma.limiteUso.findUnique({
      where: { clave: this.claveDiaria(usuarioId) },
    });
    if (!fila || fila.ventanaInicio.getTime() < Date.now() - VENTANA_DIARIA_S * 1000) return 0;
    return fila.conteo;
  }

  /** Suma un mensaje al contador del día (hora de Caracas). */
  private async consumirDiario(usuarioId: string, maximo: number): Promise<void> {
    try {
      await this.limites.consumir(this.claveDiaria(usuarioId), {
        maximo,
        ventanaSegundos: VENTANA_DIARIA_S,
      });
    } catch (e) {
      if (e instanceof ErrorApp && e.estado === 429) {
        throw new ErrorApp(
          429,
          'LIMITE_DIARIO',
          `Llegaste al límite de ${maximo} mensajes de hoy. Vuelve a intentarlo mañana.`,
        );
      }
      throw e;
    }
  }

  async estado(auth: ContextoAuth): Promise<EstadoAsistente> {
    const conf = await this.config.leer();
    const m = this.config.motor(conf);
    const usados = await this.usadosHoy(auth.usuario.id);
    const configura = tienePermiso(auth.usuario.rol, 'asistente.configurar');
    return {
      activo: conf.activo,
      proveedor: m.proveedor,
      modelo: m.modelo,
      disponible: m.disponible.ok,
      motivoNoDisponible: m.disponible.ok
        ? null
        : configura
          ? m.disponible.motivo
          : 'El asistente no está disponible por ahora. Avisa a administración.',
      mensajesRestantesHoy: Math.max(0, conf.mensajesDiariosPorUsuario - usados),
    };
  }

  // ── Conversaciones ─────────────────────────────────────────────────────────

  private async propia(auth: ContextoAuth, id: string) {
    const c = await this.prisma.conversacionAsistente.findFirst({
      where: { id, usuarioId: auth.usuario.id, archivada: false },
    });
    if (!c) throw Errores.noEncontrado('La conversación');
    return c;
  }

  async conversaciones(auth: ContextoAuth): Promise<ConversacionResumen[]> {
    await this.acciones.expirarVencidas();
    const filas = await this.prisma.conversacionAsistente.findMany({
      where: { usuarioId: auth.usuario.id, archivada: false },
      orderBy: [{ actualizadaEn: 'desc' }, { id: 'asc' }],
      take: CONVERSACIONES_LISTADAS,
      include: { _count: { select: { acciones: { where: { estado: 'propuesta' } } } } },
    });
    return filas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      actualizadaEn: iso(c.actualizadaEn)!,
      accionesPendientes: c._count.acciones,
    }));
  }

  async conversacion(auth: ContextoAuth, id: string): Promise<ConversacionDetalle> {
    const c = await this.propia(auth, id);
    await this.acciones.expirarVencidas();
    const mensajes = await this.prisma.mensajeAsistente.findMany({
      where: { conversacionId: id },
      orderBy: { orden: 'asc' },
    });
    const acciones = await this.acciones.deMensajes(mensajes.map((m) => m.id));
    return {
      id: c.id,
      titulo: c.titulo,
      mensajes: mensajes.map((m) => this.mensajePublico(m, acciones.get(m.id) ?? [])),
    };
  }

  async archivar(auth: ContextoAuth, id: string): Promise<void> {
    await this.propia(auth, id);
    await this.prisma.conversacionAsistente.update({ where: { id }, data: { archivada: true } });
  }

  private mensajePublico(
    m: MensajeAsistente,
    acciones: MensajeAsistentePublico['acciones'],
  ): MensajeAsistentePublico {
    return {
      id: m.id,
      rol: m.rol,
      texto: m.texto,
      herramientas: usosPublicos(m.herramientas),
      acciones,
      creadoEn: iso(m.creadoEn)!,
    };
  }

  /** Añade un mensaje con el siguiente número de orden (bloquea la conversación). */
  private async agregarMensaje(
    conversacionId: string,
    datos: Omit<Prisma.MensajeAsistenteUncheckedCreateInput, 'conversacionId' | 'orden'>,
  ): Promise<MensajeAsistente> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversaciones_asistente WHERE id = ${conversacionId}::uuid FOR UPDATE`;
      const ultimo = await tx.mensajeAsistente.findFirst({
        where: { conversacionId },
        orderBy: { orden: 'desc' },
        select: { orden: true },
      });
      const m = await tx.mensajeAsistente.create({
        data: { ...datos, conversacionId, orden: (ultimo?.orden ?? 0) + 1 },
      });
      await tx.conversacionAsistente.update({
        where: { id: conversacionId },
        data: { actualizadaEn: new Date() },
      });
      return m;
    });
  }

  /** Últimos mensajes de la conversación (solo texto), acotados por número y caracteres. */
  private async historial(conversacionId: string): Promise<MensajeIa[]> {
    const filas = await this.prisma.mensajeAsistente.findMany({
      where: { conversacionId },
      orderBy: { orden: 'desc' },
      take: HISTORIAL_MENSAJES,
      select: { rol: true, texto: true },
    });
    const salida: MensajeIa[] = [];
    let caracteres = 0;
    for (const f of filas) {
      caracteres += f.texto.length;
      if (salida.length > 0 && caracteres > HISTORIAL_CARACTERES) break;
      salida.unshift(
        f.rol === 'usuario'
          ? { rol: 'usuario', texto: f.texto }
          : { rol: 'asistente', texto: f.texto },
      );
    }
    return salida;
  }

  // ── Un mensaje ─────────────────────────────────────────────────────────────

  async enviar(
    auth: ContextoAuth,
    entrada: EnviarMensajeAsistenteEntrada,
    cliente: InfoCliente,
  ): Promise<RespuestaAsistente> {
    const conf = await this.config.leer();
    if (!conf.activo) {
      throw new ErrorApp(
        409,
        'ASISTENTE_INACTIVO',
        'El asistente está desactivado. Administración puede activarlo en Asistente de IA.',
      );
    }
    const { proveedor, motor, modelo, disponible } = this.config.motor(conf);
    if (!disponible.ok) {
      throw new ErrorApp(
        503,
        'ASISTENTE_NO_DISPONIBLE',
        'El asistente no está disponible ahora. Avisa a administración.',
      );
    }
    const usuarioId = auth.usuario.id;
    await this.limites.consumir(`asistente:minuto:${usuarioId}`, LIMITE_POR_MINUTO);
    const deCosto = INFO_PROVEEDOR_IA[proveedor].deCosto;
    if (deCosto && (await this.config.topeSuperado(conf))) throw topeAlcanzado();
    const conversacion = entrada.conversacionId
      ? await this.propia(auth, entrada.conversacionId)
      : null;
    await this.consumirDiario(usuarioId, conf.mensajesDiariosPorUsuario);

    const textoPregunta = redactarTexto(entrada.texto);
    const conv =
      conversacion ??
      (await this.prisma.conversacionAsistente.create({
        data: {
          usuarioId,
          titulo: textoPregunta.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Conversación',
        },
      }));
    const pregunta = await this.agregarMensaje(conv.id, { rol: 'usuario', texto: textoPregunta });

    const mensajes = await this.historial(conv.id);
    const sistema = instruccionesSistema(auth.usuario.rol);
    const ofrecidas = this.herramientas.ofrecidas(auth);
    const usos: UsoGuardado[] = [];
    const propuestas: string[] = [];
    let texto = '';
    let tokensEntrada = 0;
    let tokensSalida = 0;
    let rondas = 0;

    const limite = Date.now() + PRESUPUESTO_MS;
    for (let ronda = 0; ronda < MAX_RONDAS; ronda += 1) {
      const restante = limite - Date.now();
      if (ronda > 0 && restante < 5_000) {
        texto ||= 'Se acabó el tiempo para responder. Prueba con una pregunta más concreta.';
        break;
      }
      if (ronda > 0 && deCosto && (await this.config.topeSuperado(conf))) {
        texto ||= 'Se alcanzó el tope de gasto del mes y no pude terminar la respuesta.';
        break;
      }
      let r: SalidaModelo;
      try {
        r = await motor.responder({
          sistema,
          mensajes: redactarMensajes(mensajes),
          herramientas: ofrecidas,
          maxTokens: MAX_TOKENS_RESPUESTA,
          modelo,
          plazoMs: restante,
        });
      } catch (e) {
        this.logger.warn(
          `El motor ${proveedor} falló en la conversación ${conv.id}: ${
            e instanceof ErrorProveedorIa ? e.message : e instanceof Error ? e.name : 'error'
          }`,
        );
        throw noDisponible();
      }
      rondas += 1;
      tokensEntrada += r.tokensEntrada;
      tokensSalida += r.tokensSalida;
      await this.config.registrarUso(proveedor, r.tokensEntrada, r.tokensSalida);

      if (!r.llamadas.length) {
        texto = r.texto;
        break;
      }
      if (ronda === MAX_RONDAS - 1) {
        texto =
          r.texto ||
          'No pude completar la respuesta con los datos disponibles. Prueba con una pregunta más concreta.';
        break;
      }
      mensajes.push({ rol: 'asistente', texto: r.texto, llamadas: r.llamadas });
      const resultados: ResultadoHerramienta[] = [];
      for (const [i, llamada] of r.llamadas.entries()) {
        resultados.push(
          i < MAX_LLAMADAS_POR_RONDA
            ? await this.ejecutarLlamada(llamada, {
                auth,
                cliente,
                conv: conv.id,
                usos,
                propuestas,
              })
            : this.resultado(llamada, { error: 'Demasiadas herramientas a la vez.' }, true),
        );
      }
      mensajes.push({ rol: 'herramienta', resultados });
    }

    const final = redactarTexto(
      texto.trim() || 'No encontré una respuesta. ¿Puedes reformular la pregunta?',
    ).slice(0, MAX_RESPUESTA);
    const respuesta = await this.agregarMensaje(conv.id, {
      rol: 'asistente',
      texto: final,
      herramientas: usos as unknown as Prisma.InputJsonArray,
      proveedor,
      modelo: modelo.slice(0, 80),
      tokensEntrada,
      tokensSalida,
    });
    if (propuestas.length) {
      await this.prisma.accionPropuesta.updateMany({
        where: { id: { in: propuestas } },
        data: { mensajeId: respuesta.id },
      });
    }
    this.logger.log(
      `Respuesta en la conversación ${conv.id}: ${rondas} llamadas al motor, ${usos.length} herramientas, ${propuestas.length} propuestas, tokens ${tokensEntrada}/${tokensSalida}.`,
    );
    return {
      conversacionId: conv.id,
      pregunta: this.mensajePublico(pregunta, []),
      respuesta: this.mensajePublico(
        respuesta,
        (await this.acciones.deMensajes([respuesta.id])).get(respuesta.id) ?? [],
      ),
    };
  }

  private resultado(
    llamada: LlamadaHerramienta,
    datos: unknown,
    error = false,
  ): ResultadoHerramienta {
    return {
      id: llamada.id,
      nombre: llamada.nombre,
      contenido: envolverDatos(llamada.nombre, datos),
      error,
    };
  }

  /**
   * Ejecuta una llamada del modelo. El permiso se vuelve a comprobar aquí (una
   * herramienta no ofrecida nunca se ejecuta) y los parámetros se validan con el
   * esquema compartido. Las acciones solo crean la propuesta.
   */
  private async ejecutarLlamada(
    llamada: LlamadaHerramienta,
    ctx: {
      auth: ContextoAuth;
      cliente: InfoCliente;
      conv: string;
      usos: UsoGuardado[];
      propuestas: string[];
    },
  ): Promise<ResultadoHerramienta> {
    if (!(NOMBRES_HERRAMIENTA as string[]).includes(llamada.nombre)) {
      return this.resultado(llamada, { error: 'Esa herramienta no existe.' }, true);
    }
    const nombre = llamada.nombre as NombreHerramienta;
    const def = HERRAMIENTAS[nombre];
    const fallo = (mensaje: string) => {
      ctx.usos.push({ herramienta: nombre, ok: false, error: mensaje });
      return this.resultado(llamada, { error: mensaje }, true);
    };
    if (!tienePermiso(ctx.auth.usuario.rol, def.permiso)) {
      return fallo('No tienes permiso para usar esta herramienta.');
    }
    const p = PARAMETROS_HERRAMIENTA[nombre].safeParse(llamada.argumentos ?? {});
    if (!p.success) {
      const detalle = p.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || 'parámetros'}: ${i.message}`)
        .join('; ');
      return fallo(`Parámetros no válidos (${detalle}).`);
    }
    try {
      if (def.tipo === 'consulta') {
        const vista = await this.herramientas.consultar(nombre, p.data, ctx.auth);
        ctx.usos.push({ herramienta: nombre, ok: true, error: null });
        return this.resultado(llamada, vista);
      }
      if (ctx.propuestas.length >= MAX_PROPUESTAS_POR_MENSAJE) {
        return fallo(`Como mucho ${MAX_PROPUESTAS_POR_MENSAJE} acciones por mensaje.`);
      }
      const { resumen } = await this.herramientas.preparar(nombre, p.data, ctx.auth);
      const accion = await this.acciones.crear({
        conversacionId: ctx.conv,
        auth: ctx.auth,
        herramienta: nombre,
        parametros: p.data as Prisma.InputJsonObject,
        resumen,
        cliente: ctx.cliente,
      });
      ctx.propuestas.push(accion.id);
      ctx.usos.push({ herramienta: nombre, ok: true, error: null });
      return this.resultado(llamada, {
        propuesta: true,
        accionId: accion.id,
        estado: 'esperando confirmación',
        resumen,
        aviso:
          'La acción NO se ha ejecutado. La persona debe confirmarla en la pantalla; no la des por hecha.',
      });
    } catch (e) {
      if (e instanceof ErrorApp && e.estado < 500) return fallo(e.message);
      this.logger.warn(
        `La herramienta ${nombre} falló en la conversación ${ctx.conv}: ${e instanceof Error ? e.name : 'error'}`,
      );
      return fallo('No se pudo completar la consulta.');
    }
  }
}
