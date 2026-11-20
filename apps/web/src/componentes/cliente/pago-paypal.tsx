'use client';

import {
  type ComprobantePaypalLectura,
  declararPagoPaypalSchema,
  type IntentoPagoPublico,
} from '@nv/shared';
import { CircleCheckBig, Clock, LoaderCircle } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { CopiarTexto } from '@/componentes/admin/pagos-en-linea';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { QrMetodo } from './qr-metodo';

const CADA_MS = 10_000;
const ABIERTOS = new Set(['creado', 'pendiente']);

/**
 * Paso a paso del pago por PayPal (cuenta personal): QR y datos, la referencia
 * para la nota, y el formulario con el nombre de la cuenta PayPal y la captura.
 * Mientras espera el aviso de PayPal, consulta el estado cada 10 segundos.
 */
export function PagoPaypal({ intentoId }: { intentoId: string }) {
  const [intento, setIntento] = useState<IntentoPagoPublico | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [idTransaccion, setIdTransaccion] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

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
    !!intento && ABIERTOS.has(intento.estado) && !!intento.paypalCorreo?.declaradoEn && !editando;
  useEffect(() => {
    if (!esperando) return;
    const t = setInterval(() => void consultar(), CADA_MS);
    return () => clearInterval(t);
  }, [esperando, consultar]);

  async function declarar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const datos = declararPagoPaypalSchema.safeParse({
      nombre: d.get('nombre'),
      idTransaccion: d.get('idTransaccion'),
    });
    const archivo = d.get('comprobante');
    const conArchivo = archivo instanceof File && archivo.size > 0;
    const nuevos: Record<string, string> = datos.success
      ? {}
      : Object.fromEntries(datos.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (!conArchivo && !intento?.paypalCorreo?.tieneComprobante) {
      nuevos['comprobante'] = 'Adjunta la captura del pago en PayPal.';
    }
    if (!datos.success || nuevos['comprobante']) {
      setErrores(nuevos);
      return;
    }
    setErrores({});
    const envio = new FormData();
    envio.set('nombre', datos.data.nombre);
    if (datos.data.idTransaccion) envio.set('idTransaccion', datos.data.idTransaccion);
    if (conArchivo) envio.set('comprobante', archivo);
    setEnviando(true);
    const r = await llamarApi<IntentoPagoPublico>(
      'POST',
      `/mi/pagos-en-linea/${intentoId}/paypal`,
      envio,
    );
    setEnviando(false);
    if (r.ok) {
      setError(null);
      setEditando(false);
      setIntento(r.datos);
    } else setError(r.error);
  }

  /** NV lee la captura en su servidor para llenar el ID de transacción y avisar si algo no cuadra. */
  async function leerCaptura(f: File | undefined) {
    setAvisos([]);
    if (!intento || !f || !f.type.startsWith('image/')) return;
    const datos = new FormData();
    datos.set('facturaId', intento.facturaId);
    datos.set('metodoCobroId', intento.metodoCobroId);
    datos.set('comprobante', f);
    setLeyendo(true);
    const r = await llamarApi<ComprobantePaypalLectura>(
      'POST',
      '/mi/pagos-en-linea/paypal/leer-captura',
      datos,
    );
    setLeyendo(false);
    if (!r.ok)
      return setAvisos(['No pudimos leer la captura. Escribe el ID de transacción a mano.']);
    const leido = r.datos.idTransaccion;
    if (leido) setIdTransaccion((v) => (v?.trim() ? v : leido));
    setAvisos(r.datos.avisos);
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
  const p = intento.paypalCorreo;

  if (intento.estado === 'aprobado') {
    return (
      <div className="grid justify-items-center gap-3 px-5 py-10 text-center" role="status">
        <CircleCheckBig className="size-10 text-exito" aria-hidden="true" />
        <h2 className="text-lg font-semibold">¡Pago confirmado!</h2>
        <p className="max-w-md text-sm text-tinta-suave">
          {intento.error ??
            'Recibimos tu pago por PayPal. Tu servicio se activa al momento: lo verás en «Mis accesos».'}
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
          {p?.declaradoEn
            ? 'No llegó el aviso de PayPal a tiempo. Ya avisamos al equipo: con tu captura lo revisaremos a mano. No pagues otra vez.'
            : 'Si aún no enviaste el dinero, vuelve a la factura y empieza de nuevo.'}
        </Alerta>
        <BotonEnlace href={factura} className="justify-self-start">
          Volver a la factura
        </BotonEnlace>
      </div>
    );
  }

  if (esperando && p) {
    return (
      <div
        className="grid justify-items-center gap-3 px-5 py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <Clock className="size-10 text-aviso" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Esperando el aviso de PayPal…</h2>
        <p className="max-w-md text-sm text-tinta-suave">
          Buscamos un pago de <strong>{intento.monto} USD</strong> a nombre de{' '}
          <strong>{p.nombre}</strong> o con la referencia <strong>{intento.referencia}</strong> en
          la nota. Suele tardar uno o dos minutos. Puedes cerrar esta página: te avisaremos por
          correo.
        </p>
        <Boton variante="fantasma" onClick={() => setEditando(true)}>
          Me equivoqué en el nombre o la captura
        </Boton>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-5 sm:p-6">
      <section className="overflow-hidden rounded-xl border border-borde bg-hundida/40">
        <h2 className="border-b border-borde px-3.5 py-2.5 text-sm font-semibold">
          Paso 1 · Envía exactamente {intento.monto} USD por PayPal
        </h2>
        <QrMetodo metodo={{ qrId: p?.qrId ?? null, nombre: 'PayPal' }} />
        {p?.instrucciones && (
          <p className="px-3.5 py-3 text-sm whitespace-pre-line">{p.instrucciones}</p>
        )}
        <div className="grid gap-1.5 border-t border-borde px-3.5 py-3 text-sm">
          <p className="font-medium">Escribe esta referencia en la nota del pago:</p>
          <CopiarTexto texto={intento.referencia} etiqueta="la referencia del pago" />
          <p className="text-xs text-tinta-tenue">
            Con la referencia en la nota, tu pago se confirma solo aunque cierres esta página.
          </p>
        </div>
      </section>
      <form onSubmit={declarar} className="grid gap-4" noValidate>
        <h2 className="text-sm font-semibold">Paso 2 · Dinos quién pagó y sube la captura</h2>
        <Campo
          etiqueta="Nombre de tu cuenta PayPal"
          name="nombre"
          required
          autoComplete="name"
          defaultValue={p?.nombre ?? ''}
          placeholder="Ej.: Samuel Amador"
          ayuda="Tal como aparece en tu perfil de PayPal: es el nombre que vemos al recibir el pago."
          error={errores['nombre'] ?? error?.campos?.nombre?.[0]}
        />
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">
            {p?.tieneComprobante ? 'Cambiar captura (opcional)' : 'Captura del pago'}
          </span>
          <input
            type="file"
            name="comprobante"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => void leerCaptura(e.currentTarget.files?.[0])}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-hundida file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <span className="text-xs text-tinta-tenue">
            La captura del recibo de PayPal (JPG, PNG, WebP o PDF).
          </span>
          {(errores['comprobante'] ?? error?.campos?.comprobante?.[0]) && (
            <span className="text-xs font-medium text-peligro">
              {errores['comprobante'] ?? error?.campos?.comprobante?.[0]}
            </span>
          )}
        </label>
        {leyendo && (
          <p role="status" className="text-xs text-tinta-suave">
            Leyendo tu captura…
          </p>
        )}
        {avisos.length > 0 && (
          <Alerta tono="aviso" titulo="Revisa tu captura">
            <ul className="grid gap-1">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Alerta>
        )}
        <Campo
          etiqueta="ID de transacción (opcional)"
          name="idTransaccion"
          autoComplete="off"
          maxLength={20}
          value={idTransaccion ?? p?.idTransaccion ?? ''}
          onChange={(e) => setIdTransaccion(e.currentTarget.value)}
          placeholder="Ej.: 1AB23456CD789012E"
          ayuda="Lo llenamos solo al leer tu captura. Si no salió, cópialo del detalle del pago en PayPal (17 letras y números)."
          error={errores['idTransaccion'] ?? error?.campos?.idTransaccion?.[0]}
        />
        {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        <Boton type="submit" cargando={enviando} className="justify-self-start">
          Ya pagué, confirmar
        </Boton>
        <p className="text-xs text-tinta-tenue">
          Confirmamos con el aviso que PayPal nos envía. Si algo no coincide, el equipo lo revisará
          con tu captura antes de entregar.
        </p>
      </form>
    </div>
  );
}
