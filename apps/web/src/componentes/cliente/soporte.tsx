'use client';

import { CATEGORIAS_TICKET, type CategoriaTicket } from '@nv/shared';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { CATEGORIA_TICKET } from '@/lib/estados';
import { claseEntrada, Mensaje, MensajeError, type Validacion } from './pago';
import { claseArea, claseEnlace } from './piezas-cuenta';

const miles = new Intl.NumberFormat('es');

function validarAsunto(v: string): Validacion {
  const n = v.trim().length;
  if (n < 4) return ['mal', 'Escribe al menos 4 caracteres.'];
  if (n > 160) return ['mal', 'Máximo 160 caracteres.'];
  return ['ok', 'Asunto listo'];
}

function validarMensaje(v: string): Validacion {
  const n = v.trim().length;
  if (n < 2) return ['mal', 'Cuéntanos qué pasa.'];
  if (n > 5000) return ['mal', 'Máximo 5.000 caracteres.'];
  return ['ok', `${miles.format(n)} de 5.000 caracteres`];
}

/**
 * Nueva solicitud: tema con chips, asunto, servicio (opcional) y mensaje, cada
 * uno validado mientras se escribe.
 */
export function NuevaSolicitud({
  servicios,
  categoria,
}: {
  servicios: { id: string; nombre: string }[];
  categoria?: string | undefined;
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const id = useId();
  const refAsunto = useRef<HTMLInputElement>(null);
  const refMensaje = useRef<HTMLTextAreaElement>(null);
  const refTema = useRef<HTMLDivElement>(null);
  const [tema, setTema] = useState<CategoriaTicket | ''>(
    (CATEGORIAS_TICKET as readonly string[]).includes(categoria ?? '')
      ? (categoria as CategoriaTicket)
      : '',
  );
  const [asunto, setAsunto] = useState('');
  const [servicio, setServicio] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);

  const vTema: Validacion = tema
    ? ['ok', '']
    : intento
      ? ['mal', 'Elige de qué se trata.']
      : ['', ''];
  const vAsunto: Validacion = campos.asunto
    ? ['mal', campos.asunto]
    : intento || asunto
      ? validarAsunto(asunto)
      : ['', 'En pocas palabras'];
  const vMensaje: Validacion = campos.mensaje
    ? ['mal', campos.mensaje]
    : intento || mensaje
      ? validarMensaje(mensaje)
      : ['', 'Mientras más detalles, más rápido te ayudamos'];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (!tema) return refTema.current?.querySelector('button')?.focus();
    if (validarAsunto(asunto)[0] !== 'ok') return refAsunto.current?.focus();
    if (validarMensaje(mensaje)[0] !== 'ok') return refMensaje.current?.focus();
    setCargando(true);
    setError(null);
    const r = await llamarApi<{ id: string; numero: number }>('POST', '/mi/tickets', {
      categoria: tema,
      asunto: asunto.trim(),
      mensaje: mensaje.trim(),
      ...(servicio ? { suscripcionId: servicio } : {}),
    });
    if (!r.ok) {
      setCargando(false);
      return setError(r.error);
    }
    notificar(`Recibimos tu solicitud #${r.datos.numero}. Te respondemos por aquí y por correo.`);
    router.push(`/cuenta/soporte/${r.datos.id}`);
  }

  return (
    <form
      noValidate
      onSubmit={enviar}
      aria-label="Nueva solicitud"
      className="grid gap-3.5 rounded-[1.375rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5"
    >
      <div className="grid gap-1.5">
        <span id={`${id}-tema`} className="text-sm font-semibold">
          ¿De qué se trata?
        </span>
        <div
          ref={refTema}
          role="radiogroup"
          aria-labelledby={`${id}-tema`}
          aria-describedby={`${id}-tema-ayuda`}
          className="flex flex-wrap gap-2"
        >
          {CATEGORIAS_TICKET.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={tema === c}
              className="chip"
              onClick={() => setTema(c)}
            >
              {CATEGORIA_TICKET[c]}
            </button>
          ))}
        </div>
        <Mensaje id={`${id}-tema-ayuda`} estado={vTema[0]} texto={vTema[1]} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-asunto`} className="text-sm font-semibold">
          Asunto
        </label>
        <input
          ref={refAsunto}
          id={`${id}-asunto`}
          maxLength={160}
          autoComplete="off"
          placeholder="Ej.: No me llega el código"
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          aria-invalid={vAsunto[0] === 'mal' || undefined}
          aria-describedby={`${id}-asunto-ayuda`}
          className={claseEntrada(vAsunto[0])}
        />
        <Mensaje id={`${id}-asunto-ayuda`} estado={vAsunto[0]} texto={vAsunto[1]} />
      </div>

      {servicios.length > 0 && (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-servicio`} className="text-sm font-semibold">
            Servicio relacionado (opcional)
          </label>
          <select
            id={`${id}-servicio`}
            value={servicio}
            onChange={(e) => setServicio(e.target.value)}
            className={claseEntrada('')}
          >
            <option value="">Ninguno en particular</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-mensaje`} className="text-sm font-semibold">
          Cuéntanos qué pasa
        </label>
        <textarea
          ref={refMensaje}
          id={`${id}-mensaje`}
          rows={5}
          maxLength={5000}
          placeholder="Qué intentabas hacer y qué viste"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          aria-invalid={vMensaje[0] === 'mal' || undefined}
          aria-describedby={`${id}-mensaje-ayuda ${id}-nunca`}
          className={claseArea(vMensaje[0])}
        />
        <Mensaje id={`${id}-mensaje-ayuda`} estado={vMensaje[0]} texto={vMensaje[1]} />
        <p id={`${id}-nunca`} className="text-xs text-tinta-tenue">
          Nunca te pediremos contraseñas ni datos de tarjeta por este medio.
        </p>
      </div>

      {error && !error.campos && <MensajeError error={error} />}
      <Boton
        type="submit"
        cargando={cargando}
        icono={<Send className="size-4" aria-hidden="true" />}
        className="justify-self-start"
      >
        Enviar solicitud
      </Boton>
    </form>
  );
}

/** Responder en la conversación o darla por resuelta. */
export function ResponderTicket({ ticketId, resuelto }: { ticketId: string; resuelto: boolean }) {
  const router = useRouter();
  const notificar = useNotificar();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState('');
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState<'responder' | 'cerrar' | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);

  const n = texto.trim().length;
  const v: Validacion = campos.texto
    ? ['mal', campos.texto]
    : intento && n < 2
      ? ['mal', 'Escribe tu respuesta.']
      : n > 5000
        ? ['mal', 'Máximo 5.000 caracteres.']
        : ['', ''];

  async function responder(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (n < 2 || n > 5000) return area.current?.focus();
    setCargando('responder');
    setError(null);
    const r = await llamarApi('POST', `/mi/tickets/${ticketId}/mensajes`, { texto: texto.trim() });
    setCargando(null);
    if (!r.ok) return setError(r.error);
    setTexto('');
    setIntento(false);
    notificar('Enviamos tu respuesta.');
    router.refresh();
  }

  async function cerrar() {
    setCargando('cerrar');
    setError(null);
    const r = await llamarApi('POST', `/mi/tickets/${ticketId}/cerrar`);
    setCargando(null);
    if (!r.ok) return setError(r.error);
    notificar('Cerramos la solicitud. ¡Qué bueno que se resolvió!');
    router.refresh();
  }

  return (
    <form
      noValidate
      onSubmit={responder}
      className="grid gap-3.5 rounded-[1.375rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5"
    >
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-texto`} className="text-sm font-semibold">
          {resuelto ? '¿Sigue el problema? Escribe y reabrimos la solicitud' : 'Tu respuesta'}
        </label>
        <textarea
          ref={area}
          id={`${id}-texto`}
          rows={3}
          maxLength={5000}
          placeholder="Escribe aquí"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-invalid={v[0] === 'mal' || undefined}
          aria-describedby={`${id}-ayuda`}
          className={claseArea(v[0])}
        />
        <Mensaje id={`${id}-ayuda`} estado={v[0]} texto={v[1]} />
      </div>
      {error && !error.campos && <MensajeError error={error} />}
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="submit"
          cargando={cargando === 'responder'}
          icono={<Send className="size-4" aria-hidden="true" />}
        >
          Responder
        </Boton>
        {!resuelto && (
          <button
            type="button"
            className={claseEnlace}
            disabled={cargando !== null}
            onClick={() => void cerrar()}
          >
            {cargando === 'cerrar' ? 'Cerrando…' : 'Ya se resolvió'}
          </button>
        )}
      </div>
    </form>
  );
}
