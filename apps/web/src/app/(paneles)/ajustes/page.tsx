import type { ResumenCliente, SesionListada } from '@nv/shared';
import type { Metadata } from 'next';
import {
  CajaPerfil,
  CambiarContrasena,
  CerrarOtrasSesiones,
  DosPasos,
  ListaSesiones as SesionesCliente,
  Recordatorios,
  TusDatos,
} from '@/componentes/cliente/perfil-cuenta';
import { CabeceraCuenta } from '@/componentes/cliente/piezas-cuenta';
import {
  FormularioContrasena,
  FormularioPerfil,
  ListaSesiones,
  SeccionDosPasos,
} from '@/componentes/panel/ajustes';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { haceCuanto } from '@/lib/formato';
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

  if (esCliente) {
    const lista = [...(sesiones.datos ?? [])]
      .sort((a, b) => Number(b.actual) - Number(a.actual))
      .map((s) => ({
        ...s,
        detalle: `${s.ip ? `IP ${s.ip}` : 'IP desconocida'} · ${
          s.actual ? 'activa ahora' : `activa ${haceCuanto(s.ultimaActividadEn)}`
        }`,
      }));
    return (
      <>
        <CabeceraCuenta
          titulo="Perfil y seguridad"
          descripcion="Tus datos, tu contraseña y dónde tienes la sesión abierta."
        />
        <CajaPerfil titulo="Tus datos" descripcion="Así te llamamos y te facturamos.">
          {cliente ? (
            <TusDatos
              inicial={{
                nombre: sesion.usuario.nombre,
                correo: sesion.usuario.correo,
                documento: cliente.documento,
                pais: cliente.pais,
                monedaPreferida: cliente.monedaPreferida,
                whatsapp: whatsapp?.valor ?? null,
                aceptaWhatsapp: Boolean(whatsapp?.consentimientoEn),
              }}
            />
          ) : (
            <Alerta tono="peligro">No pudimos cargar tus datos. Recarga la página.</Alerta>
          )}
        </CajaPerfil>
        <CajaPerfil titulo="Contraseña" descripcion="Al cambiarla cerramos tus otras sesiones.">
          <CambiarContrasena correo={sesion.usuario.correo} />
        </CajaPerfil>
        <CajaPerfil
          titulo="Verificación en dos pasos"
          descripcion="Aunque alguien sepa tu contraseña, no podrá entrar."
        >
          {dosPasos.datos ? (
            <DosPasos estado={dosPasos.datos} />
          ) : (
            <Alerta tono="peligro">No pudimos cargar este ajuste. Recarga la página.</Alerta>
          )}
        </CajaPerfil>
        <CajaPerfil
          titulo="Dónde tienes la sesión abierta"
          descripcion="Si no reconoces un dispositivo, ciérralo y cambia tu contraseña."
          accion={lista.length > 1 ? <CerrarOtrasSesiones /> : undefined}
        >
          <SesionesCliente sesiones={lista} />
        </CajaPerfil>
        <CajaPerfil
          titulo="Avisos"
          descripcion="Las facturas y los avisos de pago te llegan siempre."
        >
          {preferencias ? (
            <Recordatorios recibir={preferencias.recibirRecordatorios} />
          ) : (
            <Alerta tono="peligro">
              No pudimos cargar tus preferencias de avisos. Recarga la página.
            </Alerta>
          )}
        </CajaPerfil>
      </>
    );
  }

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
