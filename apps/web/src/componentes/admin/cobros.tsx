'use client';

import {
  INFO_MONEDA,
  type MetodoCobroPublico,
  type Moneda,
  MONEDAS,
  type PagoPublico,
  REGLAS_COBRO,
} from '@nv/shared';
import { Ban, Check, RefreshCw, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { formatearMonto } from '@/lib/formato';
import { ErrorGeneral, hoyLocal, textoDe, useAccion } from './piezas';

// ── Conciliación de un pago en revisión ──────────────────────────────────────

/** Botones Confirmar y Rechazar de un pago en revisión, con su formulario en línea. */
export function ConciliarPago({
  pago,
  totalFactura,
}: {
  pago: Pick<PagoPublico, 'id' | 'montoDeclarado' | 'moneda' | 'cliente'>;
  totalFactura: string;
}) {
  const [modo, setModo] = useState<'confirmar' | 'rechazar' | null>(null);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();

  const cambiar = (m: typeof modo) => {
    limpiar();
    setModo(m);
  };

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/pagos/${pago.id}/confirmar`, {
      montoRecibido: textoDe(d, 'montoRecibido') ?? '',
      notas: textoDe(d, 'notas'),
    });
    if (r) setModo(null);
  }

  async function rechazar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/pagos/${pago.id}/rechazar`, {
      motivo: textoDe(d, 'motivo') ?? '',
    });
    if (r) setModo(null);
  }

  if (modo === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Boton
          tamano="sm"
          icono={<Check className="size-4" />}
          onClick={() => cambiar('confirmar')}
        >
          Confirmar
        </Boton>
        <Boton
          tamano="sm"
          variante="secundario"
          icono={<X className="size-4" />}
          onClick={() => cambiar('rechazar')}
        >
          Rechazar
        </Boton>
      </div>
    );
  }

  if (modo === 'confirmar') {
    return (
      <form
        onSubmit={confirmar}
        className="grid gap-3 rounded-xl border border-exito/25 bg-exito-suave/40 p-4"
        noValidate
      >
        <Campo
          etiqueta={`Monto recibido (${pago.moneda})`}
          name="montoRecibido"
          inputMode="decimal"
          required
          autoFocus
          defaultValue={pago.montoDeclarado}
          ayuda={`Lo que llegó a la cuenta. Debe cubrir el total: ${formatearMonto(totalFactura, pago.moneda)}.`}
          error={campos.montoRecibido}
        />
        <AreaTexto
          etiqueta="Notas (opcional)"
          name="notas"
          rows={2}
          ayuda="Solo las ve el equipo."
          error={campos.notas}
        />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" tamano="sm" cargando={cargando} icono={<Check className="size-4" />}>
            Confirmar pago
          </Boton>
          <Boton tamano="sm" variante="fantasma" onClick={() => cambiar(null)}>
            Cancelar
          </Boton>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={rechazar}
      className="grid gap-3 rounded-xl border border-peligro/25 bg-peligro-suave/60 p-4"
      noValidate
    >
      <AreaTexto
        etiqueta="Motivo del rechazo"
        name="motivo"
        rows={2}
        required
        autoFocus
        placeholder="Ej. El monto recibido es menor que el total de la factura."
        ayuda={`${pago.cliente.nombre} verá este motivo y podrá reportar el pago de nuevo.`}
        error={campos.motivo}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando}>
          Rechazar pago
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => cambiar(null)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ── Acciones sobre una factura ───────────────────────────────────────────────

/** Pago que el equipo ya recibió: queda confirmado y la factura, pagada. */
export function RegistrarPago({
  facturaId,
  moneda,
  total,
  metodos,
}: {
  facturaId: string;
  moneda: Moneda;
  total: string;
  metodos: MetodoCobroPublico[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [metodoId, setMetodoId] = useState(metodos[0]?.id ?? '');
  const { cargando, error, campos, ejecutar } = useAccion();
  const metodo = metodos.find((m) => m.id === metodoId);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const origen = new FormData(e.currentTarget);
    const d = new FormData();
    for (const campo of ['metodoCobroId', 'monto', 'referenciaExterna', 'fechaPago', 'notas']) {
      const v = textoDe(origen, campo);
      if (v !== undefined) d.set(campo, v);
    }
    const archivo = origen.get('comprobante');
    if (archivo instanceof File && archivo.size > 0) d.set('comprobante', archivo);
    const r = await ejecutar('POST', `/facturas/${facturaId}/pagos`, d);
    if (r) setAbierto(false);
  }

  if (metodos.length === 0) {
    return (
      <Alerta tono="aviso" titulo={`No hay métodos de cobro activos en ${moneda}`}>
        Pide a administración que configure uno en Monedas y cobro, o recalcula la factura en otra
        moneda.
      </Alerta>
    );
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} className="w-full">
        Registrar pago recibido
      </Boton>
    );
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate encType="multipart/form-data">
      <Selector
        etiqueta="Método de cobro"
        name="metodoCobroId"
        value={metodoId}
        onChange={(e) => setMetodoId(e.currentTarget.value)}
        error={campos.metodoCobroId}
      >
        {metodos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre}
          </option>
        ))}
      </Selector>
      <Campo
        etiqueta={`Monto recibido (${moneda})`}
        name="monto"
        inputMode="decimal"
        required
        defaultValue={total}
        error={campos.monto}
      />
      <Campo
        etiqueta={metodo?.requiereReferencia ? 'Referencia del banco' : 'Referencia (opcional)'}
        name="referenciaExterna"
        required={metodo?.requiereReferencia}
        autoComplete="off"
        error={campos.referenciaExterna}
      />
      <Campo
        etiqueta="Fecha del pago"
        name="fechaPago"
        type="date"
        required
        max={hoyLocal()}
        defaultValue={hoyLocal()}
        error={campos.fechaPago}
      />
      <AreaTexto etiqueta="Notas (opcional)" name="notas" rows={2} error={campos.notas} />
      <div className="grid gap-1.5">
        <label htmlFor="comprobante-pago" className="text-sm font-medium">
          Comprobante (opcional)
        </label>
        <input
          id="comprobante-pago"
          name="comprobante"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="text-sm text-tinta-suave file:mr-3 file:rounded-lg file:border file:border-borde-fuerte file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:text-tinta hover:file:bg-elevada"
          aria-describedby={campos.comprobante ? 'comprobante-pago-error' : undefined}
        />
        {campos.comprobante && (
          <p id="comprobante-pago-error" className="text-xs font-medium text-peligro">
            {campos.comprobante}
          </p>
        )}
      </div>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando}>
          Registrar y marcar pagada
        </Boton>
        <Boton variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** Recalcula el total con la tasa de hoy, en la misma moneda o en otra. */
export function Recotizar({ facturaId, moneda }: { facturaId: string; moneda: Moneda }) {
  const [hecho, setHecho] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHecho(false);
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/facturas/${facturaId}/recotizar`, {
      moneda: d.get('moneda'),
    });
    if (r) setHecho(true);
  }

  return (
    <form onSubmit={enviar} className="grid gap-3" noValidate>
      <div className="flex items-end gap-2">
        <Selector
          etiqueta="Moneda"
          name="moneda"
          defaultValue={moneda}
          error={campos.moneda}
          className="flex-1"
        >
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m} · {INFO_MONEDA[m].nombre}
            </option>
          ))}
        </Selector>
        <Boton
          type="submit"
          variante="secundario"
          cargando={cargando}
          icono={<RefreshCw className="size-4" />}
        >
          Recalcular
        </Boton>
      </div>
      <ErrorGeneral error={error} />
      {hecho && !cargando && (
        <Alerta tono="exito">
          Factura recalculada. El cliente tiene {REGLAS_COBRO.diasParaPagar} días desde hoy para
          pagarla.
        </Alerta>
      )}
    </form>
  );
}

export function AnularFactura({ facturaId, numero }: { facturaId: string; numero: string }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motivo = textoDe(new FormData(e.currentTarget), 'motivo') ?? '';
    if (!window.confirm(`¿Anular la factura ${numero}? Esta acción no se puede deshacer.`)) return;
    const r = await ejecutar('POST', `/facturas/${facturaId}/anular`, { motivo });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        variante="peligro"
        icono={<Ban className="size-4" />}
        onClick={() => setAbierto(true)}
        className="justify-self-start"
      >
        Anular factura
      </Boton>
    );
  }

  return (
    <form onSubmit={enviar} className="grid gap-3" noValidate>
      <AreaTexto
        etiqueta="Motivo de la anulación"
        name="motivo"
        rows={2}
        required
        autoFocus
        ayuda="Queda en la auditoría y en la factura."
        error={campos.motivo}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="peligro" cargando={cargando}>
          Anular factura
        </Boton>
        <Boton variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
