import type { Metadata } from 'next';
import { RetornoPago } from '@/componentes/cliente/retorno-pago';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Resultado del pago', robots: { index: false } };

type Crudo = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A esta página vuelve el cliente desde la pasarela (PayPal, Mercado Pago o la de pruebas). */
export default async function RetornoDePago({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['cliente'] });
  const crudo = await searchParams;
  const intento = typeof crudo.intento === 'string' ? crudo.intento : '';

  // Todo lo que añadió la pasarela (token, PayerID, payment_id, status…) se reenvía a la API.
  const parametros: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(crudo)) {
    const v = Array.isArray(valor) ? valor[0] : valor;
    if (clave === 'intento' || v === undefined || clave.length > 60) continue;
    parametros[clave] = v.slice(0, 500);
  }

  return (
    <>
      <CabeceraPagina titulo="Resultado del pago" />
      <Tarjeta>
        {UUID.test(intento) ? (
          <RetornoPago intentoId={intento} parametros={parametros} />
        ) : (
          <div className="grid gap-4 p-5 sm:p-6">
            <Alerta tono="peligro" titulo="Enlace de retorno no válido">
              No sabemos a qué pago corresponde este enlace. Revisa el estado de tus facturas.
            </Alerta>
            <BotonEnlace href="/cuenta/facturas" className="justify-self-start">
              Facturas y pagos
            </BotonEnlace>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
