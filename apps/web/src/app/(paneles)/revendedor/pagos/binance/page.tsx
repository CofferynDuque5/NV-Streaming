import type { Metadata } from 'next';
import { PagoBinance } from '@/componentes/cliente/pago-binance';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Pagar con Binance', robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pago por Binance Pay: el cliente envía USDT y dice con qué usuario y cuánto. */
export default async function PagarRenovacionConBinance({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirSesion({ roles: ['revendedor'] });
  const { intento } = await searchParams;
  const id = typeof intento === 'string' ? intento : '';
  return (
    <>
      <CabeceraPagina
        titulo="Pagar con Binance"
        descripcion="Envía el monto exacto en USDT y te confirmamos el pago en minutos."
      />
      <Tarjeta>
        {UUID.test(id) ? (
          <PagoBinance intentoId={id} panel="revendedor" />
        ) : (
          <div className="grid gap-4 p-5 sm:p-6">
            <Alerta tono="peligro" titulo="Enlace no válido">
              No sabemos a qué pago corresponde este enlace. Revisa tus renovaciones.
            </Alerta>
            <BotonEnlace href="/revendedor/renovaciones" className="justify-self-start">
              Renovaciones
            </BotonEnlace>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
