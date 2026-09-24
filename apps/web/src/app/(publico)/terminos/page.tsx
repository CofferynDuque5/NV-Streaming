import type { Metadata } from 'next';
import { Alerta } from '@/componentes/ui/alerta';

export const metadata: Metadata = { title: 'Términos y condiciones' };

export default function Pagina() {
  return (
    <article className="mx-auto grid max-w-3xl gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold">Términos y condiciones</h1>
      <Alerta tono="aviso" titulo="Documento en preparación">
        El texto legal definitivo depende del país donde NV Streaming factura y se redactará antes
        de abrir las ventas. Mientras tanto, esta página existe para que el registro enlace a un
        lugar real.
      </Alerta>
    </article>
  );
}
