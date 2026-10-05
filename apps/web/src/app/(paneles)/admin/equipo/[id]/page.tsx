import { ETIQUETAS_ROL, type UsuarioPublico } from '@nv/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccionesUsuario } from '@/componentes/panel/acciones-usuario';
import { Alerta } from '@/componentes/ui/alerta';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Detalle de la persona' };

type Detalle = UsuarioPublico & { invitacionPendiente: boolean; sesionesActivas: number };

export default async function DetallePersona({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion({ permiso: 'usuarios.ver' });
  const { id } = await params;
  const { estado, datos: u } = await leerApi<Detalle>(`/usuarios/${encodeURIComponent(id)}`);
  if (estado === 404 || estado === 400 || !u) notFound();
  const esUnoMismo = u.id === sesion.usuario.id;
  const puedeGestionar = sesion.permisos.includes('usuarios.gestionar');

  const datos: [string, string][] = [
    ['Correo', u.correo],
    ['Rol', ETIQUETAS_ROL[u.rol]],
    ['Correo confirmado', u.correoVerificado ? 'Sí' : 'No'],
    ['Verificación en dos pasos', u.dosPasosActivo ? 'Activada' : 'Sin activar'],
    ['Sesiones abiertas', String(u.sesionesActivas)],
    ['Cuenta creada', formatearFechaHora(u.creadoEn)],
    ['Último acceso', u.ultimoAccesoEn ? formatearFechaHora(u.ultimoAccesoEn) : 'Nunca'],
  ];

  return (
    <>
      <Link
        href="/admin/equipo"
        className="inline-flex w-fit items-center gap-2 text-sm text-tinta-suave hover:text-tinta"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Equipo y usuarios
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{u.nombre}</h1>
        {u.estado === 'activo' ? (
          <Insignia tono="exito">Activa</Insignia>
        ) : (
          <Insignia tono="peligro">Suspendida</Insignia>
        )}
        {u.invitacionPendiente && <Insignia tono="aviso">Invitación pendiente</Insignia>}
      </div>

      <Tarjeta>
        <CabeceraTarjeta titulo="Datos de la cuenta" />
        <dl className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {datos.map(([k, v]) => (
            <div key={k} className="grid gap-0.5">
              <dt className="text-xs text-tinta-tenue">{k}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>

      {puedeGestionar && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Administración"
            descripcion="Cada cambio queda registrado en la auditoría con tu nombre."
          />
          {esUnoMismo ? (
            <div className="p-5 sm:p-6">
              <Alerta tono="info">
                Para cambiar tus propios datos ve a Perfil y seguridad. Tu rol y estado los cambia
                otra persona de administración.
              </Alerta>
            </div>
          ) : (
            <AccionesUsuario
              id={u.id}
              rol={u.rol}
              estado={u.estado}
              dosPasosActivo={u.dosPasosActivo}
              invitacionPendiente={u.invitacionPendiente}
            />
          )}
        </Tarjeta>
      )}
    </>
  );
}
