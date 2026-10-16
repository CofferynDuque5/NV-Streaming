import { type CentroEquipo, formatearMonto, type MetricasPanel } from '@nv/shared';
import type { ModuloEquipo } from './navegacion';

/** «1 cupón activo», «3 cupones activos». */
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que «Al día» nombra cuando su cola está vacía. */
export type ColaLibre = 'pagos' | 'soporte' | 'entregas' | 'revendedores' | 'asistente';

export interface ItemCola {
  clave: string;
  /** Módulo que lo atiende: su insignia lo cuenta (salvo los códigos, que no son trabajo en cola). */
  modulo: ModuloEquipo;
  /** Icono del orbe (la billetera tiene el suyo dentro de Cobros). */
  icono: ModuloEquipo | 'billetera';
  color: string;
  /** Lo más urgente primero. */
  orden: number;
  /** Título: texto, la cifra resaltada y el resto. */
  antes: string;
  n: number | null;
  despues: string;
  detalle: string;
  urgente: boolean;
  href: string;
  libre: ColaLibre | null;
  /** Suma en la insignia del módulo. */
  cuenta: number;
}

/**
 * «Para atender»: las colas reales que el rol puede atender, ordenadas por
 * urgencia (solicitudes fuera de plazo, pagos, entregas fallidas…). Las vacías
 * no salen: van a «Al día».
 */
export function colaEquipo(c: CentroEquipo, soloCartera: boolean): ItemCola[] {
  const q = c.colas;
  const it: ItemCola[] = [];
  const agregar = (
    n: number | null | undefined,
    item: Omit<ItemCola, 'n' | 'antes' | 'cuenta'> & { antes?: string; cuenta?: boolean },
  ) => {
    if (!n) return;
    it.push({ ...item, n, antes: item.antes ?? '', cuenta: item.cuenta === false ? 0 : n });
  };

  agregar(q.pagosEnRevision, {
    clave: 'pagos',
    modulo: 'cobros',
    icono: 'cobros',
    color: '#4f8dff',
    orden: 1,
    despues: q.pagosEnRevision === 1 ? 'pago por conciliar' : 'pagos por conciliar',
    detalle: 'Comprobantes de facturas y pedidos que envió el cliente',
    urgente: false,
    href: '/admin/cobros?vista=conciliar',
    libre: 'pagos',
  });
  agregar(q.recargasBilletera, {
    clave: 'billetera',
    modulo: 'cobros',
    icono: 'billetera',
    color: '#22d3ee',
    orden: 3,
    despues:
      q.recargasBilletera === 1
        ? 'recarga de billetera por revisar'
        : 'recargas de billetera por revisar',
    detalle: 'Al confirmarlas se suma el saldo del cliente',
    urgente: false,
    href: '/admin/cobros?vista=billeteras',
    libre: 'pagos',
  });
  agregar(q.recargasRevendedor, {
    clave: 'recargas-revendedor',
    modulo: 'revendedores',
    icono: 'revendedores',
    color: '#a855f7',
    orden: 4,
    despues:
      q.recargasRevendedor === 1
        ? 'recarga de revendedor por revisar'
        : 'recargas de revendedores por revisar',
    detalle: 'Saldo mayorista, aparte de la billetera',
    urgente: false,
    href: '/admin/revendedores?vista=recargas',
    libre: 'pagos',
  });
  if (q.tickets) {
    const { abiertos, fueraDePlazo } = q.tickets;
    agregar(abiertos, {
      clave: 'soporte',
      modulo: 'soporte',
      icono: 'soporte',
      color: '#22d3ee',
      orden: fueraDePlazo ? 0 : 5,
      despues: abiertos === 1 ? 'solicitud abierta' : 'solicitudes abiertas',
      detalle: fueraDePlazo
        ? `${fueraDePlazo} fuera de plazo de primera respuesta`
        : abiertos === 1
          ? 'Dentro del plazo'
          : 'Todas dentro del plazo',
      urgente: fueraDePlazo > 0,
      href: '/admin/soporte',
      libre: 'soporte',
    });
  }
  if (q.entregas) {
    const { fallidas, pendientes } = q.entregas;
    const total = fallidas + pendientes;
    agregar(total, {
      clave: 'entregas',
      modulo: 'entregas',
      icono: 'entregas',
      color: '#22c55e',
      orden: fallidas ? 2 : 6,
      despues: total === 1 ? 'entrega necesita atención' : 'entregas necesitan atención',
      detalle: [
        fallidas ? plural(fallidas, 'fallida', 'fallidas') : '',
        pendientes ? plural(pendientes, 'pendiente', 'pendientes') : '',
      ]
        .filter(Boolean)
        .join(' · '),
      urgente: fallidas > 0,
      href: `/admin/entregas?estado=${fallidas ? 'fallida' : 'pendiente'}`,
      libre: 'entregas',
    });
  }
  agregar(q.solicitudesRevendedor, {
    clave: 'solicitudes',
    modulo: 'revendedores',
    icono: 'revendedores',
    color: '#a855f7',
    orden: 7,
    despues:
      q.solicitudesRevendedor === 1 ? 'solicitud de revendedor' : 'solicitudes de revendedor',
    detalle: 'Revisa sus datos y asígnale un nivel',
    urgente: false,
    href: '/admin/revendedores?vista=solicitudes',
    libre: 'revendedores',
  });
  agregar(q.facturasVencidas, {
    clave: 'vencidas',
    modulo: 'cobros',
    icono: 'cupones',
    color: '#f59e0b',
    orden: 8,
    despues: q.facturasVencidas === 1 ? 'factura vencida sin pagar' : 'facturas vencidas sin pagar',
    detalle: soloCartera ? 'De tu cartera de clientes' : 'Ya pasó su fecha límite',
    urgente: false,
    href: '/admin/cobros?vista=facturas&vencidas=true',
    libre: null,
  });
  agregar(q.accionesAsistente, {
    clave: 'acciones',
    modulo: 'asistente',
    icono: 'asistente',
    color: '#d946ef',
    orden: 9,
    despues:
      q.accionesAsistente === 1
        ? 'acción del asistente por confirmar'
        : 'acciones del asistente por confirmar',
    detalle: 'Nada se ejecuta sin tu confirmación',
    urgente: false,
    href: '/admin/asistente/acciones?estado=propuesta',
    libre: 'asistente',
  });
  for (const p of q.pocosCodigos ?? []) {
    const nombre = `${p.servicio} ${p.plan}`;
    it.push({
      clave: `codigos-${p.planId}`,
      modulo: 'inventario',
      icono: 'inventario',
      color: '#22c55e',
      orden: 10,
      antes:
        p.disponibles === 0
          ? `No quedan códigos de ${nombre}`
          : p.disponibles === 1
            ? 'Queda '
            : 'Quedan ',
      n: p.disponibles === 0 ? null : p.disponibles,
      despues:
        p.disponibles === 0 ? '' : `${p.disponibles === 1 ? 'código' : 'códigos'} de ${nombre}`,
      detalle: p.pendientes
        ? `${plural(p.pendientes, 'entrega espera', 'entregas esperan')} un código`
        : 'Carga un lote nuevo antes de que se agoten',
      urgente: p.disponibles === 0 || p.pendientes > 0,
      href: `/admin/inventario?plan=${p.planId}`,
      libre: null,
      cuenta: 0,
    });
  }
  return it.sort((a, b) => a.orden - b.orden);
}

/** Las colas que el rol atiende y están vacías («Al día: Pagos, Soporte…»). */
export function colasAlDia(c: CentroEquipo, items: ItemCola[]): string[] {
  const q = c.colas;
  const colas: [ColaLibre, string, boolean][] = [
    ['pagos', 'Pagos', q.pagosEnRevision !== null],
    ['soporte', 'Soporte', q.tickets !== null],
    ['entregas', 'Entregas', q.entregas !== null],
    ['revendedores', 'Revendedores', q.solicitudesRevendedor !== null],
    ['asistente', 'Asistente', q.accionesAsistente !== null],
  ];
  return colas
    .filter(([k, , puede]) => puede && !items.some((x) => x.libre === k))
    .map(([, t]) => t);
}

/** Pendientes de cada módulo para las insignias del menú, la barra y la cuadrícula. */
export function pendientesPorModulo(items: ItemCola[]): Partial<Record<ModuloEquipo, number>> {
  const r: Partial<Record<ModuloEquipo, number>> = {};
  for (const x of items) if (x.cuenta) r[x.modulo] = (r[x.modulo] ?? 0) + x.cuenta;
  return r;
}

const usd = (v: string) => formatearMonto(Number(v).toFixed(2), 'USD');

/**
 * Línea de estado de cada módulo en la cuadrícula: una cifra real o, en
 * ámbar, lo que necesita atención. Vacía si la API no la dio.
 */
export function estadoModulo(
  clave: ModuloEquipo,
  c: CentroEquipo,
  m: MetricasPanel | null,
): { texto: string; aviso: boolean } {
  const ok = (texto: string) => ({ texto, aviso: false });
  const aviso = (texto: string) => ({ texto, aviso: true });
  const { colas: q, modulos: mo, sistema: s } = c;
  switch (clave) {
    case 'cobros':
      return ok(m ? `Cobrado ${usd(m.ingresosMesUsd)} este mes` : '');
    case 'soporte':
      if (!q.tickets) return ok('');
      if (q.tickets.fueraDePlazo) return aviso(`${q.tickets.fueraDePlazo} fuera de plazo`);
      return ok(q.tickets.abiertos ? 'Dentro del plazo' : 'Sin solicitudes abiertas');
    case 'entregas':
      if (!q.entregas) return ok('');
      return q.entregas.fallidas
        ? aviso(plural(q.entregas.fallidas, 'fallida', 'fallidas'))
        : ok('Sin fallas');
    case 'revendedores':
      if (!mo.revendedores) return ok('');
      return ok(
        [
          plural(mo.revendedores.aprobados, 'aprobado', 'aprobados'),
          mo.revendedores.suspendidos
            ? plural(mo.revendedores.suspendidos, 'suspendido', 'suspendidos')
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    case 'asistente':
      if (!s.asistente) return ok('');
      if (!s.asistente.activo) return aviso('Desactivado');
      if (!s.asistente.disponible) return aviso('No disponible por ahora');
      if (!s.asistente.mensajesRestantesHoy) return aviso('Sin mensajes por hoy');
      return ok(
        `${plural(s.asistente.mensajesRestantesHoy, 'mensaje disponible', 'mensajes disponibles')} hoy`,
      );
    case 'clientes':
      return ok(m ? plural(m.clientesActivos, 'activo', 'activos') : '');
    case 'suscripciones':
      return ok(
        m
          ? `${plural(m.suscripcionesPorEstado.activa, 'activa', 'activas')} · ${m.suscripcionesPorEstado.en_gracia} en gracia`
          : '',
      );
    case 'cupones':
      return ok(
        mo.cuponesActivos === null
          ? ''
          : plural(mo.cuponesActivos, 'cupón activo', 'cupones activos'),
      );
    case 'catalogo':
      return ok(
        mo.catalogo
          ? `${plural(mo.catalogo.servicios, 'servicio', 'servicios')} · ${plural(mo.catalogo.planes, 'plan', 'planes')}`
          : '',
      );
    case 'inventario':
      if (!q.pocosCodigos) return ok('');
      return q.pocosCodigos.length
        ? aviso(`${plural(q.pocosCodigos.length, 'plan', 'planes')} con pocos códigos`)
        : ok('Stock suficiente');
    case 'finanzas':
      if (!c.tasasFaltantes) return ok('');
      return c.tasasFaltantes.length
        ? aviso(
            c.tasasFaltantes.length === 1
              ? 'Falta 1 tasa'
              : `Faltan ${c.tasasFaltantes.length} tasas`,
          )
        : ok('Tasas al día');
    case 'pasarelas': {
      if (!s.pasarelas) return ok('');
      const listas = s.pasarelas.filter((p) => p.configurada);
      return listas.length
        ? ok(
            listas.map((p) => `${p.nombre}${p.modo === 'pruebas' ? ' (pruebas)' : ''}`).join(' · '),
          )
        : aviso('Sin configurar');
    }
    case 'sitio':
      if (mo.paginasPublicadas === null) return ok('');
      return mo.paginasPublicadas
        ? ok(plural(mo.paginasPublicadas, 'página publicada', 'páginas publicadas'))
        : aviso('Sin páginas publicadas');
    case 'equipo':
      return ok(
        mo.equipo === null ? '' : plural(mo.equipo, 'persona del equipo', 'personas del equipo'),
      );
    case 'automatizaciones':
      if (mo.automatizacionesActivas === null) return ok('');
      return c.trabajador.activo
        ? ok(`${plural(mo.automatizacionesActivas, 'activa', 'activas')} · trabajador en marcha`)
        : aviso('Trabajador detenido');
    case 'auditoria':
      return ok('Todo queda registrado');
  }
}
