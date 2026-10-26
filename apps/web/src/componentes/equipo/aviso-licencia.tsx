import type { LicenciaPublica } from '@nv/shared';
import Link from 'next/link';
import { Alerta } from '@/componentes/ui/alerta';
import { fechaPoliticas } from '@/lib/politicas';

/** Aviso del marco del equipo cuando la licencia está por vencer o ya no permite cambios. */
export function AvisoLicencia({ licencia }: { licencia: LicenciaPublica | null }) {
  if (!licencia || licencia.estado === 'sin_control' || licencia.estado === 'vigente') return null;
  const enlace = (
    <Link
      href="/admin/licencia"
      className="font-semibold text-cian underline-offset-4 hover:underline"
    >
      Ver la licencia
    </Link>
  );
  if (licencia.permiteCambios) {
    const dias = licencia.diasRestantes ?? 0;
    const texto =
      licencia.estado === 'en_gracia'
        ? `Venció el ${fechaPoliticas(licencia.vence!)}. Todo sigue funcionando hasta el ${fechaPoliticas(licencia.graciaHasta!)}; después el panel queda en solo lectura.`
        : dias === 0
          ? 'Vence hoy.'
          : `Vence en ${dias} ${dias === 1 ? 'día' : 'días'} (${fechaPoliticas(licencia.vence!)}).`;
    return (
      <Alerta
        tono="aviso"
        titulo={licencia.prueba ? 'Tu prueba gratis termina pronto' : 'Renueva la licencia'}
        className="mb-5"
      >
        {texto} {enlace}
      </Alerta>
    );
  }
  return (
    <Alerta tono="peligro" titulo="Panel en solo lectura" className="mb-5">
      {licencia.estado === 'vencida'
        ? `La licencia venció el ${fechaPoliticas(licencia.vence!)}.`
        : (licencia.motivo ?? 'Esta instalación no tiene una licencia válida.')}{' '}
      Puedes consultar todo, pero no crear ni cambiar nada hasta cargar una licencia vigente. Tus
      clientes siguen viendo sus servicios. {enlace}
    </Alerta>
  );
}
