import { BotonEnlace } from '@/componentes/ui/boton';
import { Logo } from '@/componentes/logo';

export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid max-w-md justify-items-center gap-5 text-center">
        <Logo />
        <p className="font-titulo text-6xl font-semibold text-marca">404</p>
        <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
        <p className="text-tinta-suave">
          Puede que el enlace esté mal escrito o que la página ya no exista.
        </p>
        <BotonEnlace href="/">Volver al inicio</BotonEnlace>
      </div>
    </main>
  );
}
