import { Layers, Package, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { HojaDeRuta } from '@/componentes/panel/hoja-de-ruta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Panel de revendedor' };

export default async function PanelRevendedor() {
  const sesion = await requerirSesion({ roles: ['revendedor'] });
  return (
    <>
      <CabeceraPagina
        titulo={`Hola, ${sesion.usuario.nombre.split(' ')[0]}`}
        descripcion="Desde aquí comprarás activaciones con tu saldo a precio mayorista y seguirás tus ventas."
      />
      <div className="grid gap-6 md:grid-cols-3">
        <Tarjeta className="md:col-span-1">
          <CabeceraTarjeta titulo="Tu saldo" />
          <EstadoVacio icono={Wallet} titulo="Sin saldo todavía">
            Las recargas de saldo se habilitan en la fase 2.
          </EstadoVacio>
        </Tarjeta>
        <Tarjeta className="md:col-span-1">
          <CabeceraTarjeta titulo="Tu nivel" />
          <EstadoVacio icono={Layers} titulo="Nivel por asignar">
            Tu nivel define tu precio mayorista. Lo asigna el equipo de NV.
          </EstadoVacio>
        </Tarjeta>
        <Tarjeta className="md:col-span-1">
          <CabeceraTarjeta titulo="Catálogo mayorista" />
          <EstadoVacio icono={Package} titulo="Catálogo en preparación">
            Verás aquí los planes disponibles y tu precio de compra.
          </EstadoVacio>
        </Tarjeta>
      </div>
      <HojaDeRuta actual={1} />
    </>
  );
}
