import { type CuentaPorPagar, formatearMonto, type PorPagar } from '@nv/shared';
import Link from 'next/link';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { formatearDia } from '@/lib/formato';
import { PagarCuenta } from './pagar-cuenta';

function cuando(dias: number) {
  if (dias < 0) return dias === -1 ? 'Venció ayer' : `Venció hace ${-dias} días`;
  if (dias === 0) return 'Vence hoy';
  return dias === 1 ? 'Vence mañana' : `En ${dias} días`;
}

function Fila({ item, conPagar }: { item: CuentaPorPagar; conPagar: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
      <div className="grid min-w-0 gap-0.5">
        <Link
          href={`/admin/cuentas/${item.cuenta.id}`}
          className="truncate font-medium hover:text-marca"
        >
          {item.cuenta.servicio.nombre} · <span className="font-mono">{item.cuenta.pista}</span>
        </Link>
        <span className="text-xs text-tinta-tenue">
          {formatearDia(item.facturaEn)}
          {item.metodoPago ? ` · ${item.metodoPago}` : ''}
          {item.cuenta.proveedor ? ` · ${item.cuenta.proveedor}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Insignia tono={item.dias < 0 ? 'peligro' : item.dias <= 2 ? 'aviso' : 'neutro'}>
          {cuando(item.dias)}
        </Insignia>
        <span className="font-semibold tabular-nums">{formatearMonto(item.costoUsd, 'USD')}</span>
        {conPagar && (
          <PagarCuenta
            cuentaId={item.cuenta.id}
            pista={item.cuenta.pista}
            costoUsd={item.costoUsd}
          />
        )}
      </div>
    </li>
  );
}

/** Cobros del proveedor atrasados y de los próximos días. No se muestra si no hay ninguno. */
export function PorPagarTarjeta({
  datos,
  titulo,
  dias = 7,
  conPagar = false,
}: {
  datos: PorPagar;
  titulo?: string;
  /** Días hacia adelante que cubre `datos`. */
  dias?: number;
  /** Botón «Pagado» en cada fila (con permiso para gestionar cuentas). */
  conPagar?: boolean;
}) {
  const items = [...datos.atrasadas, ...datos.proximas];
  if (items.length === 0) return null;
  const partes = [
    datos.atrasadas.length ? `${formatearMonto(datos.totalAtrasadoUsd, 'USD')} atrasado` : null,
    datos.proximas.length
      ? `${formatearMonto(datos.totalProximoUsd, 'USD')} en los próximos ${dias} días`
      : null,
  ].filter(Boolean);
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo={titulo ?? 'Por pagar a proveedores'}
        descripcion={`${partes.join(' · ')}. ${
          conPagar
            ? '«Pagado» registra el costo de siempre con fecha de hoy; para otro monto, abre la cuenta.'
            : 'Registra el pago en la ficha de cada cuenta.'
        }`}
      />
      <ul className="divide-y divide-borde">
        {items.map((i) => (
          <Fila key={i.cuenta.id} item={i} conPagar={conPagar} />
        ))}
      </ul>
    </Tarjeta>
  );
}
