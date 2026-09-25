'use client';

import { CATEGORIAS_TICKET, type SuscripcionPublica } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { CATEGORIA_TICKET } from '@/lib/estados';

export function NuevaSolicitud({
  suscripciones,
  categoria,
}: {
  suscripciones: Pick<SuscripcionPublica, 'id' | 'plan'>[];
  categoria?: string | undefined;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    setCargando(true);
    setError(null);
    const r = await llamarApi<{ id: string }>('POST', '/mi/tickets', d);
    if (!r.ok) {
      setCargando(false);
      return setError(r.error);
    }
    router.push(`/cuenta/soporte/${r.datos.id}`);
  }

  const campos = erroresPorCampo(error);
  const inicial = (CATEGORIAS_TICKET as readonly string[]).includes(categoria ?? '')
    ? categoria
    : 'otro';

  return (
    <form onSubmit={enviar} className="grid gap-4">
      <Campo
        etiqueta="Asunto"
        name="asunto"
        required
        minLength={4}
        maxLength={160}
        error={campos.asunto}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Selector etiqueta="Tema" name="categoria" defaultValue={inicial} error={campos.categoria}>
          {CATEGORIAS_TICKET.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_TICKET[c]}
            </option>
          ))}
        </Selector>
        {suscripciones.length > 0 && (
          <Selector etiqueta="Servicio relacionado" name="suscripcionId" defaultValue="">
            <option value="">Ninguno en particular</option>
            {suscripciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.plan.servicio}: {s.plan.nombre}
              </option>
            ))}
          </Selector>
        )}
      </div>
      <AreaTexto
        etiqueta="Cuéntanos qué pasa"
        name="mensaje"
        rows={6}
        required
        minLength={2}
        maxLength={5000}
        error={campos.mensaje}
        ayuda="Nunca te pediremos contraseñas ni datos de tarjeta por este medio."
      />
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <Boton type="submit" cargando={cargando} className="sm:justify-self-start">
        Enviar solicitud
      </Boton>
    </form>
  );
}

export function ResponderTicket({ ticketId, resuelto }: { ticketId: string; resuelto: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState<'responder' | 'cerrar' | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function responder(e: FormEvent) {
    e.preventDefault();
    setCargando('responder');
    setError(null);
    const r = await llamarApi('POST', `/mi/tickets/${ticketId}/mensajes`, { texto });
    setCargando(null);
    if (!r.ok) return setError(r.error);
    setTexto('');
    router.refresh();
  }

  async function cerrar() {
    setCargando('cerrar');
    setError(null);
    const r = await llamarApi('POST', `/mi/tickets/${ticketId}/cerrar`);
    setCargando(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const campos = erroresPorCampo(error);

  return (
    <form onSubmit={responder} className="grid gap-3">
      <AreaTexto
        etiqueta={
          resuelto ? '¿Sigue el problema? Escribe y reabrimos la solicitud' : 'Tu respuesta'
        }
        name="texto"
        rows={4}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        required
        minLength={2}
        maxLength={5000}
        error={campos.texto}
      />
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando === 'responder'}>
          Enviar respuesta
        </Boton>
        {!resuelto && (
          <Boton variante="fantasma" cargando={cargando === 'cerrar'} onClick={() => void cerrar()}>
            Marcar como resuelta
          </Boton>
        )}
      </div>
    </form>
  );
}
