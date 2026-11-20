import type { Metadata } from 'next';
import { PagoPaypal } from '@/componentes/cliente/pago-paypal';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Pagar con PayPal', robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pago por PayPal (cuenta personal): el cliente paga, dice su nombre en PayPal y sube la captura. */
export default async function PagarConPaypal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['cliente'] });
  const { intento } = await searchParams;
  const id = typeof intento === 'string' ? intento : '';
  return (
    <>
      <CabeceraPagina
        titulo="Pagar con PayPal"
        descripcion="Envía el monto exacto por PayPal y te confirmamos el pago en minutos."
      />
      <Tarjeta>
        {UUID.test(id) ? (
          <PagoPaypal intentoId={id} />
        ) : (
          <div className="grid gap-4 p-5 sm:p-6">
            <Alerta tono="peligro" titulo="Enlace no válido">
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
