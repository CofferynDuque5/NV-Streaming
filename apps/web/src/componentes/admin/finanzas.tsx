'use client';

import {
  INFO_MONEDA,
  INFO_PASARELA,
  type MetodoCobroPublico,
  type Moneda,
  MONEDAS,
  type MonedaConTasa,
  type Pasarela,
  PASARELAS,
  type TasaVigente,
  type TipoMetodoCobro,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ChevronDown,
  CreditCard,
  Globe,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { AreaTexto, Casilla, Selector } from '@/componentes/ui/selector';
import { llamarApi } from '@/lib/api-cliente';
import { formatearFechaHora } from '@/lib/formato';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import { formatearTasa, origenAutomatico } from './formato-admin';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

// ── Tasas de cambio ──────────────────────────────────────────────────────────

/** Registrar la tasa de hoy de una moneda. */
export function RegistrarTasa({ moneda, actual }: { moneda: MonedaConTasa; actual?: string }) {
  const id = useId();
  const [valor, setValor] = useState('');
  const [registrada, setRegistrada] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRegistrada(false);
    const nuevo = valor.trim().replace(',', '.');
    // Aviso ante un salto grande respecto a la vigente: suele ser un error de tecleo.
    if (actual && Number(nuevo) > 0) {
      const cambio = Math.abs(Number(nuevo) / Number(actual) - 1);
      if (
        cambio > 0.2 &&
        !window.confirm(
          `La nueva tasa cambia más de un 20 % respecto a la vigente (1 USD = ${formatearTasa(actual, moneda)}). ¿Es correcta?`,
        )
      )
        return;
    }
    const r = await ejecutar('POST', '/finanzas/tasas', { moneda, valor: nuevo });
    if (r) {
      setValor('');
      setRegistrada(true);
    }
  }

  const errorValor = campos.valor ?? campos.moneda;
  return (
    <form onSubmit={enviar} className="grid gap-1.5" noValidate>
      <label htmlFor={id} className="text-xs font-medium text-tinta-suave">
        Tasa de hoy ({moneda} por 1 USD)
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="valor"
          inputMode="decimal"
          value={valor}
          onChange={(e) => {
            setValor(e.currentTarget.value);
            setRegistrada(false);
          }}
          placeholder={actual ? String(Number(actual)) : 'Ej. 150.25'}
          autoComplete="off"
          aria-invalid={errorValor ? true : undefined}
          aria-describedby={errorValor ? `${id}-error` : undefined}
          className="h-10 w-full min-w-0 rounded-xl border border-borde-fuerte bg-hundida px-3 text-sm text-tinta tabular-nums placeholder:text-tinta-tenue hover:border-tinta-tenue focus:border-marca focus:ring-3 focus:ring-marca-suave focus:outline-none aria-invalid:border-peligro"
        />
        <Boton type="submit" variante="secundario" cargando={cargando} disabled={!valor.trim()}>
          Registrar
        </Boton>
      </div>
      {errorValor && (
        <p id={`${id}-error`} className="text-xs font-medium text-peligro">
          {errorValor}
        </p>
      )}
      {error && !error.campos && <p className="text-xs text-peligro">{error.mensaje}</p>}
      {registrada && (
        <p role="status" className="text-xs text-exito">
          Tasa registrada. Ya se usa en los precios y en las facturas nuevas.
        </p>
      )}
    </form>
  );
}

/** Historial de una moneda; se carga la primera vez que se abre. */
export function HistorialTasa({ moneda }: { moneda: MonedaConTasa }) {
  const [estado, setEstado] = useState<'cerrado' | 'cargando' | 'listo' | 'error'>('cerrado');
  const [filas, setFilas] = useState<TasaVigente[]>([]);
  const [mensaje, setMensaje] = useState('');

  async function cargar() {
    setEstado('cargando');
    const r = await llamarApi<TasaVigente[]>('GET', `/finanzas/tasas/${moneda}/historial`);
    if (!r.ok) {
      setMensaje(r.error.mensaje);
      setEstado('error');
      return;
    }
    setFilas(r.datos);
    setEstado('listo');
  }

  return (
    <details
      className="group"
      onToggle={(e) => {
        if (e.currentTarget.open && (estado === 'cerrado' || estado === 'error')) void cargar();
      }}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-marca hover:underline [&::-webkit-details-marker]:hidden">
        Ver historial
        <ChevronDown
          className="size-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 rounded-xl border border-borde bg-hundida">
        {estado === 'cargando' && (
          <p className="flex items-center gap-2 px-3 py-3 text-xs text-tinta-tenue">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> Cargando…
          </p>
        )}
        {estado === 'error' && <p className="px-3 py-3 text-xs text-peligro">{mensaje}</p>}
        {estado === 'listo' &&
          (filas.length === 0 ? (
            <p className="px-3 py-3 text-xs text-tinta-tenue">Sin registros todavía.</p>
          ) : (
            <ol className="max-h-64 divide-y divide-borde overflow-y-auto">
              {filas.map((t, i) => (
                <li
                  key={t.vigenteDesde + i}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span
                    className={clsx('tabular-nums', i === 0 ? 'font-semibold' : 'text-tinta-suave')}
                  >
                    {formatearTasa(t.valor, moneda)}
                  </span>
                  <span className="grid justify-items-end gap-0.5 text-right text-tinta-tenue">
                    {origenAutomatico(t) ? (
                      <Insignia tono="marca">{origenAutomatico(t)}</Insignia>
                    ) : (
                      <span>Manual · {t.autor?.nombre ?? 'Sistema'}</span>
                    )}
                    <span>{formatearFechaHora(t.vigenteDesde)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ))}
      </div>
    </details>
  );
}

// ── Métodos de cobro ─────────────────────────────────────────────────────────

function FormularioMetodo({
  metodo,
  onListo,
}: {
  metodo?: MetodoCobroPublico;
  onListo: () => void;
}) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [tipo, setTipo] = useState<TipoMetodoCobro>(metodo?.tipo ?? 'manual');
  const [pasarela, setPasarela] = useState<Pasarela>(metodo?.pasarela ?? 'paypal');
  const [moneda, setMoneda] = useState<Moneda>(metodo?.moneda ?? 'USD');
  const enLinea = tipo === 'pasarela';
  // Con pasarela solo se ofrecen las monedas en las que esa pasarela cobra (nunca bolívares).
  const monedas: readonly Moneda[] = enLinea ? INFO_PASARELA[pasarela].monedas : MONEDAS;
  const monedaValida = monedas.includes(moneda) ? moneda : (monedas[0] ?? 'USD');

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const instrucciones =
      textoDe(d, 'instrucciones') ??
      (enLinea
        ? `Pagas en la página segura de ${INFO_PASARELA[pasarela].nombre}. Tus datos de pago nunca pasan por NV Streaming.`
        : '');
    const cuerpo = {
      nombre: textoDe(d, 'nombre') ?? '',
      moneda: monedaValida,
      instrucciones,
      tipo,
      pasarela: enLinea ? pasarela : null,
      requiereReferencia: enLinea ? false : d.get('requiereReferencia') === 'on',
      activo: d.get('activo') === 'on',
      orden: textoDe(d, 'orden') ?? '0',
    };
    const r = metodo
      ? await ejecutar('PATCH', `/finanzas/metodos-cobro/${metodo.id}`, cuerpo)
      : await ejecutar('POST', '/finanzas/metodos-cobro', cuerpo);
    if (r) onListo();
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['manual', 'Manual', 'El cliente paga por su cuenta y envía el comprobante.'],
              [
                'pasarela',
                'Pago en línea',
                'El cliente paga en la pasarela y la factura se confirma sola.',
              ],
            ] as const
          ).map(([valor, texto, ayuda]) => (
            <label
              key={valor}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde-fuerte bg-hundida px-3.5 py-3 text-sm transition-colors has-checked:border-marca has-checked:bg-marca-suave"
            >
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
                className="mt-0.5 accent-[var(--nv-marca)]"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{texto}</span>
                <span className="text-xs text-tinta-tenue">{ayuda}</span>
              </span>
            </label>
          ))}
        </div>
        {campos.tipo && <p className="text-xs font-medium text-peligro">{campos.tipo}</p>}
      </fieldset>
      <div
        className={clsx(
          'grid gap-4',
          enLinea
            ? 'sm:grid-cols-2 xl:grid-cols-[1fr_12rem_12rem_8rem]'
            : 'sm:grid-cols-[1fr_12rem_8rem]',
        )}
      >
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          defaultValue={metodo?.nombre}
          placeholder={enLinea ? 'Ej. Tarjeta o PayPal' : 'Ej. Pago móvil Banco X'}
          error={campos.nombre}
        />
        {enLinea && (
          <Selector
            etiqueta="Pasarela"
            name="pasarela"
            value={pasarela}
            onChange={(e) => setPasarela(e.target.value as Pasarela)}
            error={campos.pasarela}
          >
            {PASARELAS.map((p) => (
              <option key={p} value={p}>
                {INFO_PASARELA[p].nombre}
              </option>
            ))}
          </Selector>
        )}
        <Selector
          etiqueta="Moneda"
          name="moneda"
          value={monedaValida}
          onChange={(e) => setMoneda(e.target.value as Moneda)}
          error={campos.moneda}
          ayuda={
            enLinea
              ? `${INFO_PASARELA[pasarela].nombre} cobra en ${monedas.join(', ')}.`
              : undefined
          }
        >
          {monedas.map((m) => (
            <option key={m} value={m}>
              {m} · {INFO_MONEDA[m].nombre}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Orden"
          name="orden"
          type="number"
          min={0}
          max={999}
          defaultValue={metodo?.orden ?? 0}
          error={campos.orden}
        />
      </div>
      <AreaTexto
        etiqueta={enLinea ? 'Nota para el cliente (opcional)' : 'Instrucciones para el cliente'}
        name="instrucciones"
        rows={enLinea ? 2 : 5}
        required={!enLinea}
        defaultValue={metodo?.instrucciones}
        placeholder={
          enLinea
            ? 'Ej. Aceptamos tarjetas de crédito y débito.'
            : 'Titular: …\nBanco: …\nCuenta o teléfono: …'
        }
        ayuda={
          enLinea
            ? 'Las credenciales de la pasarela nunca se escriben aquí: van en el entorno del servidor.'
            : 'Se muestran tal cual al cliente cuando va a pagar.'
        }
        error={campos.instrucciones}
      />
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {!enLinea && (
          <Casilla
            name="requiereReferencia"
            etiqueta="Pide número de referencia"
            ayuda="El cliente debe escribir la referencia del banco al reportar."
            defaultChecked={metodo?.requiereReferencia ?? true}
          />
        )}
        <Casilla
          name="activo"
          etiqueta="Activo"
          ayuda="Solo los activos se ofrecen al pagar."
          defaultChecked={metodo?.activo ?? true}
        />
      </div>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando}>
          {metodo ? 'Guardar cambios' : 'Crear método'}
        </Boton>
        <Boton variante="fantasma" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function CambiarActivoMetodo({ metodo }: { metodo: MetodoCobroPublico }) {
  const { cargando, error, ejecutar } = useAccion();
  return (
    <>
      <Boton
        tamano="sm"
        variante="fantasma"
        cargando={cargando}
        icono={metodo.activo ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
        onClick={() =>
          void ejecutar('PATCH', `/finanzas/metodos-cobro/${metodo.id}`, { activo: !metodo.activo })
        }
        aria-label={`${metodo.activo ? 'Desactivar' : 'Activar'} ${metodo.nombre}`}
      >
        {metodo.activo ? 'Desactivar' : 'Activar'}
      </Boton>
      {error && <p className="w-full text-right text-xs text-peligro">{error.mensaje}</p>}
    </>
  );
}

export function ListaMetodos({ metodos }: { metodos: MetodoCobroPublico[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const grupos = MONEDAS.map((m) => ({
    moneda: m as Moneda,
    lista: metodos.filter((x) => x.moneda === m),
  })).filter((g) => g.lista.length > 0);

  return (
    <>
      <div className="border-b border-borde px-5 py-3 sm:px-6">
        {editando === 'nuevo' ? (
          <PanelFormulario
            titulo="Nuevo método de cobro"
            onCerrar={() => setEditando(null)}
            className="my-2"
          >
            <FormularioMetodo onListo={() => setEditando(null)} />
          </PanelFormulario>
        ) : (
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<Plus className="size-4" />}
            onClick={() => setEditando('nuevo')}
          >
            Nuevo método
          </Boton>
        )}
      </div>
      {grupos.length === 0 ? (
        <EstadoVacio icono={CreditCard} titulo="Todavía no hay métodos de cobro">
          Añade al menos uno por moneda para que los clientes sepan cómo pagarte.
        </EstadoVacio>
      ) : (
        grupos.map(({ moneda, lista }) => (
          <section key={moneda} aria-labelledby={`metodos-${moneda}`}>
            <h3
              id={`metodos-${moneda}`}
              className="flex items-center gap-2 border-b border-borde bg-hundida/60 px-5 py-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase sm:px-6"
            >
              {moneda}
              <span className="font-normal tracking-normal text-tinta-tenue normal-case">
                {INFO_MONEDA[moneda].nombre} · {lista.length}{' '}
                {lista.length === 1 ? 'método' : 'métodos'}
              </span>
            </h3>
            <ul className="divide-y divide-borde border-b border-borde last:border-b-0">
              {lista.map((m) => (
                <li key={m.id} className="px-5 py-4 sm:px-6">
                  {editando === m.id ? (
                    <PanelFormulario
                      titulo={`Editar ${m.nombre}`}
                      onCerrar={() => setEditando(null)}
                    >
                      <FormularioMetodo metodo={m} onListo={() => setEditando(null)} />
                    </PanelFormulario>
                  ) : (
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                      <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={clsx('font-medium', !m.activo && 'text-tinta-suave')}>
                            {m.nombre}
                          </span>
                          {m.activo ? (
                            <Insignia tono="exito">Activo</Insignia>
                          ) : (
                            <Insignia>Inactivo</Insignia>
                          )}
                          {m.tipo === 'pasarela' ? (
                            <Insignia tono="acento">
                              <Globe className="size-3" aria-hidden="true" />
                              Pago en línea · {nombrePasarela(m.pasarela)}
                            </Insignia>
                          ) : (
                            m.requiereReferencia && (
                              <Insignia tono="marca">Pide referencia</Insignia>
                            )
                          )}
                          <span className="text-xs text-tinta-tenue tabular-nums">
                            Orden {m.orden}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm whitespace-pre-line text-tinta-suave">
                          {m.instrucciones}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Boton
                          tamano="sm"
                          variante="fantasma"
                          icono={<Pencil className="size-3.5" />}
                          onClick={() => setEditando(m.id)}
                          aria-label={`Editar ${m.nombre}`}
                        >
                          Editar
                        </Boton>
                        <CambiarActivoMetodo metodo={m} />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
