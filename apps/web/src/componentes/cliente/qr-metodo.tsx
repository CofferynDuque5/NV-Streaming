import type { MetodoCobroPublico } from '@nv/shared';

/**
 * QR del método de cobro, si tiene uno. Va antes de los datos escritos para que
 * el cliente pueda escanearlo con la app de su banco o billetera.
 */
export function QrMetodo({ metodo }: { metodo: Pick<MetodoCobroPublico, 'qrId' | 'nombre'> }) {
  if (!metodo.qrId) return null;
  return (
    <figure className="grid justify-items-center gap-2 border-b border-borde px-3.5 py-4">
      <img
        src={`/api/v1/sitio/publico/medios/${metodo.qrId}`}
        alt={`Código QR para pagar con ${metodo.nombre}`}
        width={224}
        height={224}
        loading="lazy"
        className="size-56 rounded-xl bg-white object-contain p-2"
      />
      <figcaption className="text-xs text-tinta-suave">
        Escanéalo con tu app o usa los datos de abajo.
      </figcaption>
    </figure>
  );
}
