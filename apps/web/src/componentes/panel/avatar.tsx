/** Iniciales de un nombre («Tienda Luna» → «TL»). */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Avatar redondo con las iniciales sobre el degradado de la marca. */
export function Avatar({ letras, className }: { letras: string; className: string }) {
  return (
    <i
      className={`grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#3b82f6,#8b5cf6_60%,#d946ef)] font-titulo font-extrabold text-white not-italic ${className}`}
      aria-hidden="true"
    >
      {letras}
    </i>
  );
}
