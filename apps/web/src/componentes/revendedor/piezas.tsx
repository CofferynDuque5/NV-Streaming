// Piezas del programa de revendedores que usa el panel del equipo.
import type { EstadoCompra, EstadoRecarga, EstadoRevendedor } from '@nv/shared';
import type { ReactNode } from 'react';
import { Insignia } from '@/componentes/ui/insignia';
import { ESTADO_COMPRA, ESTADO_RECARGA, ESTADO_REVENDEDOR } from '@/lib/revendedores';

export const EstadoRevendedorInsignia = ({ estado }: { estado: EstadoRevendedor }) => (
  <Insignia tono={ESTADO_REVENDEDOR[estado].tono}>{ESTADO_REVENDEDOR[estado].texto}</Insignia>
);

export const EstadoRecargaInsignia = ({ estado }: { estado: EstadoRecarga }) => (
  <Insignia tono={ESTADO_RECARGA[estado].tono}>{ESTADO_RECARGA[estado].texto}</Insignia>
);

export const EstadoCompraInsignia = ({ estado }: { estado: EstadoCompra }) => (
  <Insignia tono={ESTADO_COMPRA[estado].tono}>{ESTADO_COMPRA[estado].texto}</Insignia>
);

/** Cifra destacada dentro de una rejilla de cifras. */
export function Cifra({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5 bg-superficie px-5 py-5 sm:px-6">
      <dt className="text-xs font-medium text-tinta-tenue">{etiqueta}</dt>
      <dd className="font-titulo text-[1.6rem] leading-none font-semibold break-words tabular-nums">
        {valor}
      </dd>
      {detalle && <dd className="text-xs text-tinta-suave">{detalle}</dd>}
    </div>
  );
}
