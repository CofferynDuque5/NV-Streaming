import type {
  AsuntoCodigoPublico,
  BuzonPublico,
  CuentaServicioDetalle,
  ServicioPublico,
} from '@nv/shared';
import type { Metadata } from 'next';
import { BuscarCodigo, ListaAsuntos, ListaBuzones } from '@/componentes/admin/codigos';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Correos de códigos' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CorreosDeCodigos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'codigos.consultar' });
  const puedeConfigurar = sesion.permisos.includes('codigos.configurar');
  const q = await searchParams;
  const cuentaId = typeof q.cuenta === 'string' && UUID.test(q.cuenta) ? q.cuenta : null;

  const [asuntos, buzones, servicios, cuenta] = await Promise.all([
    leerApi<AsuntoCodigoPublico[]>('/codigos/asuntos').then((r) => r.datos),
    puedeConfigurar
      ? leerApi<BuzonPublico[]>('/codigos/buzones').then((r) => r.datos)
      : Promise.resolve(null),
    sesion.permisos.includes('catalogo.ver')
      ? leerApi<ServicioPublico[]>('/catalogo/servicios').then((r) => r.datos ?? [])
      : Promise.resolve([] as ServicioPublico[]),
    cuentaId && sesion.permisos.includes('cuentas.ver')
      ? leerApi<CuentaServicioDetalle>(`/cuentas/${cuentaId}`).then((r) => r.datos)
      : Promise.resolve(null),
  ]);
  const opciones = (
    servicios.length
      ? servicios.map((s) => ({ id: s.id, nombre: s.nombre }))
      : [...new Map((asuntos ?? []).map((a) => [a.servicio.id, a.servicio])).values()]
  ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const sinBuzones = puedeConfigurar && buzones !== null && buzones.length === 0;

  return (
    <>
      <CabeceraPagina
        titulo="Correos de códigos"
        descripcion="Lee los buzones donde llegan los correos de Netflix, Disney+, Max y los demás, y muestra el último código o enlace (Hogar, verificación) de cada cuenta. También lo pueden pedir tus clientes desde «Mis accesos»."
      />
      {sinBuzones && (
        <Alerta tono="aviso" titulo="Primero agrega un buzón">
          Abajo, en «Buzones», agrega el correo donde llegan los códigos. Después agrega los asuntos
          de cada servicio.
        </Alerta>
      )}
      <Tarjeta>
        <CabeceraTarjeta
          titulo="Buscar el último código"
          descripcion="Elige la cuenta desde el Inventario («Ver código») o escribe su correo. Cada búsqueda queda registrada."
        />
        <div className="p-5 sm:p-6">
          <BuscarCodigo
            cuenta={
              cuenta
                ? { id: cuenta.id, pista: cuenta.pista, servicio: cuenta.servicio.nombre }
                : null
            }
            servicios={opciones}
          />
        </div>
      </Tarjeta>
      <Tarjeta>
        <CabeceraTarjeta
          titulo="Asuntos por servicio"
          descripcion="Solo se muestran los correos cuyo asunto contiene alguno de estos textos (sin importar tildes ni mayúsculas). Así nunca se muestran correos de cambio de clave u otros."
        />
        {asuntos ? (
          <ListaAsuntos asuntos={asuntos} servicios={opciones} puedeConfigurar={puedeConfigurar} />
        ) : (
          <div className="p-5">
            <Alerta tono="peligro">No pudimos cargar los asuntos. Recarga la página.</Alerta>
          </div>
        )}
      </Tarjeta>
      {puedeConfigurar && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Buzones"
            descripcion="Correos IMAP donde llegan los códigos. Se leen todos a la vez y se toma el más reciente."
          />
          {buzones ? (
            <ListaBuzones buzones={buzones} />
          ) : (
            <div className="p-5">
              <Alerta tono="peligro">No pudimos cargar los buzones. Recarga la página.</Alerta>
            </div>
          )}
        </Tarjeta>
      )}
    </>
  );
}
