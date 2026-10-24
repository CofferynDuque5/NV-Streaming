/** https:// + dominio (+ puerto) + ruta opcional, sin usuario ni clave, sin espacios ni comillas. */
const FORMA = /^https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?(?:\/[^\s"'<>#]*)?(?:#.*)?$/i;

/**
 * Enlaces entre los sistemas del ecosistema NV (la tienda y el Gestor). Solo
 * navegación: ningún sistema lee ni copia datos del otro. La dirección viene
 * de una variable de entorno; si no es un https:// limpio, no se muestra.
 */
export function enlaceEcosistema(valor: string | null | undefined): string | null {
  const texto = valor?.trim();
  if (!texto || !FORMA.test(texto)) return null;
  return texto.split('#')[0]!;
}
