import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Headset,
  Layers,
  LockKeyhole,
  Store,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BotonEnlace } from '@/componentes/ui/boton';

const PASOS = [
  {
    titulo: 'Elige tu plan',
    texto: 'Compara planes de servicios autorizados con precios claros y sin letra pequeña.',
  },
  {
    titulo: 'Paga de forma segura',
    texto:
      'Paga en dólares, bolívares, pesos, soles o euros y envía tu comprobante. Nunca te pedimos los datos de tu tarjeta.',
  },
  {
    titulo: 'Actívalo y gestiónalo',
    texto: 'Sigue el estado de tus servicios, renovaciones y pagos desde tu panel.',
  },
];

const RAZONES: { icono: LucideIcon; titulo: string; texto: string }[] = [
  {
    icono: BadgeCheck,
    titulo: 'Solo servicios autorizados',
    texto:
      'Trabajamos con contenido licenciado y distribuidores oficiales. Nada de cuentas compartidas.',
  },
  {
    icono: CreditCard,
    titulo: 'Pagos protegidos',
    texto:
      'Los cobros automáticos solo se activan con tu autorización expresa y los puedes cancelar.',
  },
  {
    icono: LockKeyhole,
    titulo: 'Tu cuenta, blindada',
    texto: 'Verificación en dos pasos, sesiones que puedes cerrar a distancia y datos cifrados.',
  },
  {
    icono: Headset,
    titulo: 'Soporte en español',
    texto: 'Personas reales que conocen tu historial y resuelven con seguimiento.',
  },
];

const REVENTA: { icono: LucideIcon; titulo: string; texto: string }[] = [
  {
    icono: Wallet,
    titulo: 'Saldo prepagado',
    texto: 'Recargas tu saldo y compras activaciones al instante, sin esperar aprobaciones.',
  },
  {
    icono: Layers,
    titulo: 'Precio mayorista por nivel',
    texto: 'Cuanto más vendes, mejor es tu precio de compra.',
  },
  {
    icono: Store,
    titulo: 'Tú pones el precio final',
    texto: 'Cobras a tus clientes a tu manera y llevas el control desde tu panel.',
  },
];

export default function Inicio() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-[34rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--nv-marca-suave),transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-28">
          <div className="grid gap-7">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-tinta-suave">
              <span className="size-1.5 rounded-full bg-exito" aria-hidden="true" />
              Nueva plataforma en preparación
            </p>
            <h1 className="text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-[3.4rem]">
              Tu streaming, <span className="text-marca">en regla</span> y sin complicaciones.
            </h1>
            <p className="max-w-xl text-lg text-tinta-suave">
              NV Streaming reúne planes autorizados, pagos seguros y soporte en español en un solo
              panel, para ti y para quienes revenden.
            </p>
            <div className="flex flex-wrap gap-3">
              <BotonEnlace href="/registro" tamano="lg">
                Crear mi cuenta <ArrowRight className="size-4" aria-hidden="true" />
              </BotonEnlace>
              <BotonEnlace href="/planes" tamano="lg" variante="secundario">
                Ver planes y precios
              </BotonEnlace>
            </div>
          </div>
          <VistaPanel />
        </div>
      </section>

      <section id="como-funciona" className="border-t border-borde bg-superficie/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6">
          <div className="grid max-w-2xl gap-3">
            <p className="text-sm font-semibold text-marca">Cómo funciona</p>
            <h2 className="text-3xl font-semibold">Tres pasos, sin sorpresas</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {PASOS.map((p, i) => (
              <li
                key={p.titulo}
                className="grid gap-3 rounded-nv border border-borde bg-superficie p-6 shadow-nv"
              >
                <span className="font-titulo text-sm font-semibold text-marca">0{i + 1}</span>
                <h3 className="text-lg font-semibold">{p.titulo}</h3>
                <p className="text-sm text-tinta-suave">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6">
        <div className="grid max-w-2xl gap-3">
          <p className="text-sm font-semibold text-marca">Por qué NV</p>
          <h2 className="text-3xl font-semibold">Confianza desde el primer pago</h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {RAZONES.map(({ icono: Icono, titulo, texto }) => (
            <li
              key={titulo}
              className="flex gap-4 rounded-nv border border-borde bg-superficie p-6 shadow-nv"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca">
                <Icono className="size-5" aria-hidden="true" />
              </span>
              <div className="grid gap-1.5">
                <h3 className="font-semibold">{titulo}</h3>
                <p className="text-sm text-tinta-suave">{texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="revendedores"
        className="border-y border-borde bg-[linear-gradient(135deg,var(--nv-acento-suave),transparent_60%)]"
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="grid gap-4">
            <p className="text-sm font-semibold text-acento">Para revendedores</p>
            <h2 className="text-3xl font-semibold">Vende NV con precio mayorista</h2>
            <p className="text-tinta-suave">
              Un panel propio para comprar activaciones con tu saldo, seguir tus ventas y atender a
              tus clientes. El equipo de NV habilita las cuentas de revendedor.
            </p>
            <BotonEnlace href="/registro" variante="secundario" className="w-fit">
              Quiero revender
            </BotonEnlace>
          </div>
          <ul className="grid gap-3">
            {REVENTA.map(({ icono: Icono, titulo, texto }) => (
              <li
                key={titulo}
                className="flex gap-4 rounded-nv border border-borde bg-superficie p-5"
              >
                <Icono className="mt-0.5 size-5 shrink-0 text-acento" aria-hidden="true" />
                <div className="grid gap-1">
                  <h3 className="font-semibold">{titulo}</h3>
                  <p className="text-sm text-tinta-suave">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl justify-items-center gap-5 px-4 py-24 text-center sm:px-6">
        <h2 className="text-3xl font-semibold">
          Crea tu cuenta y te avisamos cuando abra el catálogo
        </h2>
        <p className="text-tinta-suave">Registrarte es gratis y solo necesitas un correo.</p>
        <BotonEnlace href="/registro" tamano="lg">
          Crear mi cuenta
        </BotonEnlace>
      </section>
    </>
  );
}

/** Ilustración del panel hecha con CSS: ligera y sin datos inventados. */
function VistaPanel() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,var(--nv-acento-suave),transparent)]" />
      <div className="relative grid gap-4 rounded-[1.4rem] border border-borde-fuerte bg-superficie p-5 shadow-nv">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-peligro/70" />
          <span className="size-2.5 rounded-full bg-aviso/70" />
          <span className="size-2.5 rounded-full bg-exito/70" />
          <span className="ml-3 h-2.5 w-32 rounded-full bg-hundida" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['bg-marca', 'bg-acento', 'bg-exito'].map((c) => (
            <div key={c} className="grid gap-2 rounded-xl border border-borde bg-hundida p-3">
              <span className={`h-1.5 w-8 rounded-full ${c}`} />
              <span className="h-3 w-3/4 rounded bg-borde-fuerte" />
              <span className="h-2 w-1/2 rounded bg-borde" />
            </div>
          ))}
        </div>
        <div className="grid gap-2.5 rounded-xl border border-borde bg-hundida p-4">
          {[88, 64, 76, 52].map((w, i) => (
            <div key={w} className="flex items-center gap-3">
              <span
                className={`size-7 rounded-lg ${i % 2 ? 'bg-acento-suave' : 'bg-marca-suave'}`}
              />
              <span className="h-2.5 rounded bg-borde-fuerte" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
