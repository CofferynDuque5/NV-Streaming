import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import {
  type BloqueSitio,
  bloqueSitioSchema,
  contenidoPaginaSchema,
  type CrearPaginaEntrada,
  esPaletaSitio,
  esRutaReservada,
  type GuardarBorradorEntrada,
  mediosDeBloques,
  PALETA_PREDETERMINADA,
  type PaginaPublicada,
  type PaginaSitioDetalle,
  type PaginaSitioResumen,
  type PaletaSitio,
  type PublicarPaginaEntrada,
  type TemaSitio,
  type TemaSitioPublico,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';

type Tx = Prisma.TransactionClient;

const PERSONA = { select: { id: true, nombre: true } } as const;

const INCLUIR_RESUMEN = {
  versionPublicada: {
    select: { numero: true, publicadaEn: true, contenido: true, titulo: true, descripcion: true },
  },
} as const;

const INCLUIR_DETALLE = {
  ...INCLUIR_RESUMEN,
  borradorPor: PERSONA,
  versiones: {
    select: {
      id: true,
      numero: true,
      titulo: true,
      nota: true,
      publicadaEn: true,
      contenido: true,
      publicadaPor: PERSONA,
    },
    orderBy: { numero: 'desc' },
    take: 50,
  },
} as const;

type FilaResumen = Prisma.PaginaGetPayload<{ include: typeof INCLUIR_RESUMEN }>;
type FilaDetalle = Prisma.PaginaGetPayload<{ include: typeof INCLUIR_DETALLE }>;

/** Postgres guarda JSONB con las claves ordenadas: comparar el texto basta. */
const mismoJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function sinPublicar(p: FilaResumen): boolean {
  const v = p.versionPublicada;
  if (!v) return true;
  return (
    !mismoJson(p.borrador, v.contenido) || p.titulo !== v.titulo || p.descripcion !== v.descripcion
  );
}

function resumen(p: FilaResumen): PaginaSitioResumen {
  return {
    id: p.id,
    ruta: p.ruta,
    titulo: p.titulo,
    archivada: p.archivada,
    versionPublicada: p.versionPublicada
      ? { numero: p.versionPublicada.numero, publicadaEn: iso(p.versionPublicada.publicadaEn)! }
      : null,
    borradorActualizadoEn: iso(p.borradorActualizadoEn),
    cambiosSinPublicar: sinPublicar(p),
  };
}

function detalle(p: FilaDetalle): PaginaSitioDetalle {
  const vigente = p.versionPublicada?.numero ?? null;
  return {
    ...resumen(p),
    descripcion: p.descripcion,
    bloques: (Array.isArray(p.borrador) ? p.borrador : []) as unknown as BloqueSitio[],
    borradorPor: p.borradorPor,
    versiones: p.versiones.map((v) => ({
      id: v.id,
      numero: v.numero,
      titulo: v.titulo,
      nota: v.nota,
      publicadaPor: v.publicadaPor,
      publicadaEn: iso(v.publicadaEn)!,
      vigente: v.numero === vigente,
      bloques: Array.isArray(v.contenido) ? v.contenido.length : 0,
    })),
  };
}

/** Solo los bloques que siguen siendo válidos (por si el esquema cambió desde que se publicó). */
function bloquesValidos(contenido: unknown): BloqueSitio[] {
  if (!Array.isArray(contenido)) return [];
  return contenido.flatMap((b) => {
    const r = bloqueSitioSchema.safeParse(b);
    return r.success ? [r.data] : [];
  });
}

const aJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

@Injectable()
export class SitioService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  // ---------------------------------------------------------------- Páginas

  async listar(): Promise<PaginaSitioResumen[]> {
    const filas = await this.prisma.pagina.findMany({
      include: INCLUIR_RESUMEN,
      orderBy: [{ archivada: 'asc' }, { ruta: 'asc' }],
      take: 500,
    });
    return filas.map(resumen);
  }

  async obtener(id: string): Promise<PaginaSitioDetalle> {
    const p = await this.prisma.pagina.findUnique({ where: { id }, include: INCLUIR_DETALLE });
    if (!p) throw Errores.noEncontrado('La página');
    return detalle(p);
  }

  async crear(
    auth: ContextoAuth,
    e: CrearPaginaEntrada,
    cliente: InfoCliente,
  ): Promise<PaginaSitioDetalle> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const p = await tx.pagina.create({
          data: {
            ruta: e.ruta,
            titulo: e.titulo,
            descripcion: e.descripcion ?? null,
            borrador: [],
            borradorActualizadoEn: new Date(),
            borradorPorId: auth.usuario.id,
          },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'pagina.creada',
            entidad: 'pagina',
            entidadId: p.id,
            despues: { ruta: p.ruta, titulo: p.titulo },
            cliente,
          },
          tx,
        );
        return p.id;
      });
      return this.obtener(id);
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(409, 'DUPLICADO', 'Ya existe una página con esa ruta.', {
          ruta: ['Ya existe una página con esa ruta.'],
        });
      }
      throw err;
    }
  }

  /** Guarda el borrador si nadie lo cambió desde que se cargó (control optimista). */
  async guardarBorrador(
    auth: ContextoAuth,
    id: string,
    e: GuardarBorradorEntrada,
    cliente: InfoCliente,
  ): Promise<PaginaSitioDetalle> {
    await this.exigirMedios(e.bloques);
    await this.prisma.$transaction(async (tx) => {
      const esperado = e.borradorActualizadoEn ? new Date(e.borradorActualizadoEn) : null;
      const r = await tx.pagina.updateMany({
        where: { id, borradorActualizadoEn: esperado },
        data: {
          titulo: e.titulo,
          descripcion: e.descripcion ?? null,
          borrador: aJson(e.bloques),
          borradorActualizadoEn: new Date(),
          borradorPorId: auth.usuario.id,
        },
      });
      if (r.count === 0) await this.conflicto(tx, id);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pagina.borrador_guardado',
          entidad: 'pagina',
          entidadId: id,
          despues: { titulo: e.titulo, bloques: e.bloques.map((b) => b.tipo) },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  /** Publica el borrador actual como una versión nueva (numero + 1) y la deja vigente. */
  async publicar(
    auth: ContextoAuth,
    id: string,
    e: PublicarPaginaEntrada,
    cliente: InfoCliente,
  ): Promise<PaginaSitioDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.bloquear(tx, id);
      if (
        e.borradorActualizadoEn !== undefined &&
        iso(p.borradorActualizadoEn) !== e.borradorActualizadoEn
      ) {
        await this.conflicto(tx, id);
      }
      if (esRutaReservada(p.ruta)) {
        throw new ErrorApp(409, 'RUTA_RESERVADA', 'Esa ruta la usa la aplicación.');
      }
      const contenido = contenidoPaginaSchema.safeParse(p.borrador);
      if (!contenido.success) {
        throw new ErrorApp(
          409,
          'BORRADOR_INVALIDO',
          'El borrador tiene bloques con errores. Revísalos y guárdalo antes de publicar.',
        );
      }
      await this.exigirMedios(contenido.data, tx);
      const ultima = await tx.versionPagina.aggregate({
        where: { paginaId: id },
        _max: { numero: true },
      });
      const numero = (ultima._max.numero ?? 0) + 1;
      const version = await tx.versionPagina.create({
        data: {
          paginaId: id,
          numero,
          titulo: p.titulo,
          descripcion: p.descripcion,
          contenido: aJson(contenido.data),
          nota: e.nota ?? null,
          publicadaPorId: auth.usuario.id,
        },
      });
      await tx.pagina.update({ where: { id }, data: { versionPublicadaId: version.id } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pagina.publicada',
          entidad: 'pagina',
          entidadId: id,
          despues: { ruta: p.ruta, numero, nota: e.nota ?? null },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  /** Copia una versión anterior al borrador (no la publica). */
  async restaurar(
    auth: ContextoAuth,
    id: string,
    numero: number,
    cliente: InfoCliente,
  ): Promise<PaginaSitioDetalle> {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, id);
      const v = await tx.versionPagina.findUnique({
        where: { paginaId_numero: { paginaId: id, numero } },
      });
      if (!v) throw Errores.noEncontrado('La versión');
      await tx.pagina.update({
        where: { id },
        data: {
          titulo: v.titulo,
          descripcion: v.descripcion,
          borrador: v.contenido ?? [],
          borradorActualizadoEn: new Date(),
          borradorPorId: auth.usuario.id,
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pagina.version_restaurada',
          entidad: 'pagina',
          entidadId: id,
          despues: { numero },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  async cambiarArchivada(
    auth: ContextoAuth,
    id: string,
    archivada: boolean,
    cliente: InfoCliente,
  ): Promise<PaginaSitioDetalle> {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.bloquear(tx, id);
      if (p.archivada === archivada) return;
      await tx.pagina.update({ where: { id }, data: { archivada } });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: archivada ? 'pagina.archivada' : 'pagina.desarchivada',
          entidad: 'pagina',
          entidadId: id,
          antes: { archivada: p.archivada },
          despues: { archivada },
          cliente,
        },
        tx,
      );
    });
    return this.obtener(id);
  }

  /** Versión vigente de una página visible. Archivada o sin publicar: no existe. */
  async publicada(ruta: string): Promise<PaginaPublicada> {
    const p = await this.prisma.pagina.findUnique({
      where: { ruta },
      include: { versionPublicada: true },
    });
    const v = p?.versionPublicada;
    if (!p || p.archivada || !v || esRutaReservada(p.ruta)) throw Errores.noEncontrado('La página');
    return {
      ruta: p.ruta,
      titulo: v.titulo,
      descripcion: v.descripcion,
      bloques: bloquesValidos(v.contenido),
      numero: v.numero,
      publicadaEn: iso(v.publicadaEn)!,
    };
  }

  // ---------------------------------------------------------------- Tema

  async tema(): Promise<TemaSitio> {
    const t = await this.prisma.temaSitio.findUnique({
      where: { id: 1 },
      include: { actualizadoPor: PERSONA },
    });
    return {
      paleta: esPaletaSitio(t?.paleta) ? t.paleta : PALETA_PREDETERMINADA,
      actualizadoEn: iso(t?.actualizadoEn),
      actualizadoPor: t?.actualizadoPor ?? null,
    };
  }

  async temaPublico(): Promise<TemaSitioPublico> {
    const t = await this.prisma.temaSitio.findUnique({ where: { id: 1 } });
    return { paleta: esPaletaSitio(t?.paleta) ? t.paleta : PALETA_PREDETERMINADA };
  }

  async cambiarTema(
    auth: ContextoAuth,
    paleta: PaletaSitio,
    cliente: InfoCliente,
  ): Promise<TemaSitio> {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.temaSitio.findUnique({ where: { id: 1 } });
      await tx.temaSitio.upsert({
        where: { id: 1 },
        create: { id: 1, paleta, actualizadoPorId: auth.usuario.id },
        update: { paleta, actualizadoPorId: auth.usuario.id },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'tema_sitio.cambiado',
          entidad: 'tema_sitio',
          entidadId: null,
          antes: { paleta: antes?.paleta ?? null },
          despues: { paleta },
          cliente,
        },
        tx,
      );
    });
    return this.tema();
  }

  // ---------------------------------------------------------------- Ayudas

  /** Bloquea la fila de la página hasta el final de la transacción. */
  private async bloquear(tx: Tx, id: string) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM paginas WHERE id = ${id}::uuid FOR UPDATE`;
    if (filas.length === 0) throw Errores.noEncontrado('La página');
    return tx.pagina.findUniqueOrThrow({ where: { id } });
  }

  /** La página existe pero otra persona guardó antes: 409 con un mensaje claro. */
  private async conflicto(tx: Tx, id: string): Promise<never> {
    const p = await tx.pagina.findUnique({ where: { id }, include: { borradorPor: PERSONA } });
    if (!p) throw Errores.noEncontrado('La página');
    const quien = p.borradorPor?.nombre ?? 'Otra persona';
    throw new ErrorApp(
      409,
      'BORRADOR_DESACTUALIZADO',
      `${quien} guardó cambios en esta página mientras la editabas. Tus cambios no se guardaron: copia lo que necesites y recarga para ver la versión más reciente.`,
    );
  }

  /** Todas las imágenes que usan los bloques deben existir en la biblioteca. */
  private async exigirMedios(bloques: readonly BloqueSitio[], tx: Tx | PrismaClient = this.prisma) {
    const ids = mediosDeBloques(bloques);
    if (ids.length === 0) return;
    const n = await tx.medio.count({ where: { id: { in: ids } } });
    if (n !== ids.length) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Alguna imagen ya no está en la biblioteca.', {
        bloques: ['Alguna imagen ya no está en la biblioteca. Elige otra.'],
      });
    }
  }
}
