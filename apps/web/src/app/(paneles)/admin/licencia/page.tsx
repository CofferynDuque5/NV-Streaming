import { ETIQUETA_ESTADO_LICENCIA, type EstadoLicencia, ROLES_EQUIPO } from '@nv/shared';
import { KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import { CargarLicencia } from '@/componentes/admin/licencia';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerLicencia } from '@/lib/licencia';
import { fechaPoliticas } from '@/lib/politicas';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Licencia' };

const TONO: Record<EstadoLicencia, 'exito' | 'aviso' | 'peligro' | 'neutro'> = {
  sin_control: 'neutro',
  vigente: 'exito',
  por_vencer: 'aviso',
  en_gracia: 'aviso',
  vencida: 'peligro',
  falta: 'peligro',
  invalida: 'peligro',
};

export default async function Licencia() {
  const sesion = await requerirSesion({ roles: ROLES_EQUIPO });
  const esAdmin = sesion.usuario.rol === 'admin';
  const licencia = await leerLicencia();

  return (
    <>
      <CabeceraPagina
        titulo="Licencia"
        descripcion="Hasta cuándo puede usar este sistema el negocio. Al vencer, el equipo solo consulta; los clientes siguen viendo sus servicios."
      />

      {!licencia ? (
        <Alerta tono="peligro">No se pudo leer la licencia. Recarga la página.</Alerta>
      ) : licencia.estado === 'sin_control' ? (
        <Tarjeta>
          <EstadoVacio icono={KeyRound} titulo="Esta instalación no usa licencia">
            Es la instalación propia del sistema: no vence ni necesita renovarse.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="grid gap-5">
          <Tarjeta>
            <CabeceraTarjeta
              titulo={licencia.negocio ?? 'Sin licencia válida'}
              descripcion={licencia.motivo ?? undefined}
              accion={
                <Insignia tono={TONO[licencia.estado]}>
                  {ETIQUETA_ESTADO_LICENCIA[licencia.estado]}
                </Insignia>
              }
            />
            {licencia.vence && (
              <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
                <div className="grid gap-0.5">
                  <dt className="text-tinta-suave">Plan</dt>
                  <dd className="font-semibold">
                    {licencia.prueba ? `Prueba gratis (${licencia.plan})` : licencia.plan}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-tinta-suave">Vence</dt>
                  <dd className="font-semibold">
                    {fechaPoliticas(licencia.vence)}
                    {licencia.diasRestantes !== null && licencia.diasRestantes >= 0 && (
                      <span className="font-normal text-tinta-suave">
                        {' '}
                        ·{' '}
                        {licencia.diasRestantes === 0
                          ? 'hoy'
                          : `en ${licencia.diasRestantes} ${licencia.diasRestantes === 1 ? 'día' : 'días'}`}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-tinta-suave">Días de gracia hasta</dt>
                  <dd className="font-semibold">{fechaPoliticas(licencia.graciaHasta!)}</dd>
                </div>
              </dl>
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraTarjeta
              titulo="Renovar"
              descripcion="Pide la renovación a quien te vendió el sistema y pega aquí la licencia que te envíe. Solo sirve en esta instalación."
            />
            {esAdmin ? (
              <CargarLicencia />
            ) : (
              <p className="px-5 py-4 text-sm text-tinta-suave sm:px-6">
                Solo administración puede cargar la licencia.
              </p>
            )}
          </Tarjeta>
        </div>
      )}
    </>
  );
}
