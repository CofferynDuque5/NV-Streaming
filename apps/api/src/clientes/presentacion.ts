import type { Cliente, ContactoCliente, EstadoSuscripcion, Usuario } from '@nv/db';
import type { ClienteDetalle, ClienteResumen } from '@nv/shared';
import { iso } from '../comun/formato.js';

export type ClienteConRelaciones = Cliente & {
  asignadoA: Pick<Usuario, 'id' | 'nombre'> | null;
  usuario: Pick<Usuario, 'id' | 'correo' | 'ultimoAccesoEn'> | null;
  _count: { suscripciones: number };
};

export const INCLUIR_CLIENTE = {
  asignadoA: { select: { id: true, nombre: true } },
  usuario: { select: { id: true, correo: true, ultimoAccesoEn: true } },
  _count: {
    select: {
      suscripciones: { where: { estado: { in: ['activa', 'en_gracia'] as EstadoSuscripcion[] } } },
    },
  },
} as const;

export function clienteResumen(c: ClienteConRelaciones): ClienteResumen {
  return {
    id: c.id,
    nombre: c.nombre,
    correo: c.correo,
    pais: c.pais,
    monedaPreferida: c.monedaPreferida,
    estado: c.estado,
    asignadoA: c.asignadoA,
    tieneAcceso: c.usuarioId !== null,
    suscripcionesActivas: c._count.suscripciones,
    creadoEn: iso(c.creadoEn)!,
  };
}

export function clienteDetalle(
  c: ClienteConRelaciones & { contactos: ContactoCliente[] },
): ClienteDetalle {
  return {
    ...clienteResumen(c),
    documento: c.documento,
    origen: c.origen,
    contactos: c.contactos.map((k) => ({
      id: k.id,
      tipo: k.tipo,
      valor: k.valor,
      consentimientoEn: iso(k.consentimientoEn),
    })),
    usuario: c.usuario
      ? {
          id: c.usuario.id,
          correo: c.usuario.correo,
          ultimoAccesoEn: iso(c.usuario.ultimoAccesoEn),
        }
      : null,
    actualizadoEn: iso(c.actualizadoEn)!,
  };
}
