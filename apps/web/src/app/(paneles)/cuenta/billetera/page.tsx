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
import { UserRound } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { VistaBilletera } from '@/componentes/cliente/billetera';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = { title: 'Mi billetera' };

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
        Tu <span className="texto-degradado">billetera</span>
      </h1>
      <p className="text-tinta-suave">
        Recarga una vez y paga tus pedidos y renovaciones en un toque.
      </p>
    </div>
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
  const [{ estado, datos: billetera }, recargas, movimientos, metodos, catalogo, ubicacion] =
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

  if (estado === 403) {
    return (
      <>
        <Titulo />
        <section
          aria-labelledby="titulo-revendedor"
          className="grid justify-items-center gap-3 rounded-[1.625rem] border border-borde-fuerte bg-[rgb(8_11_26/0.7)] px-4.5 py-8.5 text-center"
        >
          <span
            className="orbe orbe-xl after:hidden"
            style={{ '--c': '#8b5cf6' } as CSSProperties}
            aria-hidden="true"
          >
            <UserRound />
          </span>
          <h2 id="titulo-revendedor" className="text-[1.4rem]">
            Tu cuenta la gestiona tu revendedor
          </h2>
          <p className="max-w-md text-tinta-suave">
            Tus servicios y renovaciones se los pides a él. La billetera NV es para clientes que
            compran directo en la tienda.
          </p>
          <BotonEnlace href="/cuenta" variante="secundario">
            Ver mis servicios
          </BotonEnlace>
        </section>
      </>
    );
  }
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
          monedaSugerida: ubicacion.moneda,
          nombre: sesion.usuario.nombre,
          maxMb: MAX_MB,
        }}
      />
      <Preguntas />
    </>
  );
}
