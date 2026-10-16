'use client';

import {
  type ConfiguracionAsistentePublica,
  configurarAsistenteSchema,
  INFO_PROVEEDOR_IA,
  type ProveedorIa,
} from '@nv/shared';
import clsx from 'clsx';
import { CircleCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Interruptor } from '@/componentes/ui/interruptor';
import { Selector } from '@/componentes/ui/selector';
import { erroresPorCampo, type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { AYUDA_PROVEEDOR } from '@/lib/asistente';

type Valores = {
  activo: boolean;
  proveedor: ProveedorIa;
  modelo: string;
  topeMensualUsd: string;
  mensajesDiariosPorUsuario: string;
};

export function FormularioAsistente({ config }: { config: ConfiguracionAsistentePublica }) {
  const router = useRouter();
  const id = useId();
  const [valores, setValores] = useState<Valores>({
    activo: config.activo,
    proveedor: config.proveedor,
    modelo: config.modelo ?? '',
    topeMensualUsd: config.topeMensualUsd,
    mensajesDiariosPorUsuario: String(config.mensajesDiariosPorUsuario),
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorApi, setErrorApi] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // El aviso de guardado se oculta solo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Motores que se pueden elegir: los que la API lista. El de pruebas solo si está disponible.
  const opciones = config.proveedores.filter(
    (p) => p.proveedor !== 'sandbox' || p.disponible || p.proveedor === config.proveedor,
  );
  const elegido = config.proveedores.find((p) => p.proveedor === valores.proveedor);
  const deCosto = INFO_PROVEEDOR_IA[valores.proveedor].deCosto;

  function poner<K extends keyof Valores>(clave: K, v: Valores[K]) {
    setValores((prev) => ({ ...prev, [clave]: v }));
    setErrores((prev) => {
      const copia = { ...prev };
      delete copia[clave];
      return copia;
    });
    setErrorApi(null);
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    const entrada = {
      activo: valores.activo,
      proveedor: valores.proveedor,
      modelo: valores.modelo.trim(),
      topeMensualUsd: valores.topeMensualUsd.trim(),
      mensajesDiariosPorUsuario: valores.mensajesDiariosPorUsuario.trim(),
    };
    const r = configurarAsistenteSchema.safeParse(entrada);
    if (!r.success) {
      const nuevos: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const clave = String(issue.path[0] ?? '');
        if (clave && !nuevos[clave]) nuevos[clave] = issue.message;
      }
      setErrores(nuevos);
      return;
    }
    setErrores({});
    setCargando(true);
    // Se envía la entrada del esquema (el modelo vacío es "el de por defecto").
    const res = await llamarApi<ConfiguracionAsistentePublica>('PUT', '/asistente/configuracion', {
      ...entrada,
      mensajesDiariosPorUsuario: r.data.mensajesDiariosPorUsuario,
    });
    setCargando(false);
    if (!res.ok) {
      setErrorApi(res.error);
      return;
    }
    setAviso('Configuración guardada. Queda registrada en la auditoría.');
    router.refresh();
  }

  const camposApi = erroresPorCampo(errorApi);
  const error = (clave: keyof Valores) => errores[clave] ?? camposApi[clave];

  return (
    <form onSubmit={guardar} noValidate aria-label="Configurar el asistente" className="grid gap-6">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-borde bg-hundida/50 p-4">
        <div className="grid gap-0.5">
          <p id={`${id}-activo`} className="text-sm font-medium">
            Asistente activo
          </p>
          <p id={`${id}-activo-ayuda`} className="text-xs text-tinta-tenue">
            Apagado, nadie del equipo puede usarlo; las conversaciones se conservan.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={clsx(
              'text-xs font-medium',
              valores.activo ? 'text-exito' : 'text-tinta-tenue',
            )}
            aria-hidden="true"
          >
            {valores.activo ? 'Activo' : 'Apagado'}
          </span>
          <Interruptor
            activo={valores.activo}
            onCambiar={(v) => poner('activo', v)}
            aria-labelledby={`${id}-activo`}
            aria-describedby={`${id}-activo-ayuda`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Selector
          etiqueta="Motor"
          name="proveedor"
          value={valores.proveedor}
          onChange={(e) => poner('proveedor', e.currentTarget.value as ProveedorIa)}
          error={error('proveedor')}
          ayuda={AYUDA_PROVEEDOR[valores.proveedor].descripcion}
        >
          {opciones.map((p) => (
            <option key={p.proveedor} value={p.proveedor}>
              {p.nombre}
              {p.disponible ? '' : ' (sin configurar)'}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Modelo (opcional)"
          name="modelo"
          value={valores.modelo}
          onChange={(e) => poner('modelo', e.currentTarget.value)}
          placeholder={elegido?.modeloPorDefecto ?? ''}
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          error={error('modelo')}
          ayuda="Déjalo vacío para usar el modelo por defecto del motor."
        />
        <Campo
          etiqueta="Tope mensual (USD)"
          name="topeMensualUsd"
          inputMode="decimal"
          value={valores.topeMensualUsd}
          onChange={(e) => poner('topeMensualUsd', e.currentTarget.value)}
          error={error('topeMensualUsd')}
          ayuda={
            deCosto
              ? 'Gasto máximo del mes con este motor. Al alcanzarlo, el asistente deja de responder hasta el mes siguiente.'
              : 'Solo cuenta con Claude, que cobra por uso. El modelo local y el de pruebas no tienen costo.'
          }
        />
        <Campo
          etiqueta="Mensajes diarios por persona"
          name="mensajesDiariosPorUsuario"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          step={1}
          value={valores.mensajesDiariosPorUsuario}
          onChange={(e) => poner('mensajesDiariosPorUsuario', e.currentTarget.value)}
          error={error('mensajesDiariosPorUsuario')}
          ayuda="Cuántas preguntas puede hacer cada persona del equipo al día."
        />
      </div>

      {elegido && !elegido.disponible && (
        <Alerta tono="aviso" titulo="Este motor aún no está listo en el servidor">
          {elegido.motivo ? `${elegido.motivo} ` : ''}
          {AYUDA_PROVEEDOR[valores.proveedor].falta} Mientras tanto, el asistente no responderá.
        </Alerta>
      )}
      {errorApi && !errorApi.campos && <Alerta tono="peligro">{errorApi.mensaje}</Alerta>}
      {Object.keys(errores).length > 0 && (
        <p role="alert" className="text-sm text-peligro">
          Revisa los campos marcados.
        </p>
      )}
      <div>
        <Boton type="submit" cargando={cargando}>
          Guardar cambios
        </Boton>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {aviso && (
          <p className="pointer-events-auto flex items-center gap-2 rounded-xl border border-exito/30 bg-elevada px-4 py-3 text-sm shadow-nv">
            <CircleCheck className="size-4 shrink-0 text-exito" aria-hidden="true" />
            {aviso}
          </p>
        )}
      </div>
    </form>
  );
}
