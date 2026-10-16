'use client';

import {
  ADAPTADORES_ENTREGA,
  type AdaptadorEntrega,
  type ConfigEntregaProveedor,
  type PruebaWebhook,
  type SecretoRotado,
  TIEMPO_LIMITE_WEBHOOK,
} from '@nv/shared';
import { Check, Copy, KeyRound, Send, TriangleAlert } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Casilla } from '@/componentes/ui/selector';
import { ADAPTADOR_ENTREGA } from '@/lib/entregas';
import { ErrorGeneral, textoDe, useAccion } from './piezas';

/** Forma de entrega de un proveedor: adaptador, URL del webhook y opciones. */
export function FormularioEntrega({
  config,
  puedeGestionar,
}: {
  config: ConfigEntregaProveedor;
  puedeGestionar: boolean;
}) {
  const [adaptador, setAdaptador] = useState<AdaptadorEntrega>(config.adaptador);
  const [guardado, setGuardado] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardado(false);
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('PUT', `/catalogo/proveedores/${config.proveedor.id}/entrega`, {
      adaptador,
      webhookUrl: adaptador === 'webhook' ? (textoDe(d, 'webhookUrl') ?? '') : undefined,
      tiempoLimiteSegundos:
        textoDe(d, 'tiempoLimiteSegundos') ?? String(config.tiempoLimiteSegundos),
      incluirCorreo: d.get('incluirCorreo') === 'on',
      entregarRenovaciones: d.get('entregarRenovaciones') === 'on',
      instrucciones: textoDe(d, 'instrucciones') ?? '',
    });
    if (r) setGuardado(true);
  }

  return (
    <form onSubmit={enviar} className="grid gap-5 p-5 sm:p-6" noValidate>
      <fieldset className="grid gap-3" disabled={!puedeGestionar}>
        <legend className="mb-2 text-sm font-medium">¿Cómo se entrega?</legend>
        {ADAPTADORES_ENTREGA.map((a) => (
          <label
            key={a}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-3.5 has-checked:border-marca has-checked:bg-marca-suave/40"
          >
            <input
              type="radio"
              name="adaptador"
              value={a}
              checked={adaptador === a}
              onChange={() => setAdaptador(a)}
              className="mt-1 accent-[var(--nv-marca)]"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{ADAPTADOR_ENTREGA[a].nombre}</span>
              <span className="text-xs text-tinta-suave">{ADAPTADOR_ENTREGA[a].descripcion}</span>
            </span>
          </label>
        ))}
        {campos.adaptador && <p className="text-xs font-medium text-peligro">{campos.adaptador}</p>}
      </fieldset>

      {adaptador === 'webhook' && (
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Campo
            etiqueta="URL del proveedor"
            name="webhookUrl"
            type="url"
            inputMode="url"
            required
            defaultValue={config.webhookUrl ?? ''}
            placeholder="https://api.proveedor.com/nv/entregas"
            ayuda="Solo https y direcciones públicas. NV no sigue redirecciones."
            error={campos.webhookUrl}
            disabled={!puedeGestionar}
            spellCheck={false}
            autoCapitalize="off"
          />
          <Campo
            etiqueta="Tiempo límite"
            name="tiempoLimiteSegundos"
            type="number"
            min={TIEMPO_LIMITE_WEBHOOK.min}
            max={TIEMPO_LIMITE_WEBHOOK.max}
            defaultValue={config.tiempoLimiteSegundos}
            ayuda="Segundos."
            error={campos.tiempoLimiteSegundos}
            disabled={!puedeGestionar}
          />
        </div>
      )}

      <AreaTexto
        etiqueta="Instrucciones para el cliente"
        name="instrucciones"
        rows={3}
        maxLength={1000}
        defaultValue={config.instrucciones ?? ''}
        placeholder="Ej.: Abre la app oficial, elige «Canjear» y pega tu código."
        ayuda="Se muestran junto al código o enlace. Sin contraseñas ni datos de cuentas."
        error={campos.instrucciones}
        disabled={!puedeGestionar}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Casilla
          name="entregarRenovaciones"
          etiqueta="Entregar también en cada renovación"
          ayuda="Un código nuevo o un aviso al proveedor por cada periodo pagado."
          defaultChecked={config.entregarRenovaciones}
          disabled={!puedeGestionar}
        />
        {adaptador === 'webhook' && (
          <Casilla
            name="incluirCorreo"
            etiqueta="Enviar el correo del cliente al proveedor"
            ayuda="Solo si el acuerdo lo exige. Si no, solo se envía un identificador."
            defaultChecked={config.incluirCorreo}
            disabled={!puedeGestionar}
          />
        )}
      </div>

      <ErrorGeneral error={error} />
      {guardado && <Alerta tono="exito">Configuración guardada.</Alerta>}
      {puedeGestionar && (
        <div>
          <Boton type="submit" cargando={cargando}>
            Guardar la entrega
          </Boton>
        </div>
      )}
    </form>
  );
}

/** Clave de firma del webhook: se genera aquí y se muestra una sola vez. */
export function ClaveFirma({
  proveedorId,
  tieneSecreto,
  rotadoEn,
}: {
  proveedorId: string;
  tieneSecreto: boolean;
  rotadoEn: string | null;
}) {
  const [secreto, setSecreto] = useState<SecretoRotado | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const { cargando, error, ejecutar } = useAccion();

  async function rotar() {
    const r = await ejecutar<SecretoRotado>(
      'POST',
      `/catalogo/proveedores/${proveedorId}/entrega/secreto`,
    );
    setConfirmar(false);
    if (r) setSecreto(r.datos);
  }

  async function copiar() {
    if (!secreto) return;
    try {
      await navigator.clipboard.writeText(secreto.secreto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2_000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-tinta-suave">
        {tieneSecreto
          ? `Hay una clave activa${rotadoEn ? ` desde el ${new Date(rotadoEn).toLocaleDateString('es-VE')}` : ''}. Solo se mostró al generarla.`
          : 'Todavía no hay clave: genera una y entrégasela al proveedor por un canal seguro.'}
      </p>
      {secreto && (
        <div className="grid gap-2 rounded-xl border border-aviso/30 bg-aviso-suave p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-aviso" aria-hidden="true" />
            Cópiala ahora: no se volverá a mostrar.
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-borde bg-superficie px-2.5 py-1.5 font-mono text-xs select-all">
              {secreto.secreto}
            </code>
            <Boton
              tamano="sm"
              variante="secundario"
              onClick={() => void copiar()}
              aria-label="Copiar la clave de firma"
              icono={
                copiado ? (
                  <Check className="size-3.5 text-exito" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )
              }
            >
              <span aria-live="polite">{copiado ? 'Copiada' : 'Copiar'}</span>
            </Boton>
          </div>
        </div>
      )}
      <ErrorGeneral error={error} />
      {confirmar ? (
        <div className="grid gap-2 rounded-xl border border-borde bg-hundida p-3.5">
          <p className="text-sm">
            {tieneSecreto
              ? 'La clave actual deja de valer al instante: el proveedor rechazará los envíos hasta que ponga la nueva.'
              : 'Se generará una clave nueva.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton tamano="sm" cargando={cargando} onClick={() => void rotar()}>
              {tieneSecreto ? 'Sí, cambiar la clave' : 'Generar'}
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <div>
          <Boton
            variante="secundario"
            icono={<KeyRound className="size-4" aria-hidden="true" />}
            onClick={() => setConfirmar(true)}
          >
            {tieneSecreto ? 'Cambiar la clave de firma' : 'Generar clave de firma'}
          </Boton>
        </div>
      )}
    </div>
  );
}

/** Envía un `ping` firmado a la URL guardada. */
export function ProbarWebhook({ proveedorId }: { proveedorId: string }) {
  const [resultado, setResultado] = useState<PruebaWebhook | null>(null);
  const { cargando, error, ejecutar } = useAccion();

  async function probar() {
    setResultado(null);
    const r = await ejecutar<PruebaWebhook>(
      'POST',
      `/catalogo/proveedores/${proveedorId}/entrega/probar`,
    );
    if (r) setResultado(r.datos);
  }

  return (
    <div className="grid gap-3">
      <div>
        <Boton
          variante="secundario"
          cargando={cargando}
          icono={<Send className="size-4" aria-hidden="true" />}
          onClick={() => void probar()}
        >
          Probar webhook
        </Boton>
      </div>
      <ErrorGeneral error={error} />
      {resultado && (
        <Alerta tono={resultado.ok ? 'exito' : 'peligro'}>
          {resultado.mensaje} ({resultado.duracionMs} ms)
        </Alerta>
      )}
    </div>
  );
}
