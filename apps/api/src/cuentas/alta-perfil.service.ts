import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type AltaPerfilEntrada,
  esTitular,
  type Permiso,
  type ResultadoAltaPerfil,
  tienePermiso,
  tipoPlataforma,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { FacturacionService } from '../cobros/facturacion.service.js';
import { PagosService } from '../cobros/pagos.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { D, sumarDuracion } from '../dinero/dinero.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';
import { CuentasService } from './cuentas.service.js';

/**
 * Alta desde un perfil libre, como en el Gestor: en una sola transacción crea
 * el cliente (si es nuevo), la suscripción activa con su vencimiento, la venta
 * pagada (si se indicó cómo pagó, para Caja y Balance) y asigna el perfil.
 */
@Injectable()
export class AltaPerfilService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CuentasService) private readonly cuentas: CuentasService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async alta(
    auth: ContextoAuth,
    cuentaId: string,
    perfilId: string,
    e: AltaPerfilEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoAltaPerfil> {
    const necesita: Permiso[] = [
      'suscripciones.crear',
      ...(e.clienteNuevo ? (['clientes.gestionar'] as const) : []),
      ...(e.metodoCobroId ? (['pagos.gestionar'] as const) : []),
    ];
    const falta = necesita.find((x) => !tienePermiso(auth.usuario.rol, x));
    if (falta) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'Tu rol no permite hacer esta alta completa.');
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const p = await this.cuentas.perfilLibre(tx, cuentaId, perfilId);
      const cuenta = await tx.cuentaServicio.findUniqueOrThrow({
        where: { id: cuentaId },
        select: { servicioId: true, servicio: { select: { nombre: true } } },
      });
      const tipo = tipoPlataforma(cuenta.servicio.nombre);
      const conMiembro = tipo === 'familiar' && !esTitular(tipo, p.numero);
      if (!conMiembro && (e.usuarioMiembro || e.claveMiembro)) {
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'El correo propio solo va en los cupos de un plan familiar.',
          { usuarioMiembro: ['Este lugar entra con los datos de la cuenta.'] },
        );
      }

      const plan = await this.suscripciones.planContratable(tx, auth, e.planId);
      if (plan.servicioId !== cuenta.servicioId) {
        throw new ErrorApp(409, 'OTRO_SERVICIO', 'Ese plan es de otro servicio.');
      }
      if (plan.tipo !== 'suscripcion') {
        throw new ErrorApp(409, 'PLAN_NO_DISPONIBLE', 'Elige un plan de suscripción.');
      }

      const titular = e.clienteNuevo
        ? await this.clientes.crearEnTx(
            tx,
            auth,
            { ...e.clienteNuevo, aceptaWhatsapp: e.clienteNuevo.aceptaWhatsapp ?? false },
            cliente,
          )
        : await this.clientes.exigirAlcance(auth, e.clienteId ?? '', tx);
      if (titular.estado !== 'activo') {
        throw new ErrorApp(
          409,
          'CLIENTE_ARCHIVADO',
          'El cliente está archivado; reactívalo primero.',
        );
      }

      const ahora = new Date();
      const venceEn = e.vence
        ? new Date(`${e.vence}T23:59:59Z`)
        : sumarDuracion(ahora, e.meses ?? 1, 'mes');
      const periodos = e.vence ? 1 : (e.meses ?? 1);
      // Cliente de la cartera de un revendedor: la suscripción también es suya (él le cobra).
      const { revendedorId } = await tx.cliente.findUniqueOrThrow({
        where: { id: titular.id },
        select: { revendedorId: true },
      });
      const s = await tx.suscripcion.create({
        data: {
          clienteId: titular.id,
          revendedorId,
          planId: plan.id,
          moneda: e.moneda,
          estado: 'activa',
          inicioEn: ahora,
          venceEn,
          creadoPorId: auth.usuario.id,
        },
      });
      const datos = { cuentaId, perfilId, origen: 'alta_perfil' };
      await tx.eventoSuscripcion.createMany({
        data: [
          { suscripcionId: s.id, tipo: 'alta', actorId: auth.usuario.id, datos },
          { suscripcionId: s.id, tipo: 'activacion', actorId: auth.usuario.id, datos },
        ],
      });

      let facturaId: string | null = null;
      if (e.metodoCobroId) {
        const factura = await this.facturacion.emitir(tx, {
          clienteId: titular.id,
          suscripcionId: s.id,
          plan,
          moneda: e.moneda,
          concepto: 'alta',
          actorId: auth.usuario.id,
          periodos,
          precioUnitario: D(e.precio),
        });
        if (factura.estado === 'emitida') {
          await this.pagos.registrarCobrado(
            tx,
            auth.usuario.id,
            factura,
            { metodoCobroId: e.metodoCobroId, referenciaExterna: e.referenciaExterna },
            cliente,
          );
        }
        facturaId = factura.id;
      }

      await this.cuentas.asignarEnTx(tx, auth, cuentaId, perfilId, s.id, cliente);
      if (conMiembro && e.usuarioMiembro) {
        await this.cuentas.guardarMiembro(tx, perfilId, e.usuarioMiembro, e.claveMiembro ?? null);
      }

      const total = D(e.precio).mul(periodos);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'suscripcion.creada',
          entidad: 'suscripcion',
          entidadId: s.id,
          despues: {
            origen: 'alta_perfil',
            clienteId: titular.id,
            clienteNuevo: Boolean(e.clienteNuevo),
            planId: plan.id,
            cuentaId,
            perfilId,
            venceEn: venceEn.toISOString(),
            precio: total.toFixed(2),
            moneda: e.moneda,
            facturaId,
            miembro: Boolean(conMiembro && e.usuarioMiembro),
          },
          cliente,
        },
        tx,
      );
      return { clienteId: titular.id, suscripcionId: s.id, facturaId };
    });
    return { ...r, cuenta: await this.cuentas.ver(cuentaId) };
  }
}
