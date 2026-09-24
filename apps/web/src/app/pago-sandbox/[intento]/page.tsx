import { formatearMonto, type IntentoSandboxPublico } from '@nv/shared';
import { FlaskConical } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SimularPago } from '@/componentes/sandbox';
import { Alerta } from '@/componentes/ui/alerta';
import { ESTADO_INTENTO } from '@/lib/pagos-en-linea';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

// Página de pruebas: nunca se indexa ni se guarda en caché.
export const metadata: Metadata = {
  title: 'Pasarela de pruebas',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Imitación de la página de pago de una pasarela, para desarrollo y pruebas.
 * La API responde 404 cuando la pasarela de pruebas está desactivada (producción).
 */
export default async function PagoSandbox({ params }: { params: Promise<{ intento: string }> }) {
  const { intento } = await params;
  if (!UUID.test(intento)) notFound();
  let datos: IntentoSandboxPublico | null = null;
  let estado = 0;
  try {
    const r = await fetch(`${API}/api/v1/pasarelas/sandbox/intentos/${intento}`, {
      cache: 'no-store',
    });
    estado = r.status;
    if (r.ok) datos = (await r.json()) as IntentoSandboxPublico;
  } catch {
    estado = 0;
  }
  if (estado === 404 || estado === 400) notFound();

  const abierto = datos && ['creado', 'pendiente'].includes(datos.estado);

  return (
    <div className="min-h-dvh bg-[repeating-linear-gradient(135deg,var(--nv-hundida)_0_18px,var(--nv-fondo)_18px_36px)]">
      <div
        role="note"
        className="bg-aviso px-4 py-3 text-center text-base font-bold tracking-wide text-fondo uppercase sm:text-lg"
      >
        Entorno de pruebas: no se cobra dinero real
      </div>
      <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-10">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border-2 border-dashed border-aviso bg-aviso-suave text-aviso">
            <FlaskConical className="size-5" aria-hidden="true" />
          </span>
          <div className="grid">
            <h1 className="text-xl font-semibold">Pasarela de pruebas</h1>
            <p className="text-sm text-tinta-suave">Simulación para desarrollo. No es un banco.</p>
          </div>
        </div>

        <section className="grid gap-5 rounded-nv border-2 border-dashed border-aviso/60 bg-superficie p-5 shadow-nv sm:p-6">
          {!datos ? (
            <Alerta tono="peligro" titulo="No pudimos cargar el pago de prueba">
              Recarga la página en un momento.
            </Alerta>
          ) : (
            <>
              <dl className="grid gap-3 text-sm">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Importe</dt>
                  <dd className="font-titulo text-3xl font-semibold tabular-nums">
                    {formatearMonto(datos.monto, datos.moneda)}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Concepto</dt>
                  <dd className="break-words">{datos.descripcion}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-tinta-tenue">Referencia</dt>
                  <dd className="font-mono break-all">{datos.referencia}</dd>
                </div>
                {datos.guardarMetodo && (
                  <p className="rounded-lg bg-marca-suave px-3 py-2 text-xs text-tinta-suave">
                    El cliente pidió guardar este método para cobros automáticos: al aprobar, la
                    pasarela de pruebas devuelve un método simulado.
                  </p>
                )}
              </dl>
              {abierto ? (
                <SimularPago intentoId={intento} />
              ) : (
                <Alerta tono="aviso" titulo="Este pago de prueba ya terminó">
                  Estado: {ESTADO_INTENTO[datos.estado].texto.toLowerCase()}. Vuelve a NV Streaming
                  para ver el resultado.
                </Alerta>
              )}
            </>
          )}
        </section>
        <p className="text-center text-xs text-tinta-tenue">
          En producción esta página no existe: los clientes pagan en PayPal o Mercado Pago.
        </p>
      </main>
    </div>
  );
}
