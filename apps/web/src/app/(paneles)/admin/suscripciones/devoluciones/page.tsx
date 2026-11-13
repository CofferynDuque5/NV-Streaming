import type { Metadata } from 'next';
import { CalculadoraDevolucion } from '@/componentes/admin/devolucion';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Calculadora de devoluciones' };

export default async function Devoluciones() {
  await requerirSesion({ permiso: 'suscripciones.ver' });
  return (
    <>
      <CabeceraPagina
        titulo="Calculadora de devoluciones"
        descripcion="Cuánto devolver por los días que el cliente no usará. Desde la ficha de cada suscripción se rellena sola con su última factura y los días que le quedan."
      />
      <Tarjeta>
        <CabeceraTarjeta titulo="Calcular a mano" />
        <div className="px-5 pb-5 sm:px-6">
          <CalculadoraDevolucion />
        </div>
      </Tarjeta>
    </>
  );
}
