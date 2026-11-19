import type {
  BilleteraPublica,
  CatalogoPublico,
  MetodoCobroPublico,
  Moneda,
  MovimientoBilleteraPublico,
  Pagina,
  PedidoPublico,
  RecargaBilleteraPublica,
} from '@nv/shared';
import { ArrowRight, CircleDollarSign, Receipt, ShoppingBag, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { VistaBilletera } from '@/componentes/cliente/billetera';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { faltaDelEnlace } from '@/lib/recarga';
import { requerirSesion } from '@/lib/sesion';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = { title: 'Billetera digital' };

const MAX_MB = Number(process.env.COMPROBANTE_MAX_MB ?? 5);
type Crudo = Record<string, string | string[] | undefined>;
/** Recargas y movimientos por página («Ver más» pide la siguiente). */
const POR_PAGINA_RECARGAS = 10;
const POR_PAGINA_MOVIMIENTOS = 6;

const PREGUNTAS: [string, string][] = [
  [
    '¿Cuándo aparece mi saldo?',
    'Cuando el equipo confirma tu pago. Te avisamos por correo y lo ves arriba y en tus movimientos.',
  ],
  [
    '¿Por qué mi saldo está en dólares?',
    'Así no pierde valor. Cuando recargas en otra moneda usamos la tasa del día, que queda fijada al reportar la recarga.',
  ],
  [
    '¿Para qué sirve el saldo?',
    'Para pagar pedidos completos y facturas al instante, sin enviar comprobante cada vez.',
  ],
  [
    '¿Puedo retirar mi saldo?',
    'El saldo es para compras en la tienda. Si tienes un caso especial, escríbenos por soporte.',
  ],
  [
    'Mi recarga fue rechazada',
    'Verás el motivo junto a la recarga. Toca «Enviar de nuevo», corrige el dato y adjunta otra vez el comprobante.',
  ],
  [
    '¿Qué es un ajuste?',
    'Un cambio de saldo que hace el equipo, por ejemplo una compensación. Siempre lleva su motivo.',
  ],
];

function Titulo() {
  return (
    <div className="grid gap-1.5">
      <h1 className="text-[clamp(1.9rem,4.5vw,2.9rem)]">
        Tu <span className="texto-degradado">billetera digital</span>
      </h1>
      <p className="text-tinta-suave">
        Recarga una vez y paga tus pedidos y renovaciones en un toque.
      </p>
    </div>
  );
}

const PASOS = [
  {
    icono: CircleDollarSign,
    titulo: 'Recarga',
    texto: 'En bolívares, dólares u otra moneda. Tu saldo queda en dólares y no pierde valor.',
  },
  {
    icono: Receipt,
    titulo: 'Te confirmamos',
    texto: 'El equipo revisa tu comprobante y el saldo aparece en tu tarjeta.',
  },
  {
    icono: ShoppingBag,
    titulo: 'Compras al instante',
    texto: 'Pagas pedidos, facturas y renovaciones sin enviar comprobante cada vez.',
  },
];

/** Cómo funciona la billetera, en tres pasos. */
function ComoFunciona() {
  return (
    <section
      aria-labelledby="titulo-como-funciona"
      className="relative grid gap-5 overflow-hidden rounded-[1.5rem] border border-borde bg-[radial-gradient(80%_120%_at_100%_0%,rgb(139_92_246/0.18),transparent_60%),radial-gradient(60%_100%_at_0%_100%,rgb(34_211_238/0.12),transparent_60%),rgb(8_11_26/0.85)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <span className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.16em] text-cian uppercase">
            <Zap className="size-3.5" aria-hidden="true" /> Billetera NV
          </span>
          <h2 id="titulo-como-funciona" className="text-[clamp(1.25rem,2.6vw,1.6rem)]">
            Así funciona tu billetera
          </h2>
        </div>
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-cian hover:underline"
        >
          Usar mi saldo en la tienda <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {PASOS.map(({ icono: Icono, titulo, texto }, i) => (
          <li
            key={titulo}
            className="relative grid content-start gap-2 rounded-2xl border border-white/10 bg-black/25 p-4"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[linear-gradient(135deg,#22d3ee,#8b5cf6)] text-white shadow-[0_8px_24px_-8px_rgb(139_92_246/0.8)]">
                <Icono className="size-5" aria-hidden="true" />
              </span>
              <span className="font-titulo text-3xl font-extrabold text-white/15">{i + 1}</span>
            </span>
            <b>{titulo}</b>
            <p className="text-sm text-tinta-suave">{texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Preguntas() {
  return (
    <section aria-labelledby="titulo-preguntas" className="grid gap-4">
      <h2 id="titulo-preguntas" className="text-[clamp(1.25rem,2.6vw,1.6rem)]">
        Preguntas sobre la billetera
      </h2>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {PREGUNTAS.map(([pregunta, respuesta]) => (
          <details
            key={pregunta}
            className="group rounded-2xl border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.7),rgb(8_11_26/0.8))] px-5 py-4 transition-colors open:border-borde-fuerte"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {pregunta}
              <span
                aria-hidden="true"
                className="mt-0.5 text-lg leading-none text-cian transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-tinta-suave">{respuesta}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default async function Billetera({ searchParams }: { searchParams: Promise<Crudo> }) {
  const sesion = await requerirSesion({ roles: ['cliente'] });
  const crudo = await searchParams;
  const [{ datos: billetera }, recargas, movimientos, metodos, catalogo, ubicacion] =
    await Promise.all([
      leerApi<BilleteraPublica>('/mi/billetera'),
      leerApi<Pagina<RecargaBilleteraPublica>>(
        `/mi/billetera/recargas?porPagina=${POR_PAGINA_RECARGAS}`,
      ).then((r) => r.datos),
      leerApi<Pagina<MovimientoBilleteraPublico>>(
        `/mi/billetera/movimientos?porPagina=${POR_PAGINA_MOVIMIENTOS}`,
      ).then((r) => r.datos),
      leerApi<MetodoCobroPublico[]>('/mi/billetera/metodos-cobro').then((r) => r.datos ?? []),
      leerApi<CatalogoPublico>('/catalogo').then((r) => r.datos),
      ubicacionVisitante(),
    ]);

  if (!billetera || !recargas || !movimientos) {
    return (
      <>
        <Titulo />
        <Alerta tono="peligro" titulo="No pudimos cargar tu billetera">
          Recarga la página en unos segundos. Si sigue igual, escríbenos desde Soporte.
        </Alerta>
      </>
    );
  }

  // El pedido a pagar con esta recarga: el del enlace (si sigue pendiente) o el que espera pago.
  const pedidoId = typeof crudo.pedido === 'string' ? crudo.pedido : null;
  const delEnlace =
    pedidoId && pedidoId !== billetera.pedidoPendiente?.id
      ? await leerApi<PedidoPublico>(`/mi/pedidos/${encodeURIComponent(pedidoId)}`).then(
          (r) => r.datos,
        )
      : null;
  const pedido =
    delEnlace?.estado === 'pendiente'
      ? delEnlace
      : billetera.pedidoPendiente?.estado === 'pendiente'
        ? billetera.pedidoPendiente
        : null;
  const tasas: Partial<Record<Moneda, string>> = Object.fromEntries(
    (catalogo?.tasas ?? []).map((t) => [t.moneda, t.valor]),
  );

  return (
    <>
      <Titulo />
      <VistaBilletera
        datos={{
          billetera,
          recargas,
          movimientos,
          metodos,
          tasas,
          pedido,
          // Lo que faltó para pagar el carrito o una factura (aviso de saldo insuficiente).
          faltaUsd: faltaDelEnlace(crudo.falta),
          monedaSugerida: ubicacion.moneda,
          nombre: sesion.usuario.nombre,
          maxMb: MAX_MB,
        }}
      />
      <ComoFunciona />
      <Preguntas />
    </>
  );
}
