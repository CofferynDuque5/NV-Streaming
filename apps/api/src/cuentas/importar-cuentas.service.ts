import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import type {
  CuentaEncontrada,
  FilaRevisada,
  ImportarCuentasEntrada,
  ResultadoImportacion,
  RevisarImportacionEntrada,
  RevisionImportacion,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { LimitesService } from '../limites/limites.service.js';
import { contextoClave, CuentasService, dia, fechaODb } from './cuentas.service.js';

/** Revisiones e importaciones por persona y hora (cada revisión compara claves). */
export const LIMITE_IMPORTAR_CUENTAS = { maximo: 20, ventanaSegundos: 3600 };

/** Cuentas que «No están en el archivo» que se listan como máximo. */
const MAX_NO_ESTAN = 200;

const SELECCION = {
  id: true,
  usuarioHuella: true,
  pista: true,
  estado: true,
  facturaEn: true,
  proveedor: true,
  servicio: { select: { id: true, nombre: true } },
} as const satisfies Prisma.CuentaServicioSelect;

type Fila = Prisma.CuentaServicioGetPayload<{ select: typeof SELECCION }>;

const encontrada = (c: Fila): CuentaEncontrada => ({
  id: c.id,
  pista: c.pista,
  servicio: c.servicio,
  estado: c.estado,
  facturaEn: dia(c.facturaEn),
  proveedor: c.proveedor,
});

/**
 * «Verificar con TXT o CSV» del Gestor: compara la lista del proveedor con
 * las cuentas guardadas y crea o actualiza solo lo que se confirma. Las
 * filas llegan ya leídas desde el navegador; no se guardan ni se registran
 * correos ni claves, solo los conteos.
 */
@Injectable()
export class ImportarCuentasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(CuentasService) private readonly cuentas: CuentasService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  private async servicio(id: string) {
    const s = await this.prisma.servicio.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw Errores.noEncontrado('El servicio');
  }

  /** Qué filas son nuevas, cuáles ya están y qué cambió. No escribe nada salvo la auditoría. */
  async revisar(
    auth: ContextoAuth,
    e: RevisarImportacionEntrada,
    cliente: InfoCliente,
  ): Promise<RevisionImportacion> {
    await this.limites.consumir(`importar_cuentas:${auth.usuario.id}`, LIMITE_IMPORTAR_CUENTAS);
    await this.servicio(e.servicioId);
    const huellas = e.filas.map((f) => this.cuentas.huella(f.usuario));
    const guardadas = await this.prisma.cuentaServicio.findMany({
      where: { usuarioHuella: { in: [...new Set(huellas)] } },
      select: { ...SELECCION, claveCifrada: true },
    });
    const porHuella = new Map(guardadas.map((c) => [c.usuarioHuella, c]));

    const filas = e.filas.map((f, indice): FilaRevisada => {
      const c = porHuella.get(huellas[indice]!);
      if (!c) {
        return {
          indice,
          estado: f.clave ? 'nueva' : 'sin_clave',
          cuenta: null,
          fechaDistinta: false,
          fechaPosterior: false,
          claveDistinta: false,
        };
      }
      const guardada = dia(c.facturaEn);
      return {
        indice,
        estado: c.servicio.id === e.servicioId ? 'existe' : 'otro_servicio',
        cuenta: encontrada(c),
        fechaDistinta: Boolean(f.fecha && guardada && f.fecha !== guardada),
        fechaPosterior: Boolean(f.fecha && (!guardada || f.fecha > guardada)),
        claveDistinta: Boolean(
          f.clave && this.cifrador.descifrar(c.claveCifrada, contextoClave(c.id)) !== f.clave,
        ),
      };
    });

    const proveedor = e.proveedor?.trim();
    const noEstan = await this.prisma.cuentaServicio.findMany({
      where: {
        servicioId: e.servicioId,
        estado: { not: 'retirada' },
        usuarioHuella: { notIn: huellas },
        ...(proveedor ? { proveedor: { equals: proveedor, mode: 'insensitive' } } : {}),
      },
      select: SELECCION,
      orderBy: [{ facturaEn: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: MAX_NO_ESTAN,
    });

    const cuenta = (p: (f: FilaRevisada) => boolean) => filas.filter(p).length;
    const conteo = {
      nuevas: cuenta((f) => f.estado === 'nueva'),
      sinClave: cuenta((f) => f.estado === 'sin_clave'),
      existen: cuenta((f) => f.estado === 'existe'),
      otroServicio: cuenta((f) => f.estado === 'otro_servicio'),
      fechaDistinta: cuenta((f) => f.estado === 'existe' && f.fechaDistinta),
      claveDistinta: cuenta((f) => f.estado === 'existe' && f.claveDistinta),
      noEstan: noEstan.length,
    };
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'cuenta_servicio.lista_revisada',
      entidad: 'servicio',
      entidadId: e.servicioId,
      despues: { filas: e.filas.length, ...conteo },
      cliente,
    });
    return { filas, noEstan: noEstan.map(encontrada), conteo };
  }

  /** Crea las cuentas nuevas y actualiza las elegidas, todo o nada. */
  async importar(
    auth: ContextoAuth,
    e: ImportarCuentasEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoImportacion> {
    await this.limites.consumir(`importar_cuentas:${auth.usuario.id}`, LIMITE_IMPORTAR_CUENTAS);
    await this.servicio(e.servicioId);
    const nuevas = e.nuevas ?? [];
    const actualizar = e.actualizar ?? [];
    const huellas = nuevas.map((f) => this.cuentas.huella(f.usuario));
    if (new Set(huellas).size !== huellas.length) {
      throw new ErrorApp(400, 'FILAS_REPETIDAS', 'Hay correos repetidos entre las cuentas nuevas.');
    }
    if (new Set(actualizar.map((a) => a.cuentaId)).size !== actualizar.length) {
      throw new ErrorApp(
        400,
        'FILAS_REPETIDAS',
        'Hay cuentas repetidas entre las que se actualizan.',
      );
    }
    const { nuevas: _n, actualizar: _a, servicioId, ...comunes } = e;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          for (const f of nuevas) {
            const id = randomUUID();
            const datos = { ...comunes, usuario: f.usuario, clave: f.clave };
            await tx.cuentaServicio.create({
              data: this.cuentas.datosNueva(
                id,
                { ...datos, facturaEn: f.fecha ?? comunes.facturaEn ?? null },
                servicioId,
                auth.usuario.id,
              ),
            });
            await this.auditoria.registrar(
              {
                actorId: auth.usuario.id,
                accion: 'cuenta_servicio.creada',
                entidad: 'cuenta_servicio',
                entidadId: id,
                despues: {
                  servicioId,
                  modo: e.modo,
                  perfiles: e.modo === 'completa' ? 1 : e.perfiles,
                  origen: 'importacion',
                },
                cliente,
              },
              tx,
            );
          }
          if (actualizar.length) {
            const existentes = await tx.cuentaServicio.findMany({
              where: { id: { in: actualizar.map((a) => a.cuentaId) } },
              select: { id: true },
            });
            if (existentes.length !== actualizar.length)
              throw Errores.noEncontrado('Una de las cuentas');
          }
          for (const a of actualizar) {
            const cambios: string[] = [];
            const data: Prisma.CuentaServicioUpdateInput = {};
            if (a.facturaEn !== undefined) {
              data.facturaEn = fechaODb(a.facturaEn);
              cambios.push('facturaEn');
            }
            if (a.clave !== undefined) {
              data.claveCifrada = this.cifrador.cifrar(a.clave, contextoClave(a.cuentaId));
              cambios.push('clave');
            }
            await tx.cuentaServicio.update({ where: { id: a.cuentaId }, data });
            await this.auditoria.registrar(
              {
                actorId: auth.usuario.id,
                accion: 'cuenta_servicio.editada',
                entidad: 'cuenta_servicio',
                entidadId: a.cuentaId,
                despues: { cambios, origen: 'importacion' },
                cliente,
              },
              tx,
            );
          }
          return { creadas: nuevas.length, actualizadas: actualizar.length };
        },
        { timeout: 60_000 },
      );
    } catch (err) {
      if (esUnicoDuplicado(err)) {
        throw new ErrorApp(
          409,
          'CUENTA_REPETIDA',
          'Alguna de las cuentas nuevas ya se guardó mientras tanto. Revisa el archivo otra vez.',
        );
      }
      throw err;
    }
  }
}
