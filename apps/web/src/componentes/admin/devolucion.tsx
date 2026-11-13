'use client';

import { type DevolucionSugerida, formatearMonto, type Moneda, MONEDAS } from '@nv/shared';
import { useId, useState } from 'react';
import { BotonCopiar } from '@/componentes/cliente/pago';
import { Campo } from '@/componentes/ui/campo';
import { Selector } from '@/componentes/ui/selector';

const numero = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Calculadora de devolución: lo pagado entre los días que cubre, por los días
 * que no usará. Con una suscripción llega rellena con su última factura y los
 * días que le quedan; todo se puede ajustar (p. ej. restar días de caída).
 */
export function CalculadoraDevolucion({
  sugerida = null,
  cliente,
  servicio,
}: {
  sugerida?: DevolucionSugerida | null;
  cliente?: string;
  servicio?: string;
}) {
  const id = useId();
  const [pagado, setPagado] = useState(sugerida?.factura?.total ?? '');
  const [moneda, setMoneda] = useState<Moneda>(sugerida?.factura?.moneda ?? 'USD');
  const [diasPeriodo, setDiasPeriodo] = useState(String(sugerida?.diasPeriodo ?? 30));
  const [diasRestantes, setDiasRestantes] = useState(String(sugerida?.diasRestantes ?? 0));

  const periodo = Math.max(1, Math.round(numero(diasPeriodo)));
  const restantes = Math.min(periodo, Math.round(numero(diasRestantes)));
  const monto = ((numero(pagado) * restantes) / periodo).toFixed(2);
  const porDia = (numero(pagado) / periodo).toFixed(2);
  const mensaje = [
    cliente ? `Hola, ${cliente}.` : 'Hola.',
    `Te devolvemos ${formatearMonto(monto, moneda)}${servicio ? ` de ${servicio}` : ''}: ${restantes} ${restantes === 1 ? 'día' : 'días'} sin usar de ${periodo} pagados (${formatearMonto(pagado || 0, moneda)}).`,
  ].join(' ');

  return (
    <div className="grid gap-4">
      {sugerida && !sugerida.factura && (
        <p className="text-sm text-tinta-suave">
          Esta suscripción no tiene facturas pagadas: escribe lo que pagó.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo
          etiqueta="Lo que pagó"
          inputMode="decimal"
          value={pagado}
          onChange={(e) => setPagado(e.currentTarget.value)}
          ayuda={sugerida?.factura ? `Factura ${sugerida.factura.numero}` : undefined}
        />
        <Selector
          etiqueta="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.currentTarget.value as Moneda)}
        >
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Días que cubre"
          type="number"
          min={1}
          inputMode="numeric"
          value={diasPeriodo}
          onChange={(e) => setDiasPeriodo(e.currentTarget.value)}
        />
        <Campo
          etiqueta="Días sin usar"
          type="number"
          min={0}
          inputMode="numeric"
          value={diasRestantes}
          onChange={(e) => setDiasRestantes(e.currentTarget.value)}
          ayuda="Resta los días de caída si ya se compensaron."
        />
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cian/40 bg-marca-suave p-4"
        aria-live="polite"
        aria-labelledby={`${id}-titulo`}
        role="region"
      >
        <div className="grid gap-0.5">
          <span id={`${id}-titulo`} className="text-sm font-semibold text-tinta-suave">
            A devolver
          </span>
          <b className="font-titulo text-2xl tabular-nums">{formatearMonto(monto, moneda)}</b>
          <span className="text-xs text-tinta-tenue">
            {formatearMonto(porDia, moneda)} por día × {restantes}{' '}
            {restantes === 1 ? 'día' : 'días'}
            {sugerida?.factura &&
            moneda === sugerida.factura.moneda &&
            numero(pagado) === numero(sugerida.factura.total)
              ? ` · ≈ ${formatearMonto(((numero(sugerida.factura.totalUsd) * restantes) / periodo).toFixed(2), 'USD')}`
              : ''}
          </span>
        </div>
        <BotonCopiar texto={mensaje} etiqueta="Copiar mensaje" />
      </div>
      <p className="text-xs text-tinta-tenue">
        Solo calcula: la devolución se hace por fuera y se registra en el pago de la factura.
      </p>
    </div>
  );
}
