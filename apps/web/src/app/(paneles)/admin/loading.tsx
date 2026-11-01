/**
 * Lo que se ve al cambiar de módulo mientras llega la página: el menú queda
 * quieto y el contenido muestra al momento que ya se está cargando.
 */
export default function CargandoAdmin() {
  return (
    <div role="status" aria-live="polite" className="grid gap-6">
      <span className="sr-only">Cargando…</span>
      <div className="grid gap-2" aria-hidden="true">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-hundida" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-hundida" />
      </div>
      <div
        className="grid grid-cols-3 gap-px overflow-hidden rounded-nv border border-borde bg-borde"
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2 bg-superficie px-5 py-4">
            <div className="h-3 w-20 animate-pulse rounded bg-hundida" />
            <div className="h-6 w-12 animate-pulse rounded bg-hundida" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 rounded-nv border border-borde p-5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-hundida" />
        ))}
      </div>
    </div>
  );
}
