import {
  type AccesoServicio,
  type BilleteraPublica,
  formatearMonto,
  type MetodoAutorizadoPublico,
  type Pagina,
  type ResumenCliente,
  type SuscripcionPublica,
  type TicketResumen,
} from '@nv/shared';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { Cifra } from '@/componentes/cliente/piezas-cuenta';
import {
  AvisosCuenta,
  type AvisoCuenta,
  ServiciosCuenta,
  type VistaServicio,
} from '@/componentes/cliente/inicio-cuenta';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { diasHasta, formatearDuracion } from '@/lib/formato';
import { leerPanelCliente } from '@/lib/panel-cliente';
import { monedaAdmitePagoEnLinea } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis servicios' };

const corta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const larga = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' });
const fCorta = (iso: string) => corta.format(new Date(iso));
const fLarga = (iso: string) => larga.format(new Date(iso));
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

const RENOVABLES = new Set(['activa', 'en_gracia', 'suspendida', 'vencida']);
const CON_COBRO_AUTOMATICO = new Set(['activa', 'en_gracia', 'suspendida']);
const TERMINADOS = new Set(['cancelada', 'vencida', 'suspendida']);

/** Activa, sin cancelación programada y con 7 días o menos por delante. */
function porVencer(s: SuscripcionPublica) {
  return s.estado === 'activa' && !s.cancelarAlVencer && !!s.venceEn && diasHasta(s.venceEn) <= 7;
}

function vigencia(s: SuscripcionPublica): string {
  if (s.estado === 'pendiente_pago')
    return s.gestionadaPorRevendedor
      ? 'Se activa cuando tu revendedor confirme el pago.'
      : 'Se activa cuando confirmemos tu pago.';
  if (s.estado === 'pausada') return 'Pausada. Los días que te quedaban se conservan.';
  if (s.estado === 'cancelada')
    return s.canceladaEn ? `Cancelada el ${fLarga(s.canceladaEn)}.` : 'Cancelada.';
  if (!s.venceEn) return '';
  const d = diasHasta(s.venceEn);
  if (s.estado === 'en_gracia')
    return `Venció ${d === 0 ? 'hoy' : d === -1 ? 'ayer' : `el ${fLarga(s.venceEn)}`}. Renueva para no perder el servicio.`;
  if (s.estado === 'suspendida' || s.estado === 'vencida') return `Venció el ${fLarga(s.venceEn)}.`;
  if (s.cancelarAlVencer) return `Termina el ${fLarga(s.venceEn)} y no se renovará.`;
  const cuando = d <= 7 ? ` (en ${d <= 0 ? 'menos de un día' : dias(d)})` : '';
  return `Vence el ${fLarga(s.venceEn)}${cuando}.`;
}

function barra(s: SuscripcionPublica, ahora = Date.now()): VistaServicio['barra'] {
  if (!s.inicioEn || !s.venceEn || ['cancelada', 'pendiente_pago'].includes(s.estado)) return null;
  const ini = new Date(s.inicioEn).getTime();
  const total = Math.max(new Date(s.venceEn).getTime() - ini, 1);
  const pasado = Math.min(Math.max(ahora - ini, 0), total);
  const pct = Math.round((pasado / total) * 100);
  const d = diasHasta(s.venceEn);
  return {
    pct,
    tono: s.estado === 'en_gracia' ? 'rojo' : d <= 7 ? 'ambar' : 'normal',
    desde: `Desde ${fCorta(s.inicioEn)}`,
    resta: d > 0 ? `Quedan ${dias(d)}` : 'Periodo terminado',
  };
}

export default async function MisServicios() {
  const sesion = await requerirSesion({ roles: ['cliente'] });
  const panel = await leerPanelCliente();
  const revendedor = panel?.revendedor ?? null;
  const [{ datos }, { datos: metodos }, { datos: accesos }, { datos: tickets }, billetera] =
    await Promise.all([
      leerApi<ResumenCliente>('/mi/resumen'),
      revendedor
        ? Promise.resolve({ datos: null })
        : leerApi<MetodoAutorizadoPublico[]>('/mi/metodos-autorizados'),
      leerApi<AccesoServicio[]>('/mi/accesos'),
      leerApi<Pagina<TicketResumen>>('/mi/tickets?estado=esperando_cliente&porPagina=5'),
      leerApi<BilleteraPublica>('/mi/billetera'),
    ]);
  const nombre = sesion.usuario.nombre.split(' ')[0];

  if (!datos) {
    return (
      <>
        <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Hola, {nombre}</h1>
        <Alerta tono="peligro">
          No pudimos cargar tus servicios. Recarga la página en un momento.
        </Alerta>
      </>
    );
  }

  const { suscripciones, facturasPendientes, ticketsAbiertos } = datos;
  const conRevendedor = revendedor !== null;
  const enRevision = new Set(facturasPendientes.filter((f) => f.pagoEnRevision).map((f) => f.id));
  const listos = (accesos ?? []).filter((a) => a.estado === 'entregada');

  // Lo que activó su revendedor lo renueva y lo paga él; lo que el cliente
  // compró directo en la tienda lo gestiona el cliente, tenga o no revendedor.
  const servicios: VistaServicio[] = suscripciones.map((s) => {
    const propia = !s.gestionadaPorRevendedor;
    const fin = s.estado === 'cancelada';
    const terminado = TERMINADOS.has(s.estado);
    const acceso = listos.find((a) => a.suscripcion?.id === s.id);
    return {
      s,
      duracion: formatearDuracion(s.plan.duracionCantidad, s.plan.duracionUnidad),
      vigencia: vigencia(s),
      barra: barra(s),
      venceLargo: s.venceEn ? fLarga(s.venceEn) : null,
      pagoEnRevision: !!s.facturaAbierta && enRevision.has(s.facturaAbierta.id),
      puedeRenovar:
        propia &&
        !s.facturaAbierta &&
        !s.cancelarAlVencer &&
        s.plan.renovable &&
        RENOVABLES.has(s.estado),
      renovarDestacado: s.estado !== 'activa' || porVencer(s),
      puedeCancelar:
        propia &&
        !s.cancelarAlVencer &&
        ['activa', 'en_gracia', 'pendiente_pago'].includes(s.estado),
      admiteCobroAutomatico:
        !conRevendedor &&
        s.plan.renovable &&
        CON_COBRO_AUTOMATICO.has(s.estado) &&
        !s.cancelarAlVencer &&
        monedaAdmitePagoEnLinea(s.moneda),
      accesoId: acceso?.id ?? null,
      grupos: [
        'todos',
        ...(['activa', 'en_gracia'].includes(s.estado) ? (['activos'] as const) : []),
        ...(porVencer(s) || s.estado === 'en_gracia' ? (['vencer'] as const) : []),
        ...(s.estado === 'pendiente_pago' ? (['pendientes'] as const) : []),
        ...(terminado ? (['terminados'] as const) : []),
      ],
      fin,
    };
  });

  // «Para revisar»: lo que el cliente tiene que hacer, cada cosa con una sola acción.
  const avisos: AvisoCuenta[] = [];
  // Las facturas de lo que gestiona su revendedor las paga el revendedor: no se le piden.
  for (const f of facturasPendientes.filter(
    (f) => !f.pagoEnRevision && !f.gestionadaPorRevendedor,
  )) {
    const concepto = f.plan
      ? `${f.concepto === 'alta' ? 'Alta' : 'Renovación'} · ${f.plan.servicio.nombre} ${f.plan.nombre} · `
      : '';
    avisos.push({
      clave: `f-${f.id}`,
      tipo: 'factura',
      titulo: `Factura ${f.numero} por pagar`,
      texto: `${concepto}${formatearMonto(f.total, f.moneda)} · ${f.vencida ? 'venció' : 'antes del'} ${fLarga(f.venceEn)}`,
      href: `/cuenta/facturas/${f.id}`,
    });
  }
  const conCobroSolo = (s: SuscripcionPublica) => !!s.cobroAutomatico || !!s.facturaAbierta;
  for (const s of suscripciones) {
    if (s.estado !== 'en_gracia' || conCobroSolo(s)) continue;
    avisos.push({
      clave: `g-${s.id}`,
      tipo: 'gracia',
      titulo: `${s.plan.servicio} venció`,
      texto: s.gestionadaPorRevendedor
        ? 'Tienes unos días de gracia. Pídele la renovación a tu revendedor.'
        : 'Tienes unos días de gracia. Renueva para no perderlo.',
      servicioId: s.gestionadaPorRevendedor ? undefined : s.id,
    });
  }
  for (const s of suscripciones) {
    if (!porVencer(s) || conCobroSolo(s) || !s.venceEn) continue;
    const d = diasHasta(s.venceEn);
    avisos.push({
      clave: `v-${s.id}`,
      tipo: 'vence',
      titulo: d <= 0 ? `${s.plan.servicio} vence hoy` : `${s.plan.servicio} vence en ${dias(d)}`,
      texto: s.gestionadaPorRevendedor
        ? 'Pídele la renovación a tu revendedor.'
        : 'Renueva ahora y no pierdes ni un día.',
      servicioId: s.gestionadaPorRevendedor || !s.plan.renovable ? undefined : s.id,
    });
  }
  for (const a of listos.filter((a) => !a.vistaEn && (a.tieneCodigo || a.tieneEnlace))) {
    avisos.push({
      clave: `a-${a.id}`,
      tipo: 'acceso',
      titulo: `Tu acceso de ${a.servicio} está listo`,
      texto: 'Míralo y actívalo en tu propia cuenta.',
      href: `/cuenta/accesos#acceso-${a.id}`,
    });
  }
  for (const t of tickets?.elementos ?? []) {
    avisos.push({
      clave: `t-${t.id}`,
      tipo: 'ticket',
      titulo: `Te respondimos: ${t.asunto}`,
      texto: `Solicitud #${t.numero} · esperando tu respuesta`,
      href: `/cuenta/soporte/${t.id}`,
    });
  }

  const activos = suscripciones.filter((s) => ['activa', 'en_gracia'].includes(s.estado));
  const proxima = suscripciones
    .filter((s) => s.estado === 'activa' && s.venceEn)
    .sort((a, b) => a.venceEn!.localeCompare(b.venceEn!))[0];
  const saldo = billetera?.datos ? formatearMonto(billetera.datos.saldoUsd, 'USD') : null;
  const diasProxima = proxima?.venceEn ? diasHasta(proxima.venceEn) : 0;

  const cifraSaldo = (
    <Cifra
      titulo="Saldo"
      valor={saldo ?? '—'}
      detalle={saldo ? 'Billetera NV' : 'No pudimos leerlo'}
      href="/cuenta/billetera"
    />
  );
  const solicitudes = (
    <Cifra
      titulo="Solicitudes abiertas"
      valor={ticketsAbiertos}
      detalle={
        (tickets?.total ?? 0) > 0
          ? 'Te respondimos'
          : ticketsAbiertos
            ? 'Las estamos viendo'
            : '¿Dudas? Escríbenos'
      }
      href="/cuenta/soporte"
    />
  );

  const cifras = (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      <Cifra
        titulo="Servicios activos"
        valor={activos.length}
        detalle={
          activos.length
            ? [...new Set(activos.map((s) => s.plan.servicio))].slice(0, 3).join(', ')
            : 'Ninguno por ahora'
        }
      />
      <Cifra
        titulo="Próximo vencimiento"
        valor={proxima ? (diasProxima <= 0 ? 'Hoy' : dias(diasProxima)) : '—'}
        detalle={proxima?.venceEn ? `${proxima.plan.servicio} · ${fCorta(proxima.venceEn)}` : ''}
      />
      {cifraSaldo}
      {solicitudes}
    </div>
  );

  const avisoRevendedor = revendedor && (
    <AvisosCuenta
      etiqueta="Tu revendedor"
      avisos={[
        {
          clave: 'revendedor',
          tipo: 'revendedor',
          titulo: `Eres cliente de ${revendedor.nombre}`,
          texto: `Los servicios que te activa ${revendedor.nombre} los renuevas con él. También puedes comprar directo en la tienda y pagar con tu billetera.`,
        },
      ]}
    />
  );

  if (suscripciones.length === 0) {
    return (
      <>
        {avisoRevendedor}
        <div className="grid gap-1">
          <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Hola, {nombre}</h1>
          <p className="max-w-[35rem] text-tinta-suave">
            Aquí verás tus servicios, lo que tienes por pagar y tus solicitudes de ayuda.
          </p>
        </div>
        <ServiciosCuenta servicios={[]} metodos={[]} conRevendedor={conRevendedor} />
        <div className="grid grid-cols-2 gap-2.5">
          {cifraSaldo}
          {solicitudes}
        </div>
      </>
    );
  }

  return (
    <>
      {avisoRevendedor}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Hola, {nombre}</h1>
          <p className="max-w-[35rem] text-tinta-suave">
            {avisos.length
              ? `Tienes ${avisos.length} ${avisos.length === 1 ? 'cosa que revisar' : 'cosas que revisar'}.`
              : 'Todo está al día.'}
          </p>
        </div>
        <BotonEnlace href="/catalogo" variante="secundario">
          <Plus className="size-4" aria-hidden="true" />
          Contratar otro plan
        </BotonEnlace>
      </div>
      {avisos.length > 0 && <AvisosCuenta etiqueta="Para revisar" avisos={avisos} />}
      {cifras}
      <ServiciosCuenta
        servicios={servicios}
        metodos={metodos ?? []}
        conRevendedor={conRevendedor}
      />
    </>
  );
}
