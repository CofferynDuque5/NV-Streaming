'use client';

import {
  type ClienteCartera,
  INFO_MONEDA,
  type MetodoCobroPublico,
  type MiSolicitudRevendedor,
  type Moneda,
  type PlanMayorista,
  type ResultadoCompra,
} from '@nv/shared';
import { CircleCheck, RefreshCw, ShoppingCart, Upload } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { ErrorGeneral, hoyLocal, textoDe, useAccion } from '@/componentes/admin/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { formatearMonto } from '@/lib/formato';

const TIPOS_COMPROBANTE = 'image/jpeg,image/png,image/webp,application/pdf';

/** Clave nueva por intento de compra: si la red falla y se reintenta, no se cobra dos veces. */
const nuevaClave = () => crypto.randomUUID();

// ── Solicitud ────────────────────────────────────────────────────────────────

export function FormularioSolicitud({ previa }: { previa: MiSolicitudRevendedor | null }) {
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await ejecutar('POST', '/revendedor/solicitud', {
      nombreComercial: textoDe(d, 'nombreComercial') ?? '',
      documento: textoDe(d, 'documento'),
      telefono: textoDe(d, 'telefono'),
      pais: textoDe(d, 'pais') ?? 'VE',
      mensaje: textoDe(d, 'mensaje'),
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre de tu negocio"
          name="nombreComercial"
          required
          maxLength={120}
          defaultValue={previa?.nombreComercial}
          placeholder="Ej. Streaming Caracas"
          error={campos.nombreComercial}
          className="sm:col-span-2"
        />
        <Campo
          etiqueta="RIF o cédula (opcional)"
          name="documento"
          maxLength={40}
          defaultValue={previa?.documento ?? ''}
          error={campos.documento}
        />
        <Campo
          etiqueta="Teléfono o WhatsApp (opcional)"
          name="telefono"
          type="tel"
          defaultValue={previa?.telefono ?? ''}
          placeholder="+58 414 000 0000"
          error={campos.telefono}
        />
        <Campo
          etiqueta="País"
          name="pais"
          maxLength={2}
          defaultValue={previa?.pais ?? 'VE'}
          ayuda="Código de 2 letras: VE, CO, PE..."
          error={campos.pais}
        />
      </div>
      <AreaTexto
        etiqueta="Cuéntanos de tu negocio (opcional)"
        name="mensaje"
        rows={3}
        maxLength={1000}
        defaultValue={previa?.mensaje ?? ''}
        placeholder="Dónde vendes, cuántos clientes atiendes, desde cuándo..."
        error={campos.mensaje}
      />
      <ErrorGeneral error={error} />
      <Boton type="submit" cargando={cargando} className="justify-self-start">
        {previa ? 'Enviar de nuevo' : 'Enviar solicitud'}
      </Boton>
    </form>
  );
}

// ── Recarga de saldo ─────────────────────────────────────────────────────────

export function FormularioRecarga({
  metodos,
  tasas,
  maxMb,
}: {
  metodos: MetodoCobroPublico[];
  /** Unidades por 1 USD de cada moneda con tasa. */
  tasas: Partial<Record<Moneda, string>>;
  maxMb: number;
}) {
  const monedas = useMemo(() => [...new Set(metodos.map((m) => m.moneda))], [metodos]);
  const [moneda, setMoneda] = useState<Moneda>(monedas.includes('VES') ? 'VES' : monedas[0]!);
  const deMoneda = metodos.filter((m) => m.moneda === moneda);
  const [metodoId, setMetodoId] = useState(deMoneda[0]?.id ?? '');
  const metodo = deMoneda.find((m) => m.id === metodoId) ?? deMoneda[0];
  const [monto, setMonto] = useState('');
  const [enviada, setEnviada] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | undefined>();
  const { cargando, error, campos, ejecutar } = useAccion();

  const tasa = moneda === 'USD' ? '1' : tasas[moneda];
  const numero = Number(monto.replace(',', '.'));
  const estimado = tasa && numero > 0 ? (numero / Number(tasa)).toFixed(2) : null;

  function cambiarMoneda(m: Moneda) {
    setMoneda(m);
    setMetodoId(metodos.find((x) => x.moneda === m)?.id ?? '');
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const origen = new FormData(formulario);
    const archivo = origen.get('comprobante');
    if (!(archivo instanceof File) || archivo.size === 0) {
      return setErrorArchivo('Adjunta la captura o el PDF del pago.');
    }
    if (archivo.size > maxMb * 1024 * 1024)
      return setErrorArchivo(`El archivo supera ${maxMb} MB.`);
    setErrorArchivo(undefined);
    const d = new FormData();
    d.set('metodoCobroId', metodo?.id ?? '');
    d.set('moneda', moneda);
    for (const campo of ['monto', 'referenciaExterna', 'fechaPago']) {
      const v = textoDe(origen, campo);
      if (v !== undefined) d.set(campo, v);
    }
    d.set('comprobante', archivo);
    const r = await ejecutar<{ referencia: string }>('POST', '/revendedor/recargas', d);
    if (r) {
      setEnviada(r.datos.referencia);
      setMonto('');
      formulario.reset();
    }
  }

  if (metodos.length === 0) {
    return (
      <Alerta tono="aviso" titulo="No hay métodos de pago disponibles">
        Escribe al equipo de NV para recargar saldo.
      </Alerta>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="grid grid-cols-1 gap-5"
      noValidate
      encType="multipart/form-data"
    >
      {enviada && (
        <Alerta tono="exito" titulo="Recibimos tu recarga">
          Código {enviada}. Te acreditaremos el saldo en cuanto confirmemos el pago.
        </Alerta>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Selector
          etiqueta="Moneda en la que pagas"
          name="moneda"
          value={moneda}
          onChange={(e) => cambiarMoneda(e.currentTarget.value as Moneda)}
        >
          {monedas.map((m) => (
            <option key={m} value={m}>
              {INFO_MONEDA[m].nombre} ({m})
            </option>
          ))}
        </Selector>
        <Selector
          etiqueta="Método de pago"
          name="metodoCobroId"
          value={metodo?.id ?? ''}
          onChange={(e) => setMetodoId(e.currentTarget.value)}
          error={campos.metodoCobroId}
        >
          {deMoneda.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Selector>
      </div>

      {metodo && (
        <div className="grid gap-1.5 rounded-xl border border-borde bg-elevada p-4">
          <p className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
            Datos para pagar con {metodo.nombre}
          </p>
          <p className="text-sm break-words whitespace-pre-line">{metodo.instrucciones}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          etiqueta={`Monto que pagaste (${moneda})`}
          name="monto"
          inputMode="decimal"
          required
          value={monto}
          onChange={(e) => setMonto(e.currentTarget.value)}
          error={campos.monto}
          ayuda={
            estimado
              ? `Recibirás unos ${formatearMonto(estimado, 'USD')} de saldo${moneda === 'USD' ? '' : ` (tasa de hoy: ${formatearMonto(tasa!, moneda)} por dólar)`}.`
              : tasa
                ? 'El saldo se acredita en dólares con la tasa de hoy.'
                : `Todavía no hay tasa para ${moneda}: elige otra moneda.`
          }
        />
        <Campo
          etiqueta="Fecha del pago"
          name="fechaPago"
          type="date"
          required
          defaultValue={hoyLocal()}
          max={hoyLocal()}
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

      <div className="grid grid-cols-1 gap-1.5">
        <label htmlFor="comprobante-recarga" className="text-sm font-medium">
          Comprobante
        </label>
        <label
          htmlFor="comprobante-recarga"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-borde-fuerte bg-hundida px-4 py-4 text-sm text-tinta-suave hover:border-marca"
        >
          <Upload className="size-4 shrink-0 text-marca" aria-hidden="true" />
          <input
            id="comprobante-recarga"
            name="comprobante"
            type="file"
            accept={TIPOS_COMPROBANTE}
            required
            aria-invalid={errorArchivo || campos.comprobante ? true : undefined}
            aria-describedby="comprobante-recarga-ayuda"
            className="w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-suave file:px-3 file:py-1.5 file:font-medium file:text-marca"
          />
        </label>
        <p id="comprobante-recarga-ayuda" className="text-xs text-tinta-tenue">
          Captura o PDF (JPG, PNG, WebP o PDF, hasta {maxMb} MB).
        </p>
        {(errorArchivo ?? campos.comprobante) && (
          <p className="text-xs font-medium text-peligro">{errorArchivo ?? campos.comprobante}</p>
        )}
      </div>

      <ErrorGeneral error={error} />
      <Boton
        type="submit"
        cargando={cargando}
        disabled={!metodo || !tasa}
        className="sm:justify-self-start"
      >
        Reportar recarga
      </Boton>
    </form>
  );
}

// ── Compras ──────────────────────────────────────────────────────────────────

type ClienteElegible = Pick<ClienteCartera, 'id' | 'nombre'>;

/** Compra de una activación: para un cliente nuevo o uno de la cartera. */
export function ComprarPlan({
  plan,
  clientes,
  saldoUsd,
  bloqueado,
  abiertoInicial = false,
}: {
  plan: Pick<PlanMayorista, 'id' | 'nombre' | 'precioUsd'> & { servicio: { nombre: string } };
  clientes: ClienteElegible[];
  saldoUsd: string;
  /** Motivo por el que no se puede comprar (cuenta suspendida...). */
  bloqueado: string | null;
  /** Empieza con el formulario de compra abierto (plan elegido desde el sitio). */
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(
    () => abiertoInicial && !bloqueado && Number(saldoUsd) >= Number(plan.precioUsd),
  );
  const [modo, setModo] = useState<'nuevo' | 'cartera'>('nuevo');
  const [clave, setClave] = useState(nuevaClave);
  const [hecha, setHecha] = useState<ResultadoCompra | null>(null);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();
  const sinSaldo = Number(saldoUsd) < Number(plan.precioUsd);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar<ResultadoCompra>('POST', '/revendedor/compras', {
      tipo: 'alta',
      planId: plan.id,
      claveIdempotencia: clave,
      ...(modo === 'cartera'
        ? { clienteId: textoDe(d, 'clienteId') ?? '' }
        : {
            cliente: {
              nombre: textoDe(d, 'nombre') ?? '',
              correo: textoDe(d, 'correo'),
              whatsapp: textoDe(d, 'whatsapp'),
            },
          }),
    });
    if (r) {
      setHecha(r.datos);
      setAbierto(false);
      // La clave solo cambia tras una compra hecha: si falló la red, reintentar no cobra dos veces.
      setClave(nuevaClave());
    }
  }

  if (!abierto) {
    return (
      <div className="grid gap-3">
        {hecha && (
          <Alerta tono="exito" titulo="Compra realizada">
            {hecha.compra.cliente.nombre} ya tiene {hecha.compra.plan.servicio} ·{' '}
            {hecha.compra.plan.nombre} activo. Tu saldo ahora es{' '}
            {formatearMonto(hecha.saldoUsd, 'USD')}.
          </Alerta>
        )}
        <Boton
          onClick={() => {
            limpiar();
            setHecha(null);
            setAbierto(true);
          }}
          disabled={Boolean(bloqueado) || sinSaldo}
          icono={<ShoppingCart className="size-4" />}
          className="w-full"
        >
          Comprar
        </Boton>
        {(bloqueado ?? (sinSaldo ? 'Saldo insuficiente: recarga para comprar.' : null)) && (
          <p className="text-center text-xs text-tinta-tenue">
            {bloqueado ?? 'Saldo insuficiente: recarga para comprar.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">¿Para quién es?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['nuevo', 'Cliente nuevo'],
              ['cartera', 'De mi cartera'],
            ] as const
          ).map(([valor, texto]) => (
            <label
              key={valor}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-borde-fuerte bg-hundida px-3 py-2.5 text-sm has-checked:border-marca has-checked:bg-marca-suave has-disabled:opacity-50"
            >
              <input
                type="radio"
                name="modo"
                value={valor}
                checked={modo === valor}
                disabled={valor === 'cartera' && clientes.length === 0}
                onChange={() => setModo(valor)}
                className="accent-[var(--nv-marca)]"
              />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>
      {modo === 'nuevo' ? (
        <div className="grid gap-3">
          <Campo
            etiqueta="Nombre del cliente"
            name="nombre"
            required
            autoFocus
            error={campos['cliente.nombre']}
          />
          <Campo
            etiqueta="Correo (opcional)"
            name="correo"
            type="email"
            error={campos['cliente.correo']}
          />
          <Campo
            etiqueta="WhatsApp (opcional)"
            name="whatsapp"
            type="tel"
            placeholder="+58 414 000 0000"
            error={campos['cliente.whatsapp']}
          />
        </div>
      ) : (
        <Selector etiqueta="Cliente" name="clienteId" error={campos.clienteId}>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
      )}
      <p className="text-sm text-tinta-suave">
        Se descontarán{' '}
        <strong className="text-tinta">{formatearMonto(plan.precioUsd, 'USD')}</strong> de tu saldo
        ({formatearMonto(saldoUsd, 'USD')}) y el servicio queda activo al momento.
      </p>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando} icono={<CircleCheck className="size-4" />}>
          Confirmar compra
        </Boton>
        <Boton variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** Renueva una suscripción de la cartera con saldo, con confirmación. */
export function RenovarSuscripcion({
  suscripcionId,
  descripcion,
  precioUsd,
  bloqueado,
}: {
  suscripcionId: string;
  descripcion: string;
  precioUsd: string | null;
  bloqueado: string | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [clave, setClave] = useState(nuevaClave);
  const [hecha, setHecha] = useState<ResultadoCompra | null>(null);
  const { cargando, error, ejecutar } = useAccion();

  async function renovar() {
    const r = await ejecutar<ResultadoCompra>('POST', '/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId,
      claveIdempotencia: clave,
    });
    if (r) {
      setHecha(r.datos);
      setConfirmando(false);
      setClave(nuevaClave());
    }
  }

  if (precioUsd === null) {
    return <p className="text-xs text-tinta-tenue">Sin precio mayorista para renovar.</p>;
  }
  if (hecha) {
    return (
      <p role="status" className="text-xs font-medium text-exito">
        Renovada. Saldo: {formatearMonto(hecha.saldoUsd, 'USD')}
      </p>
    );
  }
  if (!confirmando) {
    return (
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<RefreshCw className="size-3.5" />}
        disabled={Boolean(bloqueado)}
        title={bloqueado ?? undefined}
        onClick={() => setConfirmando(true)}
        aria-label={`Renovar ${descripcion}`}
      >
        Renovar
      </Boton>
    );
  }
  return (
    <div className="grid justify-items-end gap-2">
      <p className="text-right text-xs text-tinta-suave">
        ¿Renovar por {formatearMonto(precioUsd, 'USD')}?
      </p>
      <div className="flex gap-2">
        <Boton tamano="sm" cargando={cargando} onClick={() => void renovar()}>
          Confirmar
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setConfirmando(false)}>
          Cancelar
        </Boton>
      </div>
      {error && <p className="max-w-64 text-right text-xs text-peligro">{error.mensaje}</p>}
    </div>
  );
}
