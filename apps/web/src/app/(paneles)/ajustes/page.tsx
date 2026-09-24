import type { ResumenCliente, SesionListada } from '@nv/shared';
import type { Metadata } from 'next';
import { DatosFacturacion } from '@/componentes/cliente/datos-facturacion';
import {
  FormularioContrasena,
  FormularioPerfil,
  ListaSesiones,
  PreferenciaRecordatorios,
  SeccionDosPasos,
} from '@/componentes/panel/ajustes';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Perfil y seguridad' };

export default async function Ajustes() {
  const sesion = await requerirSesion();
  const [dosPasos, sesiones] = await Promise.all([
    leerApi<{
      activo: boolean;
      obligatorio: boolean;
      activadoEn: string | null;
      codigosRestantes: number;
    }>('/cuenta/2fa'),
    leerApi<SesionListada[]>('/cuenta/sesiones'),
  ]);
  const esCliente = sesion.usuario.rol === 'cliente';
  const [cliente, preferencias] = esCliente
    ? await Promise.all([
        leerApi<ResumenCliente>('/mi/resumen').then((r) => r.datos?.cliente),
        leerApi<{ recibirRecordatorios: boolean }>('/autoservicio/preferencias').then(
          (r) => r.datos,
        ),
      ])
    : [null, null];
  const whatsapp = cliente?.contactos.find((c) => c.tipo === 'whatsapp');

  return (
    <>
      <CabeceraPagina
        titulo="Perfil y seguridad"
        descripcion="Tus datos, tu contraseña y los dispositivos con acceso a tu cuenta."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta>
          <CabeceraTarjeta titulo="Perfil" />
          <div className="p-5 sm:p-6">
            <FormularioPerfil nombre={sesion.usuario.nombre} correo={sesion.usuario.correo} />
          </div>
        </Tarjeta>
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Contraseña"
            descripcion="Al cambiarla cerramos tus otras sesiones."
          />
          <div className="p-5 sm:p-6">
            <FormularioContrasena />
          </div>
        </Tarjeta>
      </div>
      {cliente && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Datos de facturación"
            descripcion="Los usamos en tus facturas y para avisarte de pagos y vencimientos."
          />
          <div className="p-5 sm:p-6">
            <DatosFacturacion
              inicial={{
                documento: cliente.documento,
                pais: cliente.pais,
                monedaPreferida: cliente.monedaPreferida,
                whatsapp: whatsapp?.valor ?? null,
                aceptaWhatsapp: Boolean(whatsapp?.consentimientoEn),
              }}
            />
          </div>
        </Tarjeta>
      )}
      {esCliente && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Avisos"
            descripcion="Por correo y, si lo aceptaste en tus datos de facturación, por WhatsApp."
          />
          <div className="p-5 sm:p-6">
            {preferencias ? (
              <PreferenciaRecordatorios recibir={preferencias.recibirRecordatorios} />
            ) : (
              <Alerta tono="peligro">
                No pudimos cargar tus preferencias de avisos. Recarga la página.
              </Alerta>
            )}
          </div>
        </Tarjeta>
      )}
      <Tarjeta>
        <CabeceraTarjeta titulo="Verificación en dos pasos" />
        <div className="p-5 sm:p-6">
          {dosPasos.datos && <SeccionDosPasos estado={dosPasos.datos} />}
        </div>
      </Tarjeta>
      <Tarjeta>
        <CabeceraTarjeta
          titulo="Sesiones abiertas"
          descripcion="Si no reconoces un dispositivo, ciérralo y cambia tu contraseña."
        />
        <div className="p-5 sm:p-6">
          <ListaSesiones sesiones={sesiones.datos ?? []} />
        </div>
      </Tarjeta>
    </>
  );
}
