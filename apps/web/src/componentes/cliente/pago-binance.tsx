'use client';

import { declararPagoBinanceSchema, type IntentoPagoPublico } from '@nv/shared';
import { CircleCheckBig, Clock, LoaderCircle } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { QrMetodo } from './qr-metodo';

const CADA_MS = 10_000;
const ABIERTOS = new Set(['creado', 'pendiente']);

/**
 * Paso a paso del pago por Binance: QR y datos, monto exacto, y el formulario
 * para decir con qué usuario se pagó. Mientras espera el correo de Binance,
 * consulta el estado cada 10 segundos.
 */
export function PagoBinance({ intentoId }: { intentoId: string }) {
  const [intento, setIntento] = useState<IntentoPagoPublico | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(false);

  const consultar = useCallback(async () => {
    const r = await llamarApi<IntentoPagoPublico>('GET', `/mi/pagos-en-linea/${intentoId}`);
    if (r.ok) setIntento(r.datos);
    else setError(r.error);
  }, [intentoId]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await llamarApi<IntentoPagoPublico>('GET', `/mi/pagos-en-linea/${intentoId}`);
      if (!vivo) return;
      if (r.ok) setIntento(r.datos);
      else setError(r.error);
    })();
    return () => {
      vivo = false;
    };
  }, [intentoId]);

  const esperando =
    !!intento && ABIERTOS.has(intento.estado) && !!intento.binance?.declaradoEn && !editando;
  useEffect(() => {
    if (!esperando) return;
    const t = setInterval(() => void consultar(), CADA_MS);
    return () => clearInterval(t);
  }, [esperando, consultar]);

  async function declarar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const datos = declararPagoBinanceSchema.safeParse({
      usuario: d.get('usuario'),
      monto: String(d.get('monto') ?? '').replace(',', '.'),
    });
    if (!datos.success) {
      setErrores(Object.fromEntries(datos.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    setEnviando(true);
    const r = await llamarApi<IntentoPagoPublico>(
      'POST',
      `/mi/pagos-en-linea/${intentoId}/binance`,
      datos.data,
    );
    setEnviando(false);
    if (r.ok) {
      setError(null);
      setEditando(false);
      setIntento(r.datos);
    } else setError(r.error);
  }

  if (!intento) {
    return (
      <div className="grid justify-items-center gap-3 px-5 py-10 text-center" role="status">
        {error ? (
          <Alerta tono="peligro">{error.mensaje}</Alerta>
        ) : (
          <LoaderCircle className="size-6 animate-spin text-marca" aria-label="Cargando" />
        )}
      </div>
    );
  }

  const factura = `/cuenta/facturas/${intento.facturaId}`;
  const b = intento.binance;

  if (intento.estado === 'aprobado') {
    return (
      <div className="grid justify-items-center gap-3 px-5 py-10 text-center" role="status">
        <CircleCheckBig className="size-10 text-exito" aria-hidden="true" />
        <h2 className="text-lg font-semibold">¡Pago confirmado!</h2>
        <p className="max-w-md text-sm text-tinta-suave">
          {intento.error ??
            'Recibimos tu pago por Binance. Tu servicio se activa al momento: lo verás en «Mis accesos».'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <BotonEnlace href="/cuenta">Mis servicios</BotonEnlace>
          <BotonEnlace href={factura} variante="secundario">
            Ver la factura
          </BotonEnlace>
        </div>
      </div>
    );
  }

  if (!ABIERTOS.has(intento.estado)) {
    return (
      <div className="grid gap-4 p-5 sm:p-6">
        <Alerta tono="aviso" titulo="Este pago ya no está abierto">
          {b?.declaradoEn
            ? 'No llegó el aviso de Binance a tiempo. Ya avisamos al equipo: si enviaste el dinero, lo confirmaremos a mano. No pagues otra vez.'
            : 'Si aún no enviaste el dinero, vuelve a la factura y empieza de nuevo.'}
        </Alerta>
        <BotonEnlace href={factura} className="justify-self-start">
          Volver a la factura
        </BotonEnlace>
      </div>
    );
  }

  if (esperando && b) {
    return (
      <div
        className="grid justify-items-center gap-3 px-5 py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <Clock className="size-10 text-aviso" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Esperando el aviso de Binance…</h2>
        <p className="max-w-md text-sm text-tinta-suave">
          Buscamos un pago de <strong>{b.monto} USDT</strong> del usuario{' '}
          <strong>{b.usuario}</strong>. Suele tardar uno o dos minutos. Puedes cerrar esta página:
          te avisaremos por correo.
        </p>
        <Boton variante="fantasma" onClick={() => setEditando(true)}>
          Me equivoqué en el usuario o el monto
        </Boton>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-5 sm:p-6">
      <section className="overflow-hidden rounded-xl border border-borde bg-hundida/40">
        <h2 className="border-b border-borde px-3.5 py-2.5 text-sm font-semibold">
          Paso 1 · Envía exactamente {intento.monto} USDT
        </h2>
        <QrMetodo metodo={{ qrId: b?.qrId ?? null, nombre: 'Binance' }} />
        {b?.instrucciones && (
          <p className="px-3.5 py-3 text-sm whitespace-pre-line">{b.instrucciones}</p>
        )}
      </section>
      <form onSubmit={declarar} className="grid gap-4" noValidate>
        <h2 className="text-sm font-semibold">Paso 2 · Dinos con qué usuario pagaste</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Tu usuario de Binance"
            name="usuario"
            required
            autoComplete="off"
            defaultValue={b?.usuario ?? ''}
            placeholder="Ej.: Katy-2207"
            ayuda="Tal como aparece en tu perfil de Binance (el nombre que ve quien recibe)."
            error={errores.usuario ?? error?.campos?.usuario?.[0]}
          />
          <Campo
            etiqueta="Monto que enviaste (USDT)"
            name="monto"
            required
            inputMode="decimal"
            defaultValue={b?.monto ?? intento.monto}
            error={errores.monto ?? error?.campos?.monto?.[0]}
          />
        </div>
        {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        <Boton type="submit" cargando={enviando} className="justify-self-start">
          Ya pagué, confirmar
        </Boton>
        <p className="text-xs text-tinta-tenue">
          Confirmamos con el aviso que Binance nos envía. Si el monto no coincide con la factura, el
          equipo lo revisará antes de entregar.
        </p>
      </form>
    </div>
  );
}
