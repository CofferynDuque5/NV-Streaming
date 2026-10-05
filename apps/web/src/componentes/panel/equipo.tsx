'use client';

import { ETIQUETAS_ROL, ROLES, type Rol, type UsuarioPublico } from '@nv/shared';
import { UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo, clasesEntrada } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

export function SelectorRol({
  name,
  defaultValue,
  id,
}: {
  name: string;
  defaultValue?: Rol;
  id?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? 'operador'} className={clasesEntrada}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ETIQUETAS_ROL[r]}
        </option>
      ))}
    </select>
  );
}

export function InvitarPersona() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [invitada, setInvitada] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    setCargando(true);
    setError(null);
    const r = await llamarApi<UsuarioPublico>('POST', '/usuarios/invitaciones', {
      nombre: d.get('nombre'),
      correo: d.get('correo'),
      rol: d.get('rol'),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setInvitada(r.datos.correo);
    formulario.reset();
    router.refresh();
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<UserPlus className="size-4" />}>
        Invitar persona
      </Boton>
    );
  }

  const campos = erroresPorCampo(error);
  return (
    <div className="w-full rounded-nv border border-borde bg-superficie p-5 shadow-nv sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Invitar a una persona</h2>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg p-1.5 text-tinta-tenue hover:bg-hundida hover:text-tinta"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        onSubmit={enviar}
        className="grid gap-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-start"
        noValidate
      >
        <Campo etiqueta="Nombre" name="nombre" required error={campos.nombre} />
        <Campo etiqueta="Correo" name="correo" type="email" required error={campos.correo} />
        <div className="grid gap-1.5">
          <label htmlFor="rol-invitacion" className="text-sm font-medium">
            Rol
          </label>
          <SelectorRol id="rol-invitacion" name="rol" />
        </div>
        <Boton type="submit" cargando={cargando} className="sm:mt-[1.625rem]">
          Enviar invitación
        </Boton>
      </form>
      <div className="mt-4 grid gap-2">
        {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        {invitada && (
          <Alerta tono="exito">
            Enviamos la invitación a {invitada}. El enlace vence en 72 horas.
          </Alerta>
        )}
      </div>
    </div>
  );
}
