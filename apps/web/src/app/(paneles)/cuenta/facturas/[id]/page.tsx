import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VistaPago } from '@/componentes/cliente/vista-pago';
import { Alerta } from '@/componentes/ui/alerta';
import { cargarPago } from '@/lib/pago';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Pagar factura' };

export default async function Factura({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion({ roles: ['cliente'] });
  const { id } = await params;
  const r = await cargarPago(id, 'factura');
  if (r.estado === 'no-existe') notFound();
  if (r.estado !== 'ok') {
    return (
      <Alerta tono="peligro">No pudimos cargar la factura. Recarga la página en un momento.</Alerta>
    );
  }
  return <VistaPago datos={r.datos} />;
}
