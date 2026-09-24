import type { EstadoCompra, EstadoRecarga, EstadoRevendedor, RevendedorDetalle } from '@nv/shared';
import type { ReactNode } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
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

/** Por qué el revendedor no puede recargar ni comprar ahora, o null si puede. */
export function motivoBloqueo(r: Pick<RevendedorDetalle, 'estado'>): string | null {
  if (r.estado === 'suspendido') return 'Tu cuenta está suspendida.';
  if (r.estado !== 'aprobado') return 'Tu cuenta de revendedor no está activa.';
  return null;
}

/** Aviso de cuenta suspendida o sin nivel, visible en todas las pantallas del panel. */
export function AvisosRevendedor({ revendedor: r }: { revendedor: RevendedorDetalle }) {
  return (
    <>
      {r.estado === 'suspendido' && (
        <Alerta tono="peligro" titulo="Tu cuenta de revendedor está suspendida">
          {r.motivoEstado ? `Motivo: ${r.motivoEstado}. ` : ''}Puedes consultar tu saldo, tus
          clientes y tus compras, pero no recargar ni comprar hasta que el equipo la reactive.
          Escríbenos si tienes dudas.
        </Alerta>
      )}
      {r.estado === 'aprobado' && !r.nivel && (
        <Alerta tono="aviso" titulo="Nivel por asignar">
          El equipo de NV aún no te asignó un nivel, así que no hay precios mayoristas para ti.
        </Alerta>
      )}
    </>
  );
}

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

/** Mensaje cuando la cuenta tiene el rol pero no su ficha de revendedor. */
export function SinFicha() {
  return (
    <Alerta tono="aviso" titulo="Tu cuenta de revendedor no está configurada">
      Escribe al equipo de NV para que la revise.
    </Alerta>
  );
}
