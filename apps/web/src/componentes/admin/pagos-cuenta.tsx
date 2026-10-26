'use client';

import type { CuentaServicioDetalle } from '@nv/shared';
import { Ban, Receipt } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { textoCiclo } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/** Registra lo que se le pagó al proveedor; el próximo cobro corre un ciclo. */
export function RegistrarPagoCuenta({ cuenta }: { cuenta: CuentaServicioDetalle }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/cuentas/${cuenta.id}/pagos`, {
      montoUsd: textoDe(d, 'montoUsd'),
      pagadoEl: textoDe(d, 'pagadoEl'),
      siguienteCobro: textoDe(d, 'siguienteCobro'),
      metodoPago: textoDe(d, 'metodoPago') ?? null,
      nota: textoDe(d, 'nota') ?? null,
    });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="secundario"
        onClick={() => setAbierto(true)}
        icono={<Receipt className="size-3.5" />}
      >
        Registrar pago
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo="Registrar pago al proveedor"
      descripcion={`Deja vacío lo que quieras tomar de la cuenta. El próximo cobro avanza ${textoCiclo(cuenta.cicloMeses).toLowerCase()} desde el cobro pendiente.`}
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-5" noValidate autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            etiqueta="Monto (USD)"
            name="montoUsd"
            inputMode="decimal"
            placeholder={cuenta.costoUsd}
            error={campos.montoUsd}
          />
          <Campo
            etiqueta="Día del pago"
            name="pagadoEl"
            type="date"
            ayuda="Vacío: hoy."
            error={campos.pagadoEl}
          />
          <Campo
            etiqueta="Próximo cobro"
            name="siguienteCobro"
            type="date"
            ayuda="Vacío: un ciclo más."
            error={campos.siguienteCobro}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Cómo lo pagaste (opcional)"
            name="metodoPago"
            placeholder={cuenta.metodoPago ?? 'Tarjeta ···· 1234'}
            maxLength={60}
            ayuda="Nunca el número completo de la tarjeta."
            error={campos.metodoPago}
          />
          <Campo etiqueta="Nota (opcional)" name="nota" maxLength={500} error={campos.nota} />
        </div>
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Registrar pago
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

/** Anula un pago con motivo (no se borra). */
export function AnularPagoCuenta({
  cuentaId,
  pagoId,
  revierteCobro,
}: {
  cuentaId: string;
  pagoId: string;
  revierteCobro: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<Ban className="size-3.5" />}
        onClick={() => setAbierto(true)}
      >
        Anular
      </Boton>
    );
  }

  return (
    <form
      className="grid w-full max-w-xs gap-2 text-left"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await ejecutar('POST', `/cuentas/${cuentaId}/pagos/${pagoId}/anular`, {
          motivo: textoDe(new FormData(e.currentTarget), 'motivo') ?? '',
        });
        if (r) setAbierto(false);
      }}
    >
      <Campo
        etiqueta="Motivo"
        name="motivo"
        maxLength={500}
        ayuda={
          revierteCobro
            ? 'La cuenta vuelve a su cobro anterior.'
            : 'El próximo cobro de la cuenta no cambia.'
        }
        error={campos.motivo}
      />
      <ErrorGeneral error={error} />
      <div className="flex gap-2">
        <Boton tamano="sm" variante="peligro" type="submit" cargando={cargando}>
          Anular pago
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
