// Sin 'use client': secciones del centro de módulos del equipo (/admin).
import {
  type CentroEquipo,
  type EstadoSuscripcion,
  formatearMonto,
  type MetricasPanel,
  type Permiso,
  type RegistroAuditoria,
  type SuscripcionPublica,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, Clock, Coins, Settings, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { PildoraEstado } from '@/componentes/cliente/pago';
import { Aviso, claseEnlace, claseFila, claseLista } from '@/componentes/cliente/piezas-cuenta';
import { Kpi, Kpis } from '@/componentes/revendedor/panel';
import { BotonEnlace } from '@/componentes/ui/boton';
import { colasAlDia, type ItemCola } from '@/lib/equipo';
import { ACCIONES_AUDITORIA, diasHasta, haceCuanto } from '@/lib/formato';
import { MODULOS_EQUIPO, type ModuloEquipo } from '@/lib/navegacion';
import { ICONOS_MODULO } from './iconos';

const ZONA = 'America/Caracas';
const usd = (v: string) => formatearMonto(Number(v).toFixed(2), 'USD');
const bs = (v: string) => formatearMonto(v, 'VES');
const COLOR = Object.fromEntries(MODULOS_EQUIPO.map((m) => [m.clave, m.color])) as Record<
  ModuloEquipo,
  string
>;

/** Orbe pequeño con el icono y el color de un módulo. */
function Orbe({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="orbe orbe-sm size-10 text-[1.05rem] after:hidden max-[35rem]:size-[2.125rem] max-[35rem]:text-[0.95rem]"
      style={{ '--c': color } as CSSProperties}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** Sección del centro: título (y una nota) fuera de la caja y, a la derecha, un enlace. */
export function Seccion({
  id,
  titulo,
  nota,
  accion,
  children,
}: {
  id: string;
  titulo: string;
  nota?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid min-w-0 content-start gap-3">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="grid gap-0.5">
          <h2 id={id} className="text-[clamp(1.25rem,2.6vw,1.5rem)]">
            {titulo}
          </h2>
          {nota && <p className="text-[0.8rem] text-tinta-tenue">{nota}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

/* ───────────────────────── cabecera y avisos ───────────────────────── */

export function CabeceraCentro({ nombre, rol }: { nombre: string; rol: string }) {
  const hoy = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: ZONA,
  }).format(new Date());
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)] break-words">Hola, {nombre}</h1>
        <p className="text-tinta-suave">
          Así va NV Streaming hoy · <span className="text-[0.82rem] text-tinta-tenue">{hoy}</span>
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-borde-fuerte bg-marca/12 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-[#c7d2fe]">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        {rol}
      </span>
    </div>
  );
}

/** Avisos de arriba: el trabajador detenido y las tasas que faltan. */
export function AvisosCentro({
  centro,
  puede,
}: {
  centro: CentroEquipo;
  puede: (p: Permiso) => boolean;
}) {
  const t = centro.trabajador;
  const faltan = centro.tasasFaltantes ?? [];
  if (t.activo && faltan.length === 0) return null;
  return (
    <section aria-label="Avisos" className="grid gap-2">
      {!t.activo && (
        <Aviso
          tono="peligro"
          icono={<Settings className="size-4" aria-hidden="true" />}
          titulo="El proceso trabajador no está en marcha"
          accion={
            puede('automatizaciones.ver') && (
              <Link href="/admin/automatizaciones" className={claseEnlace}>
                Ver estado
              </Link>
            )
          }
        >
          {t.ultimoLatidoEn
            ? `Último latido ${haceCuanto(t.ultimoLatidoEn)}.`
            : 'Aún no ha dado señales de vida.'}{' '}
          No salen recordatorios, facturas de renovación ni entregas automáticas.
        </Aviso>
      )}
      {faltan.length > 0 && (
        <Aviso
          tono="aviso"
          icono={<Coins className="size-4" aria-hidden="true" />}
          titulo={`Falta la tasa de ${new Intl.ListFormat('es').format(faltan)}`}
          accion={
            <BotonEnlace href="/admin/finanzas" tamano="sm">
              Poner tasa
            </BotonEnlace>
          }
        >
          Esos precios no se pueden mostrar ni cobrar en esa moneda.
        </Aviso>
      )}
    </section>
  );
}

/* ───────────────────────── para atender ───────────────────────── */

export function ParaAtender({ centro, items }: { centro: CentroEquipo; items: ItemCola[] }) {
  const libres = colasAlDia(centro, items);
  return (
    <Seccion
      id="titulo-atender"
      titulo="Para atender"
      nota={items.length ? 'Lo más urgente primero.' : 'Nada en cola por ahora.'}
    >
      <div className={claseLista}>
        {items.length === 0 ? (
          <div className="flex items-center gap-3.5 px-4 py-4.5">
            <Orbe color="#22c55e">
              <Check />
            </Orbe>
            <div className="grid gap-0.5">
              <b>Todo al día</b>
              <p className="text-[0.84rem] text-tinta-suave">
                No hay pagos, recargas, solicitudes ni entregas esperando. Te avisamos aquí cuando
                llegue algo.
              </p>
            </div>
          </div>
        ) : (
          items.map((x, i) => {
            const Icono = x.icono === 'billetera' ? Wallet : ICONOS_MODULO[x.icono];
            return (
              <div
                key={x.clave}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 max-[35rem]:gap-2.5 max-[35rem]:px-3"
              >
                <Orbe color={x.color}>
                  <Icono />
                </Orbe>
                <div className="grid min-w-0 gap-0.5">
                  <b className="text-[0.94rem] text-balance">
                    {x.antes}
                    {x.n !== null && <i className="text-white not-italic tabular-nums">{x.n}</i>}
                    {x.despues && ` ${x.despues}`}
                  </b>
                  <small
                    className={clsx(
                      'text-[0.78rem]',
                      x.urgente ? 'text-[#fca5a5]' : 'text-tinta-suave',
                    )}
                  >
                    {x.detalle}
                  </small>
                </div>
                <BotonEnlace
                  href={x.href}
                  tamano="sm"
                  variante={i === 0 ? 'primario' : 'secundario'}
                  aria-label={`Revisar: ${x.antes}${x.n ?? ''} ${x.despues}`.trim()}
                >
                  Revisar
                </BotonEnlace>
              </div>
            );
          })
        )}
        {items.length > 0 && libres.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-3 text-[0.8rem] text-tinta-suave">
            Al día:
            {libres.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-exito/30 bg-exito/[0.06] px-2.5 py-0.5 whitespace-nowrap text-[#bbf7d0]"
              >
                <Check className="size-3" aria-hidden="true" />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Seccion>
  );
}

/* ───────────────────────── este mes ───────────────────────── */

export function EsteMes({ m }: { m: MetricasPanel }) {
  const mes = new Intl.DateTimeFormat('es', { month: 'long', timeZone: ZONA }).format(new Date());
  const b = m.enBolivares;
  const pagos = m.ingresosMes.reduce((t, i) => t + i.pagos, 0);
  return (
    <Seccion
      id="titulo-mes"
      titulo="Este mes"
      nota={`Cifras de ${mes}${b ? ' · ≈ con la tasa de hoy' : ''}`}
    >
      {m.soloCartera && (
        <p className="flex items-center gap-2.5 rounded-[0.875rem] border border-dashed border-borde-fuerte px-3.5 py-2.5 text-[0.82rem] text-tinta-suave">
          <UserRound className="size-4 shrink-0 text-cian" aria-hidden="true" />
          Estas cifras son solo de tu cartera de clientes.
        </p>
      )}
      <Kpis>
        <Kpi
          titulo="Ingreso recurrente"
          valor={usd(m.ingresoMensualRecurrenteUsd)}
          detalle={
            b ? `≈ ${bs(b.ingresoMensualRecurrente)} al mes` : 'De las suscripciones activas'
          }
        />
        <Kpi
          titulo="Cobrado este mes"
          valor={usd(m.ingresosMesUsd)}
          detalle={[pagos === 1 ? '1 pago' : `${pagos} pagos`, b ? `≈ ${bs(b.ingresosMes)}` : '']
            .filter(Boolean)
            .join(' · ')}
        />
        <Kpi
          titulo="Clientes activos"
          valor={m.clientesActivos}
          detalle={`+${m.clientesNuevosMes} ${m.clientesNuevosMes === 1 ? 'nuevo' : 'nuevos'} este mes`}
        />
        <Kpi
          titulo="Suscripciones activas"
          valor={m.suscripcionesPorEstado.activa}
          detalle={`${m.suscripcionesPorEstado.en_gracia} en periodo de gracia`}
        />
      </Kpis>
    </Seccion>
  );
}

/* ───────────────────────── vencimientos y estados ───────────────────────── */

function cuandoVence(s: SuscripcionPublica): [string, 'aviso' | 'peligro' | 'neutro'] {
  if (s.estado === 'en_gracia') return ['En gracia', 'peligro'];
  const d = s.venceEn ? diasHasta(s.venceEn) : 0;
  const texto = d <= 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`;
  return [texto, d <= 2 ? 'aviso' : 'neutro'];
}

export function Proximos({
  suscripciones,
  puedeVer,
}: {
  suscripciones: SuscripcionPublica[];
  puedeVer: boolean;
}) {
  return (
    <Seccion
      id="titulo-vencen"
      titulo="Vencen en 7 días"
      accion={
        puedeVer && (
          <Link href="/admin/suscripciones?vencenEnDias=7" className={claseEnlace}>
            Ver suscripciones
          </Link>
        )
      }
    >
      {suscripciones.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-borde-fuerte px-4 py-5 text-center text-sm text-tinta-suave">
          Nada vence esta semana.
        </p>
      ) : (
        <ul className={claseLista}>
          {suscripciones.map((s) => {
            const [texto, tono] = cuandoVence(s);
            const detalle = [
              `${s.plan.servicio} ${s.plan.nombre}`,
              s.cobroAutomatico ? 'cobro automático' : '',
              s.gestionadaPorRevendedor ? 'lo renueva el revendedor' : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const contenido = (
              <>
                <span
                  className="grid size-9 place-items-center rounded-xl border border-borde bg-white/[0.03] text-cian"
                  aria-hidden="true"
                >
                  <Clock className="size-4" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <b className="truncate text-[0.92rem]">{s.cliente.nombre}</b>
                  <small className="truncate text-[0.78rem] text-tinta-suave">{detalle}</small>
                </span>
                <span className="col-start-2 sm:col-start-auto">
                  <PildoraEstado texto={texto} tono={tono} />
                </span>
              </>
            );
            return (
              <li key={s.id}>
                {puedeVer ? (
                  <Link href={`/admin/suscripciones/${s.id}`} className={claseFila}>
                    {contenido}
                  </Link>
                ) : (
                  <div className={claseFila}>{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}

const ESTADOS: [EstadoSuscripcion, string, string][] = [
  ['activa', 'Activas', '#22c55e'],
  ['en_gracia', 'En gracia', '#f59e0b'],
  ['pendiente_pago', 'Por pagar', '#4f8dff'],
  ['suspendida', 'Suspendidas', '#ef4444'],
  ['pausada', 'Pausadas', '#94a3b8'],
  ['vencida', 'Vencidas', '#f87171'],
  ['cancelada', 'Canceladas', '#64748b'],
];

export function PorEstado({ estados }: { estados: Record<EstadoSuscripcion, number> }) {
  const max = Math.max(...ESTADOS.map(([e]) => estados[e] ?? 0), 1);
  return (
    <Seccion id="titulo-estados" titulo="Suscripciones por estado">
      <ul className="grid gap-2.5 rounded-[1.25rem] border border-borde bg-[rgb(10_14_32/0.6)] p-4">
        {ESTADOS.map(([e, t, c]) => {
          const n = estados[e] ?? 0;
          return (
            <li
              key={e}
              className="grid grid-cols-[6.875rem_minmax(0,1fr)_2.75rem] items-center gap-2.5 text-[0.84rem]"
            >
              <span className="whitespace-nowrap text-tinta-suave">{t}</span>
              <i
                className="block h-2.5 min-w-1 rounded-full"
                style={{ background: c, width: `${Math.round((n / max) * 100)}%` }}
                aria-hidden="true"
              />
              <b className="text-right tabular-nums">{n}</b>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}

/* ───────────────────────── actividad y sistema ───────────────────────── */

const MODULO_DE_ACCION: [RegExp, ModuloEquipo][] = [
  [/^(pago|factura|metodo_cobro|billetera|recarga_billetera|pedido)/, 'cobros'],
  [/^ticket/, 'soporte'],
  [/^(entrega|codigo|inventario|lote)/, 'entregas'],
  [/^(revendedor|recarga|nivel|precio_mayorista|compra)/, 'revendedores'],
  [/^(asistente|accion)/, 'asistente'],
  [/^(cliente|nota)/, 'clientes'],
  [/^suscripcion/, 'suscripciones'],
  [/^cupon/, 'cupones'],
  [/^(servicio|plan|proveedor|catalogo)/, 'catalogo'],
  [/^tasa/, 'finanzas'],
  [/^(pasarela|pago_en_linea|reembolso)/, 'pasarelas'],
  [/^(pagina|sitio|tema)/, 'sitio'],
  [/^(usuario|sesion|cuenta|dos_pasos|2fa)/, 'equipo'],
  [/^automatizacion/, 'automatizaciones'],
];

const QUIEN = {
  usuario: ['Persona', 'border-borde-fuerte text-tinta-suave'],
  ia: ['Asistente', 'border-[rgb(168_85_247/0.45)] text-[#e9d5ff]'],
  sistema: ['Sistema', 'border-cian/40 text-[#a5f3fc]'],
} as const;

export function Actividad({ registros }: { registros: RegistroAuditoria[] }) {
  return (
    <Seccion
      id="titulo-actividad"
      titulo="Actividad reciente"
      accion={
        <Link href="/admin/auditoria" className={claseEnlace}>
          Ver auditoría
        </Link>
      }
    >
      {registros.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-borde-fuerte px-4 py-5 text-center text-sm text-tinta-suave">
          Sin actividad todavía.
        </p>
      ) : (
        <ul className={claseLista}>
          {registros.map((r) => {
            const modulo: ModuloEquipo =
              r.actorTipo === 'ia'
                ? 'asistente'
                : r.actorTipo === 'sistema'
                  ? 'automatizaciones'
                  : (MODULO_DE_ACCION.find(([re]) => re.test(r.accion))?.[1] ?? 'auditoria');
            const Icono = ICONOS_MODULO[modulo];
            const [quien, clase] = QUIEN[r.actorTipo];
            return (
              <li key={r.id} className={claseFila}>
                <span
                  className="grid size-9 place-items-center rounded-xl border border-borde bg-white/[0.03]"
                  style={{ color: COLOR[modulo] }}
                  aria-hidden="true"
                >
                  <Icono className="size-4" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <b className="text-[0.92rem] text-balance">
                    {ACCIONES_AUDITORIA[r.accion] ?? r.accion}
                  </b>
                  <small className="truncate text-[0.78rem] text-tinta-suave">
                    {r.actor?.nombre ?? quien}
                  </small>
                </span>
                <span className="col-start-2 flex items-center gap-2 sm:col-start-auto sm:grid sm:justify-items-end sm:gap-1">
                  <em
                    className={clsx(
                      'rounded-full border px-[0.45rem] py-px text-[0.64rem] font-bold tracking-[0.06em] whitespace-nowrap uppercase not-italic',
                      clase,
                    )}
                  >
                    {quien}
                  </em>
                  <time dateTime={r.fecha} className="text-xs whitespace-nowrap text-tinta-tenue">
                    {haceCuanto(r.fecha)}
                  </time>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}

type Tono = 'ok' | 'aviso' | 'mal';

/** Estado del sistema: solo si está configurado o no, nunca sus valores. */
export function EstadoSistema({ centro }: { centro: CentroEquipo }) {
  const { trabajador: t, sistema: s } = centro;
  const filas: [string, string, Tono][] = [];
  if (s.canales) {
    filas.push(
      t.activo
        ? ['Trabajador', `En marcha · latido ${haceCuanto(t.ultimoLatidoEn!)}`, 'ok']
        : [
            'Trabajador',
            t.ultimoLatidoEn
              ? `Detenido · último latido ${haceCuanto(t.ultimoLatidoEn)}`
              : 'Detenido · aún no arrancó',
            'mal',
          ],
    );
    filas.push(
      s.canales.correo === 'smtp'
        ? ['Correo', 'Listo para enviar', 'ok']
        : ['Correo', 'Modo de pruebas: no sale', 'aviso'],
    );
    filas.push(
      s.canales.whatsapp === 'listo'
        ? ['WhatsApp', 'Listo para enviar', 'ok']
        : s.canales.whatsapp === 'pruebas'
          ? ['WhatsApp', 'En modo pruebas', 'aviso']
          : ['WhatsApp', 'Sin configurar, solo enlaces', 'aviso'],
    );
  }
  if (s.asistente) {
    const a = s.asistente;
    filas.push(
      !a.activo
        ? ['Asistente', 'Desactivado', 'aviso']
        : !a.disponible
          ? ['Asistente', 'No disponible por ahora', 'aviso']
          : [
              'Asistente',
              a.mensajesRestantesHoy === 1
                ? '1 mensaje disponible hoy'
                : `${a.mensajesRestantesHoy} mensajes disponibles hoy`,
              a.mensajesRestantesHoy ? 'ok' : 'aviso',
            ],
    );
  }
  for (const p of s.pasarelas ?? []) {
    filas.push(
      !p.configurada
        ? [p.nombre, 'Sin configurar', 'aviso']
        : p.modo === 'pruebas'
          ? [p.nombre, 'En modo pruebas', 'aviso']
          : [p.nombre, 'Cobrando en producción', 'ok'],
    );
  }
  if (filas.length === 0) return null;
  return (
    <Seccion id="titulo-sistema" titulo="Estado del sistema">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-2.5">
        {filas.map(([nombre, texto, tono]) => (
          <li
            key={nombre}
            className="flex items-center gap-2.5 rounded-2xl border border-borde bg-[rgb(8_11_26/0.6)] px-3.5 py-3"
          >
            <i
              className={clsx(
                'size-2.5 shrink-0 rounded-full',
                tono === 'ok' && 'bg-[#22c55e] shadow-[0_0_0_4px_rgb(34_197_94/0.15)]',
                tono === 'aviso' && 'bg-[#f59e0b] shadow-[0_0_0_4px_rgb(245_158_11/0.15)]',
                tono === 'mal' && 'bg-[#ef4444] shadow-[0_0_0_4px_rgb(239_68_68/0.18)]',
              )}
              aria-hidden="true"
            />
            <span className="grid min-w-0 gap-px">
              <b className="text-sm">{nombre}</b>
              <span className="truncate text-[0.78rem] text-tinta-suave" title={texto}>
                <span className="sr-only">
                  {tono === 'ok' ? 'Bien: ' : tono === 'aviso' ? 'Atención: ' : 'Problema: '}
                </span>
                {texto}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
