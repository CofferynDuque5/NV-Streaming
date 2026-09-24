'use client';

import { INFO_MONEDA, type MetodoCobroPublico, type Moneda } from '@nv/shared';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

const TIPOS = 'image/jpeg,image/png,image/webp,application/pdf';

function hoyLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** El cliente elige cómo pagó, adjunta el comprobante y queda en revisión. */
export function FormularioPago({
  facturaId,
  total,
  metodos,
  maxMb,
}: {
  facturaId: string;
  total: string;
  metodos: MetodoCobroPublico[];
  maxMb: number;
}) {
  const router = useRouter();
  const [metodoId, setMetodoId] = useState(metodos[0]?.id ?? '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | undefined>();
  const metodo = metodos.find((m) => m.id === metodoId);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const archivo = datos.get('comprobante');
    if (!(archivo instanceof File) || archivo.size === 0) {
      return setErrorArchivo('Adjunta la captura o el PDF del pago.');
    }
    if (archivo.size > maxMb * 1024 * 1024) {
      return setErrorArchivo(`El archivo supera ${maxMb} MB.`);
    }
    setErrorArchivo(undefined);
    datos.set('metodoCobroId', metodoId);
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/facturas/${facturaId}/pagos`, datos);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const campos = erroresPorCampo(error);

  return (
    <form onSubmit={enviar} className="grid gap-5" encType="multipart/form-data">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">¿Cómo vas a pagar?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {metodos.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-borde-fuerte bg-hundida px-3.5 py-3 text-sm transition-colors has-checked:border-marca has-checked:bg-marca-suave"
            >
              <input
                type="radio"
                name="metodo"
                value={m.id}
                checked={m.id === metodoId}
                onChange={() => setMetodoId(m.id)}
                className="accent-[var(--nv-marca)]"
              />
              <span className="font-medium">{m.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {metodo && (
        <div className="grid gap-1.5 rounded-xl border border-borde bg-elevada p-4">
          <p className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
            Datos para pagar con {metodo.nombre}
          </p>
          <p className="text-sm whitespace-pre-line">{metodo.instrucciones}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Monto que pagaste"
          name="monto"
          defaultValue={total}
          inputMode="decimal"
          required
          error={campos.monto}
          ayuda="Escríbelo tal como aparece en tu comprobante."
        />
        <Campo
          etiqueta="Fecha del pago"
          name="fechaPago"
          type="date"
          defaultValue={hoyLocal()}
          max={hoyLocal()}
          required
          error={campos.fechaPago}
        />
        <Campo
          etiqueta={metodo?.requiereReferencia ? 'Número de referencia' : 'Referencia (opcional)'}
          name="referenciaExterna"
          required={metodo?.requiereReferencia}
          maxLength={80}
          autoComplete="off"
          error={campos.referenciaExterna}
          className="sm:col-span-2"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="comprobante" className="text-sm font-medium">
          Comprobante
        </label>
        <label
          htmlFor="comprobante"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-borde-fuerte bg-hundida px-4 py-4 text-sm text-tinta-suave hover:border-marca"
        >
          <Upload className="size-4 shrink-0 text-marca" aria-hidden="true" />
          <input
            id="comprobante"
            name="comprobante"
            type="file"
            accept={TIPOS}
            required
            aria-invalid={errorArchivo || campos.comprobante ? true : undefined}
            aria-describedby="comprobante-ayuda"
            className="min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-suave file:px-3 file:py-1.5 file:font-medium file:text-marca"
          />
        </label>
        <p id="comprobante-ayuda" className="text-xs text-tinta-tenue">
          Captura o PDF (JPG, PNG, WebP o PDF, hasta {maxMb} MB). No incluyas contraseñas ni datos
          de tu tarjeta.
        </p>
        {(errorArchivo ?? campos.comprobante) && (
          <p className="text-xs font-medium text-peligro">{errorArchivo ?? campos.comprobante}</p>
        )}
      </div>

      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <Boton type="submit" cargando={cargando} disabled={!metodo} className="sm:justify-self-start">
        Enviar comprobante
      </Boton>
    </form>
  );
}

/** Cambia la moneda de una factura pendiente o la actualiza con la tasa del día. */
export function CambiarMoneda({
  facturaId,
  actual,
  monedas,
}: {
  facturaId: string;
  actual: Moneda;
  monedas: readonly Moneda[];
}) {
  const router = useRouter();
  const [moneda, setMoneda] = useState<Moneda>(actual);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function aplicar(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/facturas/${facturaId}/recotizar`, { moneda });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <form onSubmit={aplicar} className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <label htmlFor="moneda-factura" className="text-sm font-medium">
            Moneda de pago
          </label>
          <select
            id="moneda-factura"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as Moneda)}
            className="h-10 rounded-xl border border-borde-fuerte bg-hundida px-3 text-sm"
          >
            {monedas.map((m) => (
              <option key={m} value={m}>
                {INFO_MONEDA[m].nombre} ({m})
              </option>
            ))}
          </select>
        </div>
        <Boton type="submit" variante="secundario" cargando={cargando}>
          {moneda === actual ? 'Actualizar a la tasa de hoy' : 'Cambiar moneda'}
        </Boton>
      </div>
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
    </form>
  );
}
