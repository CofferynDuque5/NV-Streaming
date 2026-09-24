'use client';

import type { SesionListada } from '@nv/shared';
import { Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { CodigosRespaldo, ConfiguradorDosPasos } from '@/componentes/acceso/dos-pasos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Insignia } from '@/componentes/ui/insignia';
import { Interruptor } from '@/componentes/ui/interruptor';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { haceCuanto } from '@/lib/formato';

type Metodo = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Estado común de un formulario de ajustes. */
function useAccion() {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  async function ejecutar<T>(
    metodo: Metodo,
    ruta: string,
    cuerpo: unknown,
    mensaje: string | null,
  ): Promise<T | null> {
    setCargando(true);
    setError(null);
    setExito(null);
    const r = await llamarApi<T>(metodo, ruta, cuerpo);
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setExito(mensaje);
    router.refresh();
    return r.datos;
  }
  return { ejecutar, error, cargando, exito, campos: erroresPorCampo(error) };
}

function Mensajes({ error, exito }: { error: ErrorLlamada | null; exito: string | null }) {
  return (
    <>
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      {exito && <Alerta tono="exito">{exito}</Alerta>}
    </>
  );
}

export function FormularioPerfil({ nombre, correo }: { nombre: string; correo: string }) {
  const { ejecutar, error, cargando, exito, campos } = useAccion();
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void ejecutar(
          'PATCH',
          '/cuenta/perfil',
          { nombre: new FormData(e.currentTarget).get('nombre') },
          'Perfil actualizado.',
        );
      }}
    >
      <Campo
        etiqueta="Nombre"
        name="nombre"
        defaultValue={nombre}
        autoComplete="name"
        required
        error={campos.nombre}
      />
      <Campo
        etiqueta="Correo"
        name="correo"
        value={correo}
        readOnly
        disabled
        ayuda="Para cambiar tu correo escribe a soporte."
      />
      <Mensajes error={error} exito={exito} />
      <Boton type="submit" variante="secundario" cargando={cargando} className="justify-self-start">
        Guardar cambios
      </Boton>
    </form>
  );
}

export function FormularioContrasena() {
  const { ejecutar, error, cargando, exito, campos } = useAccion();
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    const ok = await ejecutar(
      'POST',
      '/cuenta/contrasena',
      { actual: d.get('actual'), nueva: d.get('nueva') },
      'Contraseña cambiada. Cerramos tus otras sesiones.',
    );
    if (ok) formulario.reset();
  }
  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <Campo
        etiqueta="Contraseña actual"
        name="actual"
        type="password"
        autoComplete="current-password"
        required
        error={campos.actual}
      />
      <Campo
        etiqueta="Contraseña nueva"
        name="nueva"
        type="password"
        autoComplete="new-password"
        required
        error={campos.nueva}
        ayuda="Al menos 10 caracteres."
      />
      <Mensajes error={error} exito={exito} />
      <Boton type="submit" variante="secundario" cargando={cargando} className="justify-self-start">
        Cambiar contraseña
      </Boton>
    </form>
  );
}

interface EstadoDosPasos {
  activo: boolean;
  obligatorio: boolean;
  activadoEn: string | null;
  codigosRestantes: number;
}

export function SeccionDosPasos({ estado }: { estado: EstadoDosPasos }) {
  const [configurando, setConfigurando] = useState(false);
  const [modo, setModo] = useState<'regenerar' | 'desactivar' | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const { ejecutar, error, cargando, exito, campos } = useAccion();

  if (codigos) return <CodigosRespaldo codigos={codigos} alContinuar={() => setCodigos(null)} />;

  if (!estado.activo) {
    return configurando ? (
      <ConfiguradorDosPasos />
    ) : (
      <div className="grid gap-4">
        <p className="text-sm text-tinta-suave">
          Añade un código de tu teléfono a tu contraseña. Así nadie entra aunque la descubra.
        </p>
        <Boton onClick={() => setConfigurando(true)} className="justify-self-start">
          Activar verificación en dos pasos
        </Boton>
      </div>
    );
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    if (modo === 'regenerar') {
      const r = await ejecutar<{ codigosRespaldo: string[] }>(
        'POST',
        '/cuenta/2fa/codigos-respaldo',
        { codigo: d.get('codigo') },
        null,
      );
      if (r) {
        setCodigos(r.codigosRespaldo);
        setModo(null);
      }
    } else {
      const r = await ejecutar(
        'POST',
        '/cuenta/2fa/desactivar',
        { contrasena: d.get('contrasena'), codigo: d.get('codigo') },
        'Verificación desactivada.',
      );
      if (r) setModo(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono="exito">Activada</Insignia>
        {estado.obligatorio && <Insignia>Obligatoria para tu rol</Insignia>}
        <span className="text-sm text-tinta-suave">
          {estado.codigosRestantes}{' '}
          {estado.codigosRestantes === 1
            ? 'código de respaldo disponible'
            : 'códigos de respaldo disponibles'}
        </span>
      </div>
      {estado.codigosRestantes <= 3 && (
        <Alerta tono="aviso">Te quedan pocos códigos de respaldo. Genera unos nuevos.</Alerta>
      )}
      {modo ? (
        <form
          onSubmit={enviar}
          className="grid gap-4 rounded-xl border border-borde bg-hundida p-4"
          noValidate
          key={modo}
        >
          {modo === 'desactivar' && (
            <Campo
              etiqueta="Contraseña"
              name="contrasena"
              type="password"
              autoComplete="current-password"
              required
              error={campos.contrasena}
            />
          )}
          <Campo
            etiqueta="Código de tu aplicación"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            error={campos.codigo}
          />
          <Mensajes error={error} exito={null} />
          <div className="flex gap-2">
            <Boton
              type="submit"
              variante={modo === 'desactivar' ? 'peligro' : 'primario'}
              cargando={cargando}
            >
              {modo === 'desactivar' ? 'Desactivar' : 'Generar códigos nuevos'}
            </Boton>
            <Boton variante="fantasma" onClick={() => setModo(null)}>
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setModo('regenerar')}>
            Nuevos códigos de respaldo
          </Boton>
          {!estado.obligatorio && (
            <Boton variante="fantasma" onClick={() => setModo('desactivar')}>
              Desactivar
            </Boton>
          )}
        </div>
      )}
      {exito && <Alerta tono="exito">{exito}</Alerta>}
    </div>
  );
}

export function ListaSesiones({ sesiones }: { sesiones: SesionListada[] }) {
  const { ejecutar, error, cargando } = useAccion();
  const otras = sesiones.filter((s) => !s.actual).length;
  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-borde rounded-xl border border-borde">
        {sesiones.map((s) => (
          <li key={s.id} className="flex items-center gap-4 px-4 py-3">
            {/Android|iOS/.test(s.dispositivo) ? (
              <Smartphone className="size-5 shrink-0 text-tinta-tenue" aria-hidden="true" />
            ) : (
              <Monitor className="size-5 shrink-0 text-tinta-tenue" aria-hidden="true" />
            )}
            <div className="grid min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {s.dispositivo} {s.actual && <Insignia tono="marca">Esta sesión</Insignia>}
              </span>
              <span className="text-xs text-tinta-tenue">
                {s.ip ?? 'IP desconocida'} · activa {haceCuanto(s.ultimaActividadEn)}
              </span>
            </div>
            {!s.actual && (
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={() => void ejecutar('DELETE', `/cuenta/sesiones/${s.id}`, undefined, null)}
              >
                Cerrar
              </Boton>
            )}
          </li>
        ))}
      </ul>
      <Mensajes error={error} exito={null} />
      {otras > 0 && (
        <Boton
          variante="secundario"
          cargando={cargando}
          className="justify-self-start"
          onClick={() => void ejecutar('POST', '/cuenta/sesiones/cerrar-otras', {}, null)}
        >
          Cerrar las demás sesiones
        </Boton>
      )}
    </div>
  );
}

/** Preferencia del cliente sobre los recordatorios de vencimiento. */
export function PreferenciaRecordatorios({ recibir }: { recibir: boolean }) {
  const { ejecutar, error, cargando, exito } = useAccion();
  const [valor, setValor] = useState(recibir);

  async function cambiar(nuevo: boolean) {
    setValor(nuevo);
    const r = await ejecutar<{ recibirRecordatorios: boolean }>(
      'PUT',
      '/autoservicio/preferencias',
      { recibirRecordatorios: nuevo },
      nuevo
        ? 'Listo: te avisaremos antes de que venza tu suscripción.'
        : 'Listo: ya no te enviaremos recordatorios de vencimiento.',
    );
    setValor(r ? r.recibirRecordatorios : !nuevo);
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <p id="preferencia-recordatorios" className="text-sm font-medium">
            Recibir recordatorios de vencimiento
          </p>
          <p id="preferencia-recordatorios-ayuda" className="text-sm text-tinta-suave">
            Te escribimos unos días antes de que venza tu suscripción. Aunque los desactives,
            seguirás recibiendo las facturas, los avisos de pago y los de suspensión del servicio.
          </p>
        </div>
        <Interruptor
          activo={valor}
          cargando={cargando}
          onCambiar={(v) => void cambiar(v)}
          aria-labelledby="preferencia-recordatorios"
          aria-describedby="preferencia-recordatorios-ayuda"
          className="mt-0.5"
        />
      </div>
      <Mensajes error={error} exito={exito} />
    </div>
  );
}
