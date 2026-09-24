import Link from 'next/link';
import { Logo } from './logo';
import { BotonEnlace } from './ui/boton';

export function CabeceraSitio() {
  return (
    <header className="sticky top-0 z-30 border-b border-borde bg-fondo/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#como-funciona"
            className="hidden rounded-lg px-3 py-2 text-sm text-tinta-suave hover:text-tinta md:inline-block"
          >
            Cómo funciona
          </Link>
          <Link
            href="/#revendedores"
            className="hidden rounded-lg px-3 py-2 text-sm text-tinta-suave hover:text-tinta md:inline-block"
          >
            Revendedores
          </Link>
          <BotonEnlace href="/ingresar" variante="fantasma" tamano="sm">
            Ingresar
          </BotonEnlace>
          <BotonEnlace href="/registro" tamano="sm">
            Crear cuenta
          </BotonEnlace>
        </nav>
      </div>
    </header>
  );
}

export function PieSitio() {
  return (
    <footer className="border-t border-borde">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-tinta-tenue sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="grid gap-2">
          <Logo />
          <p>Solo servicios autorizados, con pagos por pasarelas oficiales.</p>
        </div>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/terminos" className="hover:text-tinta">
            Términos
          </Link>
          <Link href="/privacidad" className="hover:text-tinta">
            Privacidad
          </Link>
          <span>© {new Date().getFullYear()} NV Streaming</span>
        </nav>
      </div>
    </footer>
  );
}
