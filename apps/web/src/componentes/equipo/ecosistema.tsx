import { enlaceEcosistema } from '@nv/shared';
import { ExternalLink, Globe, LayoutGrid } from 'lucide-react';
import Link from 'next/link';

/**
 * Dirección del NV Gestor (variable URL_GESTOR). Se lee al pedir la página,
 * así que se cambia sin volver a compilar. Sin ella, el enlace no aparece.
 */
export function urlGestor(): string | null {
  return enlaceEcosistema(process.env.URL_GESTOR);
}

const claseTarjeta =
  'group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-borde bg-superficie px-4 py-3.5 hover:border-borde-fuerte';

/**
 * Ecosistema NV en el centro del equipo: la tienda y el Gestor, cada uno con
 * su propio inicio de sesión. Solo enlaces: aquí no se mueve ningún dato.
 */
export function EcosistemaNv() {
  const gestor = urlGestor();
  return (
    <section aria-labelledby="titulo-ecosistema" className="grid gap-3">
      <h2 id="titulo-ecosistema" className="text-[clamp(1.125rem,2.4vw,1.375rem)]">
        Ecosistema NV
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/" className={claseTarjeta}>
          <Globe className="size-5 text-cian" aria-hidden="true" />
          <span className="grid min-w-0">
            <b className="text-sm">Tienda NV Streaming</b>
            <small className="text-tinta-tenue">Lo que ven tus clientes</small>
          </span>
        </Link>
        {gestor && (
          <a href={gestor} target="_blank" rel="noopener noreferrer" className={claseTarjeta}>
            <LayoutGrid className="size-5 text-violeta" aria-hidden="true" />
            <span className="grid min-w-0">
              <b className="text-sm">NV Gestor</b>
              <small className="text-tinta-tenue">Cuentas y perfiles, con su propio acceso</small>
            </span>
            <ExternalLink
              className="size-4 text-tinta-tenue"
              aria-label="Se abre en otra pestaña"
            />
          </a>
        )}
      </div>
    </section>
  );
}
