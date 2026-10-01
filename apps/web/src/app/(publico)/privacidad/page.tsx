import type { Metadata } from 'next';
import { Alerta } from '@/componentes/ui/alerta';

export const metadata: Metadata = { title: 'Política de privacidad' };

export default function Pagina() {
  return (
    <article className="mx-auto grid max-w-3xl gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold">Política de privacidad</h1>
      <Alerta tono="aviso" titulo="Documento en preparación">
        El texto legal definitivo depende del país donde NV Streaming factura y se redactará antes
        de abrir las ventas. Mientras tanto, esta página existe para que el registro enlace a un
        lugar real.
      </Alerta>
      <section className="grid gap-3 text-tinta-suave">
        <h2 className="text-xl font-semibold text-tinta">Moneda según tu país</h2>
        <p>
          Para mostrarte los precios en tu moneda usamos el país de tu conexión, que nos indica la
          red de distribución, o la región del idioma de tu navegador. No usamos tu ubicación exacta
          ni guardamos tu dirección IP para esto.
        </p>
        <p>
          Si eliges otra moneda, la recordamos durante un año en una cookie llamada nv_moneda que
          solo contiene el código de la moneda. Al crear tu cuenta, ese país y esa moneda se
          proponen en tus datos de facturación y puedes cambiarlos cuando quieras.
        </p>
      </section>
    </article>
  );
}
