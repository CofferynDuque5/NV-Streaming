import type { ConversacionDetalle, ConversacionResumen, EstadoAsistente } from '@nv/shared';
import { Bot, PlugZap, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { ChatAsistente } from '@/componentes/admin/asistente';
import { PestanasAsistente } from '@/componentes/admin/piezas-asistente';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { nombreProveedor, RUTA_ASISTENTE } from '@/lib/asistente';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Asistente' };

type Crudo = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Asistente({ searchParams }: { searchParams: Promise<Crudo> }) {
  const sesion = await requerirSesion({ permiso: 'asistente.usar' });
  const puedeConfigurar = sesion.permisos.includes('asistente.configurar');
  const { conversacion } = await searchParams;
  const idConversacion =
    typeof conversacion === 'string' && UUID.test(conversacion) ? conversacion : null;

  const { datos: estado } = await leerApi<EstadoAsistente>('/asistente/estado');
  const listo = Boolean(estado?.activo && estado.disponible);
  const [lista, detalle] = listo
    ? await Promise.all([
        leerApi<ConversacionResumen[]>('/asistente/conversaciones'),
        idConversacion
          ? leerApi<ConversacionDetalle>(`/asistente/conversaciones/${idConversacion}`)
          : Promise.resolve(null),
      ])
    : [null, null];

  return (
    <>
      <CabeceraPagina
        titulo="Asistente"
        descripcion="Pregunta en lenguaje natural por clientes, vencimientos, cobros y tickets. Si algo requiere un cambio, te lo propone y tú decides."
      />
      <PestanasAsistente vista="conversaciones" puedeConfigurar={puedeConfigurar} />
      <p className="-mt-2 flex items-start gap-2 text-sm text-tinta-suave">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden="true" />
        El asistente solo consulta lo que tu usuario puede ver. Nunca ejecuta nada sin tu
        confirmación.
      </p>

      {!estado ? (
        <Alerta tono="peligro" titulo="No pudimos cargar el asistente">
          Recarga la página. Si sigue fallando, revisa que la API esté en marcha.
        </Alerta>
      ) : !estado.activo ? (
        <Tarjeta>
          <EstadoVacio
            icono={Bot}
            titulo="El asistente está desactivado"
            accion={
              puedeConfigurar ? (
                <BotonEnlace href={`${RUTA_ASISTENTE}/configuracion`} variante="secundario">
                  Configurar el asistente
                </BotonEnlace>
              ) : undefined
            }
          >
            {puedeConfigurar
              ? 'Actívalo en Configuración: elige el motor, el tope de gasto y cuántos mensajes puede enviar cada persona al día.'
              : 'Administración todavía no lo ha activado. Cuando lo haga, podrás usarlo desde aquí.'}
          </EstadoVacio>
        </Tarjeta>
      ) : !estado.disponible ? (
        <Tarjeta>
          <EstadoVacio
            icono={PlugZap}
            titulo="El asistente no está disponible ahora"
            accion={
              puedeConfigurar ? (
                <BotonEnlace href={`${RUTA_ASISTENTE}/configuracion`} variante="secundario">
                  Revisar la configuración
                </BotonEnlace>
              ) : undefined
            }
          >
            {puedeConfigurar
              ? `El motor elegido (${nombreProveedor(estado.proveedor)}) no está listo en el servidor${
                  estado.motivoNoDisponible ? `: ${estado.motivoNoDisponible}` : '.'
                }`
              : 'Su motor no está listo en el servidor. Avisa a administración o inténtalo más tarde.'}
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <ChatAsistente
          estado={estado}
          conversaciones={lista?.datos ?? []}
          detalle={detalle?.datos ?? null}
          errorDetalle={
            detalle && !detalle.datos
              ? 'No encontramos esa conversación. Puede que se haya archivado o que no sea tuya.'
              : null
          }
        />
      )}
    </>
  );
}
