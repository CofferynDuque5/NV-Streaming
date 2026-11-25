'use client';

import type { SuscripcionConLugar } from '@nv/shared';
import clsx from 'clsx';
import { Check, Copy, MessageCircle, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Dialogo } from '@/componentes/admin/cuentas-gestor';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { llamarApi } from '@/lib/api-cliente';
import { etiquetaDia, formatearHora } from '@/lib/formato';

type Canal = 'whatsapp' | 'telegram' | 'copiado';

function cuandoMensaje(d: number): string {
  if (d === 0) return 'vence hoy';
  if (d === -1) return 'vence mañana';
  if (d < -1) return `vence en ${-d} días`;
  return d === 1 ? 'venció hace 1 día' : `venció hace ${d} días`;
}

/** El mensaje de cobro del Gestor, con la plataforma, el cliente y el día. */
export function mensajeCobro(s: SuscripcionConLugar): string {
  return [
    `Hola, ${s.cliente.nombre}.`,
    '',
    `Su suscripción de ${s.plan.servicio}${s.lugar?.completa ? ' (cuenta completa)' : ''} ${cuandoMensaje(s.diasVencida)}.`,
    'Si desea renovar, por favor avísenos con tiempo para mantener activa la suscripción.',
    '',
    '¡Gracias por confiar en NV Streaming!',
  ].join('\n');
}

/** «hoy a las 11:58 a. m.», «ayer a las…» o «el 20 nov. a las…». */
export function cuandoCobro(iso: string): string {
  const dia = etiquetaDia(iso);
  const prefijo = dia === 'Hoy' ? 'hoy' : dia === 'Ayer' ? 'ayer' : `el ${dia}`;
  return `${prefijo} a las ${formatearHora(iso)}`;
}

/** Quién cobró: «Revendedor X» o el nombre del usuario del equipo. */
export function quienCobro(cobro: NonNullable<SuscripcionConLugar['cobro']>): string | null {
  if (cobro.revendedor) return `revendedor ${cobro.revendedor}`;
  return cobro.por;
}

/** Contactos para elegir: los guardados del cliente, sin repetir. */
function opcionesContacto(s: SuscripcionConLugar) {
  const vistos = new Set<string>();
  const lista = s.contactos ?? [];
  return lista.filter((c) => {
    const clave = `${c.tipo}:${c.valor}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/**
 * Cobrar a mano con el mensaje ya armado (se puede editar): copiarlo, o
 * enviarlo por WhatsApp o Telegram al contacto elegido. Cualquiera de las tres
 * deja marcado el cobro (con quién lo hizo). `ruta` es a dónde avisar.
 */
export function Cobrar({
  s,
  ruta,
  otrasRutas = [],
}: {
  s: SuscripcionConLugar;
  ruta: string;
  /** Cuenta completa de una sola persona: el mismo cobro marca sus otros perfiles. */
  otrasRutas?: string[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [errorMarca, setErrorMarca] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [numero, setNumero] = useState('');
  const [telegram, setTelegram] = useState('');
  const [copiado, setCopiado] = useState(false);
  const contactos = opcionesContacto(s);
  const whatsapps = contactos.filter((c) => c.tipo === 'whatsapp');
  const telegrams = contactos.filter((c) => c.tipo === 'telegram');
  const digitos = numero.replace(/\D/g, '');
  const usuarioTelegram = telegram.trim().replace(/^@/, '');

  function abrir() {
    setTexto(mensajeCobro(s));
    setNumero(s.contacto.whatsapp ?? '');
    setTelegram(s.contacto.telegram?.replace(/^@/, '') ?? '');
    setCopiado(false);
    setMarcado(false);
    setErrorMarca(null);
    setAbierto(true);
  }

  /** Queda marcado como cobrado ahora (se puede volver a cobrar otro día). */
  async function marcar(canal: Canal) {
    const r = await llamarApi('POST', ruta, { canal });
    if (r.ok) await Promise.all(otrasRutas.map((x) => llamarApi('POST', x, { canal })));
    if (r.ok) {
      setMarcado(true);
      setErrorMarca(null);
    } else {
      setErrorMarca(r.error.mensaje);
    }
  }

  function cerrar() {
    setAbierto(false);
    if (marcado) router.refresh();
  }

  async function copiar(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      return true;
    } catch {
      setCopiado(false);
      return false;
    }
  }

  async function soloCopiar() {
    if (await copiar()) void marcar('copiado');
  }

  async function porTelegram() {
    void marcar('telegram');
    await copiar();
    window.open(`https://t.me/${usuarioTelegram}`, '_blank', 'noopener');
  }

  const quien = s.cobro ? quienCobro(s.cobro) : null;

  return (
    <>
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<MessageCircle className="size-3.5" />}
        onClick={abrir}
        aria-label={`${s.cobro ? 'Volver a cobrar' : 'Cobrar'} a ${s.cliente.nombre}`}
      >
        {s.cobro ? 'Volver a cobrar' : 'Cobrar'}
      </Boton>
      {abierto && (
        <Dialogo
          titulo="Cobrar por mensaje"
          icono={<MessageCircle className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
        >
          {s.cobro && (
            <p className="text-sm text-tinta-suave">
              Ya se le cobró {cuandoCobro(s.cobro.en)}
              {quien ? ` (${quien})` : ''}.
            </p>
          )}
          <label className="grid gap-1 text-sm">
            Mensaje
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              rows={8}
              className="rounded-xl border border-borde bg-hundida p-3 text-sm"
            />
          </label>
          {whatsapps.length > 1 && (
            <label className="grid gap-1 text-sm">
              Contacto de WhatsApp
              <select
                value={whatsapps.some((c) => c.valor === numero) ? numero : ''}
                onChange={(e) => setNumero(e.currentTarget.value)}
                className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
              >
                <option value="">Otro número</option>
                {whatsapps.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.valor}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm">
            WhatsApp
            <input
              value={numero}
              onChange={(e) => setNumero(e.currentTarget.value)}
              inputMode="tel"
              placeholder="584121234567"
              className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
            />
          </label>
          {telegrams.length > 1 ? (
            <label className="grid gap-1 text-sm">
              Contacto de Telegram
              <select
                value={usuarioTelegram}
                onChange={(e) => setTelegram(e.currentTarget.value)}
                className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
              >
                {telegrams.map((c) => {
                  const u = c.valor.replace(/^@/, '');
                  return (
                    <option key={u} value={u}>
                      @{u}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : (
            <label className="grid gap-1 text-sm">
              Telegram
              <input
                value={telegram}
                onChange={(e) => setTelegram(e.currentTarget.value)}
                placeholder="usuario (sin @)"
                className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
              />
            </label>
          )}
          {contactos.length === 0 && (
            <Alerta tono="aviso">
              Este cliente no tiene WhatsApp ni Telegram guardados: escribe el número o el usuario,
              o copia el mensaje.
            </Alerta>
          )}
          {copiado && <Alerta tono="exito">Mensaje copiado: pégalo en el chat.</Alerta>}
          {marcado && <Alerta tono="exito">Quedó marcado como cobrado.</Alerta>}
          {errorMarca && <Alerta tono="peligro">{errorMarca}</Alerta>}
          <div className="flex flex-wrap justify-end gap-2">
            <Boton
              variante="secundario"
              icono={copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => void soloCopiar()}
            >
              Copiar mensaje
            </Boton>
            <Boton
              variante="secundario"
              icono={<Send className="size-4" />}
              disabled={!usuarioTelegram}
              onClick={() => void porTelegram()}
            >
              {usuarioTelegram ? `Telegram (@${usuarioTelegram})` : 'Telegram'}
            </Boton>
            <a
              href={
                digitos.length >= 8
                  ? `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void marcar('whatsapp')}
              aria-disabled={digitos.length < 8}
              className={clsx(
                'inline-flex h-10 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-black',
                digitos.length < 8 && 'pointer-events-none opacity-50',
              )}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Enviar por WhatsApp
            </a>
          </div>
        </Dialogo>
      )}
    </>
  );
}
