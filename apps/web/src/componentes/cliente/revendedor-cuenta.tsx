'use client';

import type { MiSolicitudRevendedor } from '@nv/shared';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { claseEntrada, Mensaje, MensajeError, type Validacion } from './pago';
import { claseArea, claseCaja, PAISES } from './piezas-cuenta';

const miles = new Intl.NumberFormat('es');

function validarNombre(v: string): Validacion {
  const n = v.trim().length;
  if (n < 2) return ['mal', 'Escribe el nombre de tu tienda o negocio.'];
  if (n > 120) return ['mal', 'Máximo 120 caracteres.'];
  return ['ok', 'Nombre listo'];
}

function validarTelefono(v: string): Validacion {
  if (!v.trim()) return ['', 'Opcional. Con código de país'];
  return /^\+\d{7,15}$/.test(v.replace(/[\s().-]/g, ''))
    ? ['ok', 'Teléfono listo']
    : ['mal', 'Escríbelo con el código de país, por ejemplo +58 414 000 0000.'];
}

function validarMensaje(v: string): Validacion {
  const n = v.trim().length;
  if (n > 1000) return ['mal', 'Máximo 1.000 caracteres.'];
  return n ? ['ok', `${miles.format(n)} de 1.000 caracteres`] : ['', ''];
}

/** Solicitud para ser revendedor, validada mientras se escribe. */
export function SolicitudRevendedor({ previa }: { previa: MiSolicitudRevendedor | null }) {
  const router = useRouter();
  const notificar = useNotificar();
  const id = useId();
  const refNombre = useRef<HTMLInputElement>(null);
  const refTelefono = useRef<HTMLInputElement>(null);
  const refMensaje = useRef<HTMLTextAreaElement>(null);
  const [nombre, setNombre] = useState(previa?.nombreComercial ?? '');
  const [documento, setDocumento] = useState(previa?.documento ?? '');
  const [telefono, setTelefono] = useState(previa?.telefono ?? '');
  const [pais, setPais] = useState(previa?.pais ?? 'VE');
  const [mensaje, setMensaje] = useState(previa?.mensaje ?? '');
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);

  const vNombre: Validacion = campos.nombreComercial
    ? ['mal', campos.nombreComercial]
    : intento || nombre
      ? validarNombre(nombre)
      : ['', 'Así te verán tus clientes'];
  const vDocumento: Validacion = campos.documento ? ['mal', campos.documento] : ['', 'Opcional'];
  const vTelefono: Validacion = campos.telefono
    ? ['mal', campos.telefono]
    : validarTelefono(telefono);
  const vMensaje: Validacion = campos.mensaje ? ['mal', campos.mensaje] : validarMensaje(mensaje);
  const paises = pais && !PAISES[pais] ? { ...PAISES, [pais]: pais } : PAISES;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (validarNombre(nombre)[0] !== 'ok') return refNombre.current?.focus();
    if (validarTelefono(telefono)[0] === 'mal') return refTelefono.current?.focus();
    if (validarMensaje(mensaje)[0] === 'mal') return refMensaje.current?.focus();
    setCargando(true);
    setError(null);
    const texto = (v: string) => v.trim() || undefined;
    const r = await llamarApi('POST', '/revendedor/solicitud', {
      nombreComercial: nombre.trim(),
      documento: texto(documento),
      telefono: texto(telefono),
      pais,
      mensaje: texto(mensaje),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar('Recibimos tu solicitud. El equipo la revisará.');
    router.refresh();
  }

  return (
    <form noValidate onSubmit={enviar} aria-label="Solicitud de revendedor" className={claseCaja}>
      <header className="grid gap-0.5">
        <h2 className="text-lg">{previa ? 'Envía tu solicitud de nuevo' : 'Solicitud'}</h2>
        <p className="text-[0.84rem] text-tinta-suave">
          La revisa el equipo a mano. No tiene costo y tus datos solo los ve el equipo de NV.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-nombre`} className="text-sm font-semibold">
            Nombre de tu tienda
          </label>
          <input
            ref={refNombre}
            id={`${id}-nombre`}
            maxLength={120}
            placeholder="Ej.: Tienda Luna"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={vNombre[0] === 'mal' || undefined}
            aria-describedby={`${id}-nombre-ayuda`}
            className={claseEntrada(vNombre[0])}
          />
          <Mensaje id={`${id}-nombre-ayuda`} estado={vNombre[0]} texto={vNombre[1]} />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-documento`} className="text-sm font-semibold">
            Cédula o RIF
          </label>
          <input
            id={`${id}-documento`}
            maxLength={40}
            placeholder="V-00.000.000"
            autoComplete="off"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            aria-describedby={`${id}-documento-ayuda`}
            className={claseEntrada(vDocumento[0])}
          />
          <Mensaje id={`${id}-documento-ayuda`} estado={vDocumento[0]} texto={vDocumento[1]} />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-telefono`} className="text-sm font-semibold">
            Teléfono o WhatsApp
          </label>
          <input
            ref={refTelefono}
            id={`${id}-telefono`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="+58 414 000 0000"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            aria-invalid={vTelefono[0] === 'mal' || undefined}
            aria-describedby={`${id}-telefono-ayuda`}
            className={claseEntrada(vTelefono[0])}
          />
          <Mensaje id={`${id}-telefono-ayuda`} estado={vTelefono[0]} texto={vTelefono[1]} />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-pais`} className="text-sm font-semibold">
            País
          </label>
          <select
            id={`${id}-pais`}
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            className={claseEntrada(campos.pais ? 'mal' : '')}
          >
            {Object.entries(paises).map(([codigo, n]) => (
              <option key={codigo} value={codigo}>
                {n}
              </option>
            ))}
          </select>
          {campos.pais && <Mensaje id={`${id}-pais-error`} estado="mal" texto={campos.pais} />}
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-mensaje`} className="text-sm font-semibold">
          Cuéntanos de tu negocio (opcional)
        </label>
        <textarea
          ref={refMensaje}
          id={`${id}-mensaje`}
          rows={3}
          maxLength={1000}
          placeholder="Cuántos clientes tienes, dónde vendes…"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          aria-invalid={vMensaje[0] === 'mal' || undefined}
          aria-describedby={`${id}-mensaje-ayuda`}
          className={claseArea(vMensaje[0])}
        />
        <Mensaje id={`${id}-mensaje-ayuda`} estado={vMensaje[0]} texto={vMensaje[1]} />
      </div>
      {error && !error.campos && <MensajeError error={error} />}
      <Boton
        type="submit"
        cargando={cargando}
        icono={<Send className="size-4" aria-hidden="true" />}
        className="justify-self-start"
      >
        {previa ? 'Enviar de nuevo' : 'Enviar solicitud'}
      </Boton>
    </form>
  );
}
